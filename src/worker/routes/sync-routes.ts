/**
 * Storefront Synchronization & POS Order Inbox Routes (`/api/v1/sync/*`)
 *
 * Implements:
 * - POST /api/v1/sync/auth           : Authenticate sync source & issue scoped sync token
 * - POST /api/v1/sync/catalog-delta  : Accept versioned product delta with idempotency, branch stock & boundary stripping
 * - POST /api/v1/sync/catalog-snapshot: Accept approved catalog snapshot
 * - GET  /api/v1/sync/status         : Read sync status & failure diagnostics
 * - GET  /api/v1/sync/cursor         : Read last successful sync cursor
 * - GET  /api/v1/sync/orders/inbox   : Fetch online orders for safe POS Order Inbox review
 * - POST /api/v1/sync/orders/ack     : Idempotent POS order handoff & fulfillment acknowledgment
 */

import {
  STOREFRONT_SYNC_CONTRACT_VERSION,
  type PosOrderFulfillmentAckRequest,
  type PosOrderFulfillmentAckResponse,
  type PosOrderInboxItem,
  type PosOrderInboxLinePayload,
  type StorefrontCatalogDeltaItem,
  type StorefrontCatalogDeltaRequest,
  type StorefrontCatalogDeltaResponse,
} from "../../shared/pos-sync-contract";
import type {
  PosHandoffStatus,
  StorefrontOrderItemRecord,
  StorefrontOrderRecord,
  StorefrontOrderStatus,
  StorefrontPaymentStatus,
  StorefrontRecord,
  StorefrontSettingsRecord,
} from "../../shared/types";
import {
  computeNormalizedCoreKey,
  type ProductInput,
} from "../../shared/medicine-identity-matcher";
import { bumpStorefrontConfigVersion } from "../edge-cache-and-snapshots";
import { invalidateTenantBundleCache } from "../domain-resolver";
import {
  getCentralImageIndex,
  loadStorefrontCatalogDoc,
  matchProductAgainstCentralIndex,
  saveStorefrontCatalogDoc,
  syncStorefrontMetadataFromCatalogDoc,
  type R2CatalogProductRecord,
} from "../r2-catalog-store";

function resolveEffectiveOrderStatusSync(ord: Record<string, any>): StorefrontOrderStatus {
  const outcome = ord.fulfillment_outcome ? String(ord.fulfillment_outcome).trim() : "";
  if (outcome === "delivered" || outcome === "collected" || outcome === "returned") {
    return outcome as StorefrontOrderStatus;
  }
  if (ord.status === "completed") {
    return ord.fulfillment_type === "pickup" ? "collected" : "delivered";
  }
  return (ord.status || "pending_confirmation") as StorefrontOrderStatus;
}

function mapStatusToDbFields(
  requestedStatus: string,
  fulfillmentType: "delivery" | "pickup"
): { dbStatus: string; fulfillmentOutcome: string | null } {
  if (requestedStatus === "delivered") {
    return { dbStatus: "completed", fulfillmentOutcome: "delivered" };
  }
  if (requestedStatus === "collected") {
    return { dbStatus: "completed", fulfillmentOutcome: "collected" };
  }
  if (requestedStatus === "returned") {
    return { dbStatus: "completed", fulfillmentOutcome: "returned" };
  }
  if (requestedStatus === "completed") {
    return {
      dbStatus: "completed",
      fulfillmentOutcome: fulfillmentType === "pickup" ? "collected" : "delivered",
    };
  }
  return { dbStatus: requestedStatus, fulfillmentOutcome: null };
}
import { detectForbiddenPrivateKeys, toUrlSlug } from "../../shared/validation";
import type { D1Database, StorefrontWorkerEnv, WorkerExecutionContext } from "../env";
import {
  buildResponseHeaders,
  sha256Hex,
  signSyncToken,
  timingSafeEqualStr,
  verifyManagementAuth,
  verifySyncToken,
} from "../security";
import {
  recordBufferedSyncPollUsage,
  recordStorefrontUsage,
  sumD1MetaCounts,
  writeStorefrontAuditLog,
} from "../usage-tracker";

// ============================================================================
// Lightweight Per-Isolate Caches (Tenant-Scoped, Instant Invalidation on Writes)
// ============================================================================
const ORDER_NOTIF_CACHE_TTL_MS = 20_000;
const orderNotifCache = new Map<string, { expiresAt: number; payload: string }>();

export function invalidateOrderNotifCache(storefrontId: string, pharmacyId: string): void {
  orderNotifCache.delete(`${storefrontId}:${pharmacyId}`);
}

export async function recalculateStorefrontCatalogCounts(
  dbOrEnv: D1Database | StorefrontWorkerEnv,
  storefrontId: string,
  pharmacyId: string,
  options?: { skipCategories?: boolean }
): Promise<number> {
  if ("DB" in dbOrEnv) {
    const { doc } = await loadStorefrontCatalogDoc(dbOrEnv, storefrontId, pharmacyId, {
      hydrateCentralImages: false,
    });
    const res = await syncStorefrontMetadataFromCatalogDoc(dbOrEnv.DB, doc, {
      syncCategories: !options?.skipCategories,
    });
    return res.publishedCount;
  }

  // Fallback for direct D1 callers
  const row = await dbOrEnv
    .prepare(`SELECT published_products_count FROM storefronts WHERE id = ? AND pharmacy_id = ? LIMIT 1`)
    .bind(storefrontId, pharmacyId)
    .first<{ published_products_count: number }>();
  return Number(row?.published_products_count || 0);
}

export async function handleSyncRoutes(
  req: Request,
  env: StorefrontWorkerEnv,
  pathname: string,
  execCtx?: WorkerExecutionContext
): Promise<Response> {
  const url = new URL(req.url);
  const headers = buildResponseHeaders({ req, isPrivate: true });

  // 1. POST /api/v1/sync/auth — Authenticate sync source & issue scoped token
  if (pathname === "/api/v1/sync/auth" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers,
      });
    }

    const syncSecretHeader = req.headers.get("x-storefront-sync-secret") || body?.sync_secret || "";
    const expectedSecret = env.STOREFRONT_SYNC_SECRET || env.STOREFRONT_ADMIN_SECRET;

    let authorized = false;
    if (expectedSecret && syncSecretHeader && timingSafeEqualStr(String(syncSecretHeader), expectedSecret)) {
      authorized = true;
    } else {
      const mgmtAuth = await verifyManagementAuth(req, env);
      if ("actor" in mgmtAuth) {
        if (
          mgmtAuth.actor.scopedPharmacyId &&
          mgmtAuth.actor.scopedPharmacyId !== body?.pharmacy_id
        ) {
          return new Response(
            JSON.stringify({ ok: false, error: "cross_tenant_sync_forbidden" }),
            { status: 403, headers }
          );
        }
        authorized = true;
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized_sync_source" }),
        { status: 401, headers }
      );
    }

    const pharmacyId = String(body?.pharmacy_id || "").trim();
    const storefrontId = String(body?.storefront_id || "").trim();
    const branchId = String(body?.branch_id || "main").trim();

    if (!pharmacyId && !storefrontId) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_tenant_identity" }),
        { status: 400, headers }
      );
    }

    const sf = storefrontId
      ? await env.DB.prepare("SELECT * FROM storefronts WHERE id = ? AND pharmacy_id = ? LIMIT 1")
        .bind(storefrontId, pharmacyId)
        .first<StorefrontRecord>()
      : await env.DB.prepare("SELECT * FROM storefronts WHERE pharmacy_id = ? LIMIT 1")
        .bind(pharmacyId)
        .first<StorefrontRecord>();

    if (!sf) {
      return new Response(
        JSON.stringify({ ok: false, error: "storefront_not_found" }),
        { status: 404, headers }
      );
    }

    if (
      sf.status !== "active" ||
      Number(sf.website_enabled ?? 1) !== 1 ||
      sf.entitlement_status === "suspended" ||
      sf.entitlement_status === "expired" ||
      sf.entitlement_status === "none"
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "storefront_not_active",
          message: "Online storefront is not active or has been disabled by Super Admin.",
        }),
        { status: 403, headers }
      );
    }

    const cursorRow = await env.DB.prepare(
      `SELECT last_cursor, last_revision, last_sync_at
       FROM storefront_sync_cursors
       WHERE storefront_id = ? AND pharmacy_id = ? AND branch_id = ? AND stream_name = 'catalog'
       LIMIT 1`
    )
      .bind(sf.id, sf.pharmacy_id, branchId)
      .first<{ last_cursor: string; last_revision: number; last_sync_at: string }>();

    const tokenSecret = env.STOREFRONT_SYNC_SECRET || env.STOREFRONT_ADMIN_SECRET;
    const syncToken = await signSyncToken(
      {
        storefrontId: sf.id,
        pharmacyId: sf.pharmacy_id,
        branchId,
        licenseId: sf.license_id || undefined,
      },
      tokenSecret,
      3600
    );

    return new Response(
      JSON.stringify({
        ok: true,
        sync_token: syncToken,
        expires_in_seconds: 3600,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        branch_id: branchId,
        last_cursor: cursorRow?.last_cursor || null,
        last_revision: Number(cursorRow?.last_revision || 0),
        last_sync_at: cursorRow?.last_sync_at || null,
      }),
      { status: 200, headers }
    );
  }

  // Verify sync token (or management auth) for all remaining `/api/v1/sync/*` endpoints
  let actor: { storefrontId: string; pharmacyId: string; branchId: string };
  const syncAuth = await verifySyncToken(req, env);
  const isPosSyncToken = "actor" in syncAuth;
  if (isPosSyncToken) {
    actor = syncAuth.actor;
  } else {
    const mgmtAuth = await verifyManagementAuth(req, env);
    if ("error" in mgmtAuth) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized_sync", message: syncAuth.error }),
        { status: syncAuth.status, headers }
      );
    }
    const qPharm = url.searchParams.get("pharmacy_id") || "";
    const qSf = url.searchParams.get("storefront_id") || "";
    const targetPharm = mgmtAuth.actor.scopedPharmacyId || qPharm;
    const sfRow = qSf
      ? await env.DB.prepare("SELECT id, pharmacy_id FROM storefronts WHERE id = ? LIMIT 1")
        .bind(qSf)
        .first<{ id: string; pharmacy_id: string }>()
      : await env.DB.prepare("SELECT id, pharmacy_id FROM storefronts WHERE pharmacy_id = ? LIMIT 1")
        .bind(targetPharm)
        .first<{ id: string; pharmacy_id: string }>();

    if (
      !sfRow ||
      (mgmtAuth.actor.scopedPharmacyId && sfRow.pharmacy_id !== mgmtAuth.actor.scopedPharmacyId)
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden_or_missing_storefront" }),
        { status: 403, headers }
      );
    }
    actor = {
      storefrontId: sfRow.id,
      pharmacyId: sfRow.pharmacy_id,
      branchId: url.searchParams.get("branch_id") || "main",
    };
  }

  // Enforce live Super Admin active status on every POS `/api/v1/sync/*` call (blocks cached tokens immediately when disabled/suspended)
  const activeSfRow = await env.DB.prepare(
    "SELECT status, website_enabled, entitlement_status FROM storefronts WHERE id = ? AND pharmacy_id = ? LIMIT 1"
  )
    .bind(actor.storefrontId, actor.pharmacyId)
    .first<{ status: string; website_enabled: number; entitlement_status?: string }>();

  const isSuspendedOrMissing =
    !activeSfRow ||
    activeSfRow.status === "suspended" ||
    activeSfRow.entitlement_status === "suspended" ||
    activeSfRow.entitlement_status === "expired" ||
    activeSfRow.entitlement_status === "none";

  const isOrderEndpoint = pathname.startsWith("/api/v1/sync/orders/");
  const isPosBlockedInactive =
    isPosSyncToken &&
    (activeSfRow?.status === "disabled" ||
      (isOrderEndpoint &&
        (activeSfRow?.status !== "active" || Number(activeSfRow?.website_enabled ?? 1) !== 1)));

  if (isSuspendedOrMissing || isPosBlockedInactive) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "storefront_not_active",
        message: "Online storefront is disabled or suspended by Super Admin.",
      }),
      { status: 403, headers }
    );
  }

  // 2. GET /api/v1/sync/cursor
  if (pathname === "/api/v1/sync/cursor" && req.method === "GET") {
    const branchId = (url.searchParams.get("branch_id") || actor.branchId || "main").trim();
    const streamName = (url.searchParams.get("stream") || "catalog").trim();

    const row = await env.DB.prepare(
      `SELECT last_cursor, last_revision, last_event_id, last_sync_at
       FROM storefront_sync_cursors
       WHERE storefront_id = ? AND pharmacy_id = ? AND branch_id = ? AND stream_name = ?
       LIMIT 1`
    )
      .bind(actor.storefrontId, actor.pharmacyId, branchId, streamName)
      .first<Record<string, unknown>>();

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: actor.storefrontId,
        pharmacy_id: actor.pharmacyId,
        branch_id: branchId,
        stream_name: streamName,
        last_cursor: row?.last_cursor ?? null,
        last_revision: Number(row?.last_revision ?? 0),
        last_event_id: row?.last_event_id ?? null,
        last_sync_at: row?.last_sync_at ?? null,
      }),
      { status: 200, headers }
    );
  }

  // 3. GET /api/v1/sync/status
  if (pathname === "/api/v1/sync/status" && req.method === "GET") {
    const [sf, cursorsRes, eventsRes, failuresRes] = await Promise.all([
      env.DB.prepare(
        "SELECT id, pharmacy_id, status, published_products_count, last_sync_at FROM storefronts WHERE id = ? AND pharmacy_id = ? LIMIT 1"
      )
        .bind(actor.storefrontId, actor.pharmacyId)
        .first<StorefrontRecord>(),
      env.DB.prepare(
        "SELECT branch_id, stream_name, last_cursor, last_revision, last_sync_at FROM storefront_sync_cursors WHERE storefront_id = ? AND pharmacy_id = ?"
      )
        .bind(actor.storefrontId, actor.pharmacyId)
        .all(),
      env.DB.prepare(
        "SELECT id, idempotency_key, event_type, source_cursor, next_cursor, items_received, items_applied, items_rejected, status, created_at FROM storefront_sync_events WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY created_at DESC LIMIT 15"
      )
        .bind(actor.storefrontId, actor.pharmacyId)
        .all(),
      env.DB.prepare(
        "SELECT id, sync_event_id, pos_product_id, error_code, error_message, created_at FROM storefront_sync_failures WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY created_at DESC LIMIT 15"
      )
        .bind(actor.storefrontId, actor.pharmacyId)
        .all(),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: actor.storefrontId,
        pharmacy_id: actor.pharmacyId,
        published_products_count: Number(sf?.published_products_count || 0),
        last_sync_at: sf?.last_sync_at || null,
        cursors: cursorsRes.results || [],
        recent_events: eventsRes.results || [],
        recent_failures: failuresRes.results || [],
      }),
      { status: 200, headers }
    );
  }

  // 4. POST /api/v1/sync/catalog-delta & POST /api/v1/sync/catalog-snapshot
  if (
    (pathname === "/api/v1/sync/catalog-delta" ||
      pathname === "/api/v1/sync/catalog-snapshot") &&
    req.method === "POST"
  ) {
    let rawText = "";
    let body: StorefrontCatalogDeltaRequest;
    try {
      rawText = await req.text();
      body = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers,
      });
    }

    if (body.contract_version !== STOREFRONT_SYNC_CONTRACT_VERSION) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "unsupported_contract_version",
          message: `Expected contract_version '${STOREFRONT_SYNC_CONTRACT_VERSION}'.`,
        }),
        { status: 400, headers }
      );
    }

    try {
      // Strict tenant isolation check: body tenant_identity MUST match authenticated token claims
      if (
        !body.tenant_identity ||
        body.tenant_identity.storefront_id !== actor.storefrontId ||
        body.tenant_identity.pharmacy_id !== actor.pharmacyId
      ) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "tenant_mismatch",
            message: "Payload tenant_identity does not match authenticated sync token.",
          }),
          { status: 403, headers }
        );
      }

      const idempotencyKey = String(body.idempotency_key || "").trim();
      const nextCursor = String(body.next_cursor || "").trim();
      const branchId = String(body.branch_identity?.branch_id || actor.branchId || "main").trim();

      if (!idempotencyKey || !nextCursor || !Array.isArray(body.items)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "missing_required_fields",
            message: "idempotency_key, next_cursor, and items array are required.",
          }),
          { status: 400, headers }
        );
      }

      if (body.items.length > 1000) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "batch_too_large",
            message: "Maximum 1000 product delta items per request.",
          }),
          { status: 400, headers }
        );
      }

      const batchIndex = typeof body.batch_index === "number" ? body.batch_index : undefined;
      const totalBatches = typeof body.total_batches === "number" ? body.total_batches : undefined;
      const isIntermediateBatch =
        typeof batchIndex === "number" &&
        typeof totalBatches === "number" &&
        totalBatches > 1 &&
        batchIndex + 1 < totalBatches;

      const requestHash = await sha256Hex(rawText);

      // Check idempotency table (`storefront_import_idempotency`)
      const existingIdemp = await env.DB.prepare(
        `SELECT request_hash, response_json
       FROM storefront_import_idempotency
       WHERE storefront_id = ? AND idempotency_key = ?
       LIMIT 1`
      )
        .bind(actor.storefrontId, idempotencyKey)
        .first<{ request_hash: string; response_json: string }>();

      if (existingIdemp) {
        if (existingIdemp.request_hash !== requestHash) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "idempotency_key_conflict",
              message: "Idempotency key was already used with a different payload.",
            }),
            { status: 409, headers }
          );
        }
        const cachedResp = JSON.parse(existingIdemp.response_json) as StorefrontCatalogDeltaResponse;
        return new Response(
          JSON.stringify({ ...cachedResp, duplicate: true }),
          { status: 200, headers }
        );
      }

      const sf = await env.DB.prepare(
        "SELECT * FROM storefronts WHERE id = ? AND pharmacy_id = ? LIMIT 1"
      )
        .bind(actor.storefrontId, actor.pharmacyId)
        .first<StorefrontRecord>();

      if (!sf || sf.status === "suspended" || sf.entitlement_status === "suspended") {
        return new Response(
          JSON.stringify({ ok: false, error: "storefront_unavailable_or_suspended" }),
          { status: 403, headers }
        );
      }

      const settings = await env.DB.prepare(
        "SELECT * FROM storefront_settings WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1"
      )
        .bind(actor.storefrontId, actor.pharmacyId)
        .first<StorefrontSettingsRecord>();

      const allowControlled = Number(settings?.allow_controlled_medicines ?? 0) === 1;
      const syncEventId = `sfe_${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();

      // Option B R2-First Catalog Merge:
      // Loads the pharmacy's authoritative catalog from R2 (`live.json`) + Central Image Index in parallel.
      // ZERO D1 reads/writes on `storefront_products` or `storefront_product_visibility`!
      const [{ doc: catalogDoc }, centralIndex] = await Promise.all([
        loadStorefrontCatalogDoc(env, actor.storefrontId, actor.pharmacyId, {
          freshFromR2: true,
          hydrateCentralImages: false,
        }),
        getCentralImageIndex(env),
      ]);

      const existingByPosId = new Map<string, R2CatalogProductRecord>();
      const usedSlugs = new Set<string>();
      for (const p of catalogDoc.products) {
        existingByPosId.set(p.pos_product_id, p);
        if (p.slug) usedSlugs.add(p.slug);
      }

      let itemsApplied = 0;
      let itemsSkippedUnchanged = 0;
      let itemsWritten = 0;
      let itemsRejected = 0;
      let catalogTopologyChanged = false;
      const syncActualRowsRead = 3; // idempotency + storefront + settings
      const rejections: Array<{ pos_product_id: string; error_code: string; message: string }> = [];

      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i] as StorefrontCatalogDeltaItem;
        const posProdId = String(item?.pos_product_id || `idx_${i}`).trim();

        // 1. Strict Product Data Boundary Check (Section 7)
        const forbiddenKeys = detectForbiddenPrivateKeys(item);
        if (forbiddenKeys.length > 0) {
          itemsRejected++;
          const msg = `Forbidden private POS fields rejected at boundary: ${forbiddenKeys.join(", ")}`;
          rejections.push({
            pos_product_id: posProdId,
            error_code: "forbidden_private_fields",
            message: msg,
          });
          await env.DB.prepare(
            `INSERT INTO storefront_sync_failures (id, storefront_id, pharmacy_id, sync_event_id, pos_product_id, error_code, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, 'forbidden_private_fields', ?, ?)`
          )
            .bind(
              `sff_${crypto.randomUUID()}`,
              actor.storefrontId,
              actor.pharmacyId,
              syncEventId,
              posProdId,
              msg,
              nowIso
            )
            .run();
          continue;
        }

        const existingProd = existingByPosId.get(posProdId);
        const rev = Number(item?.source_revision ?? 1);
        if (existingProd && Number(existingProd.sync_version) > rev) {
          itemsApplied++;
          continue;
        }

        // Handle soft product deletion / archiving from POS
        if (item.is_deleted || item.website_visibility === "archived") {
          if (existingProd) {
            if (existingProd.publish_status !== "archived") {
              catalogTopologyChanged = true;
            }
            existingProd.publish_status = "archived";
            existingProd.availability_status = "unavailable";
            existingProd.available_qty = 0;
            existingProd.available_base_qty = 0;
            existingProd.deleted_at = nowIso;
            existingProd.sync_version = rev;
            existingProd.last_synced_at = nowIso;
            existingProd.updated_at = nowIso;
            itemsWritten++;
          }
          itemsApplied++;
          continue;
        }

        const name = String(item?.product_identity?.name || "").trim();
        const price = Number(item?.public_selling_price_pkr);

        if (!posProdId || !name || !Number.isFinite(price) || price < 0) {
          itemsRejected++;
          const msg = "Invalid product identity or negative public selling price.";
          rejections.push({
            pos_product_id: posProdId,
            error_code: "invalid_product_fields",
            message: msg,
          });
          continue;
        }

        const isControlled = Boolean(item.product_identity.is_controlled_substance);
        let effectivePublishStatus = item.website_visibility || existingProd?.publish_status || "draft";

        if (isControlled && !allowControlled) {
          effectivePublishStatus = "unpublished";
        } else if (
          Number(settings?.auto_unpublish_zero_stock) === 1 &&
          item.availability === "out_of_stock"
        ) {
          effectivePublishStatus = "unpublished";
        } else if (
          (settings?.publishing_mode === "in_stock_approved" ||
            Number((settings as any)?.auto_sync_all_products ?? 0) === 1) &&
          !isControlled &&
          item.availability !== "out_of_stock" &&
          String(effectivePublishStatus) !== "archived" &&
          !item.is_deleted
        ) {
          effectivePublishStatus = "published";
        }

        // Merge per-branch availability without aggregating across branches
        let branchStockMap: Record<string, any> = {};
        try {
          branchStockMap = existingProd?.branch_stock_json
            ? JSON.parse(existingProd.branch_stock_json)
            : {};
        } catch {
          branchStockMap = {};
        }

        if (item.branch_availability && typeof item.branch_availability === "object") {
          branchStockMap = { ...branchStockMap, ...item.branch_availability };
        } else {
          branchStockMap[branchId] = {
            branch_id: branchId,
            availability_status: item.availability || "in_stock",
            available_qty: Math.max(0, Number(item.available_qty ?? 0)),
            updated_at: nowIso,
          };
        }

        // Resolve image in O(1) memory via R2 Central Image Index (preserves owner_override!)
        let resolvedImageUrl =
          item.product_identity.primary_image_url || existingProd?.primary_image_url || null;
        let canonicalMedicineId: string | null = existingProd?.canonical_medicine_id || null;
        let selectedMediaId: string | null = existingProd?.selected_media_id || null;
        let imageSource: string = existingProd?.image_source || "none";

        if (item.product_identity.primary_image_url) {
          imageSource = "owner_override";
          resolvedImageUrl = item.product_identity.primary_image_url;
        } else if (imageSource !== "owner_override") {
          const prodInput: ProductInput = {
            name,
            generic_name: item.product_identity.generic_name || null,
            strength: item.product_identity.strength || null,
            dosage_form: item.product_identity.dosage_form || null,
            brand_name: item.product_identity.brand_name || null,
            packing_label: item.product_identity.packing_label || null,
            unit_label: item.product_identity.unit_label || null,
            sku_code: item.product_identity.sku_code || null,
            barcode: item.product_identity.sku_code || null,
            master_medicine_id: item.product_identity.master_medicine_id || null,
          };
          const matchRes = matchProductAgainstCentralIndex(prodInput, centralIndex);
          if (matchRes.matched && matchRes.canonicalId && matchRes.imageUrl) {
            resolvedImageUrl = matchRes.imageUrl;
            canonicalMedicineId = matchRes.canonicalId;
            selectedMediaId = matchRes.mediaId;
            imageSource = "shared_library";
          } else if (imageSource === "shared_library") {
            resolvedImageUrl = null;
            canonicalMedicineId = null;
            selectedMediaId = null;
            imageSource = "none";
          }
        }

        const prodId = existingProd?.id || `sfp_${crypto.randomUUID()}`;
        let prodSlug = existingProd?.slug || toUrlSlug(name, posProdId);
        if (!existingProd) {
          if (usedSlugs.has(prodSlug)) {
            prodSlug = `${prodSlug}-${crypto.randomUUID().slice(0, 6)}`;
          }
          usedSlugs.add(prodSlug);
        }

        const categoryName =
          String(item.product_identity.category_name || existingProd?.category_name || "General Medicines").trim() ||
          "General Medicines";
        if (
          !existingProd ||
          existingProd.publish_status !== effectivePublishStatus ||
          Number(existingProd.is_controlled_substance || 0) !== (isControlled ? 1 : 0) ||
          String(existingProd.category_name || "General Medicines").trim() !== categoryName
        ) {
          catalogTopologyChanged = true;
        }

        const searchKeywords = [
          name,
          item.product_identity.generic_name,
          item.product_identity.brand_name,
          item.product_identity.strength,
          item.product_identity.dosage_form,
          categoryName,
          item.product_identity.sku_code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const baseUnitLabel = String(
          item.base_unit_label || item.product_identity.unit_label || "unit"
        ).trim();
        const availableBaseQty = Math.max(
          0,
          Number(item.available_base_qty ?? item.available_qty ?? 0)
        );
        const sellingUnitsJson = Array.isArray(item.selling_units)
          ? JSON.stringify(item.selling_units)
          : existingProd?.selling_units_json || "[]";
        const normalizedCoreKey =
          computeNormalizedCoreKey(name) || existingProd?.normalized_core_key || null;
        const incomingAvailStatus = item.availability || "in_stock";
        const incomingAvailQty = Math.max(0, Number(item.available_qty ?? 0));

        const isUnchangedDelta =
          Boolean(existingProd) &&
          String(existingProd!.name || "") === name &&
          Math.abs(Number(existingProd!.public_selling_price_pkr ?? -1) - price) < 0.005 &&
          String(existingProd!.availability_status || "") === incomingAvailStatus &&
          Math.abs(Number(existingProd!.available_qty ?? -1) - incomingAvailQty) < 0.0001 &&
          Math.abs(Number(existingProd!.available_base_qty ?? -1) - availableBaseQty) < 0.0001 &&
          String(existingProd!.publish_status || "") === effectivePublishStatus &&
          String(existingProd!.category_name || "General Medicines").trim() === categoryName &&
          String(existingProd!.primary_image_url || "") === String(resolvedImageUrl || "") &&
          String(existingProd!.image_source || "none") === imageSource &&
          (sellingUnitsJson === "[]" || String(existingProd!.selling_units_json || "[]") === sellingUnitsJson) &&
          Boolean(existingProd!.normalized_core_key);

        if (isUnchangedDelta) {
          itemsApplied++;
          itemsSkippedUnchanged++;
          continue;
        }

        const updatedRecord: R2CatalogProductRecord = {
          id: prodId,
          storefront_id: actor.storefrontId,
          pharmacy_id: actor.pharmacyId,
          pos_product_id: posProdId,
          master_medicine_id:
            item.product_identity.master_medicine_id || existingProd?.master_medicine_id || null,
          sku_code: item.product_identity.sku_code || existingProd?.sku_code || null,
          slug: prodSlug,
          name,
          generic_name: item.product_identity.generic_name || existingProd?.generic_name || null,
          strength: item.product_identity.strength || existingProd?.strength || null,
          dosage_form: item.product_identity.dosage_form || existingProd?.dosage_form || null,
          brand_name: item.product_identity.brand_name || existingProd?.brand_name || null,
          packing_label: item.product_identity.packing_label || existingProd?.packing_label || null,
          unit_label: item.product_identity.unit_label || "Pack",
          base_unit_label: baseUnitLabel,
          selling_units_json: sellingUnitsJson,
          public_description:
            existingProd?.public_description || item.product_identity.public_description || null,
          public_selling_price_pkr: price,
          compare_at_price_pkr:
            item.compare_at_price_pkr ?? existingProd?.compare_at_price_pkr ?? null,
          override_price_pkr: existingProd?.override_price_pkr ?? null,
          availability_status: incomingAvailStatus,
          available_qty: incomingAvailQty,
          available_base_qty: availableBaseQty,
          branch_stock_json: JSON.stringify(branchStockMap),
          category_name: categoryName,
          primary_image_url:
            existingProd?.image_source === "owner_override"
              ? existingProd.primary_image_url
              : resolvedImageUrl,
          image_source:
            existingProd?.image_source === "owner_override"
              ? "owner_override"
              : imageSource,
          selected_media_id:
            existingProd?.image_source === "owner_override"
              ? existingProd.selected_media_id
              : selectedMediaId,
          canonical_medicine_id:
            existingProd?.image_source === "owner_override"
              ? existingProd.canonical_medicine_id
              : canonicalMedicineId,
          normalized_core_key: normalizedCoreKey,
          search_keywords: searchKeywords,
          publish_status: effectivePublishStatus,
          requires_prescription: item.product_identity.requires_prescription ? 1 : 0,
          is_controlled_substance: isControlled ? 1 : 0,
          is_featured: item.is_featured || existingProd?.is_featured ? 1 : 0,
          is_popular: item.is_popular || existingProd?.is_popular ? 1 : 0,
          max_order_qty: Math.max(1, Number(item.max_order_qty ?? existingProd?.max_order_qty ?? 20)),
          sync_version: rev,
          deleted_at: null,
          last_synced_at: nowIso,
          created_at: existingProd?.created_at || nowIso,
          updated_at: nowIso,
          ...(existingProd?.gallery_images ? { gallery_images: existingProd.gallery_images } : {}),
        };

        existingByPosId.set(posProdId, updatedRecord);
        itemsWritten++;
        itemsApplied++;
      }

      // In-memory starter-row cleanup & single-batch full-snapshot reconciliation (0 D1 scans!)
      const shouldCheckStarterRows =
        Boolean(body.full_snapshot) ||
        pathname === "/api/v1/sync/catalog-snapshot" ||
        Number(sf.published_products_count || 0) <= 10;

      if (shouldCheckStarterRows && itemsApplied > 0) {
        const syncedPosIds = new Set(
          body.items.map((it) => String(it?.pos_product_id || "").trim()).filter(Boolean)
        );
        for (const p of existingByPosId.values()) {
          if (
            p.publish_status === "published" &&
            (p.pos_product_id.startsWith("POS-MED-") || p.pos_product_id.startsWith("PORTAL-ITEM-")) &&
            !syncedPosIds.has(p.pos_product_id)
          ) {
            p.publish_status = "unpublished";
            p.updated_at = nowIso;
            catalogTopologyChanged = true;
            itemsWritten++;
          }
        }

        if (
          ((body as any).auto_approve_all === true || body.full_snapshot === true) &&
          Number(body.total_batches || 1) === 1 &&
          syncedPosIds.size > 0
        ) {
          for (const p of existingByPosId.values()) {
            if (p.publish_status === "published" && !syncedPosIds.has(p.pos_product_id)) {
              p.publish_status = "archived";
              p.availability_status = "unavailable";
              p.available_qty = 0;
              p.deleted_at = nowIso;
              p.updated_at = nowIso;
              catalogTopologyChanged = true;
              itemsWritten++;
            }
          }
        }
      }

      // Persist authoritative catalog to R2 (`storefront-catalogs/{sfId}/live.json`) — 1 R2 write, 0 D1 product writes!
      catalogDoc.products = Array.from(existingByPosId.values());
      catalogDoc.last_sync_at = nowIso;
      catalogDoc.central_index_version = centralIndex.doc.version;
      if (itemsWritten > 0 || catalogTopologyChanged || !isIntermediateBatch) {
        await saveStorefrontCatalogDoc(env, catalogDoc);
      }

      const publishedCount = catalogDoc.published_count;

      // On final batch (or single batch), update `storefronts` metadata + categories in minimal D1 writes (~1-4 writes total!)
      if (!isIntermediateBatch) {
        await syncStorefrontMetadataFromCatalogDoc(env.DB, catalogDoc, {
          bumpConfigVersion: itemsWritten > 0 || catalogTopologyChanged,
          updateLastSyncAt: nowIso,
          syncCategories:
            catalogTopologyChanged ||
            Boolean(body.full_snapshot) ||
            pathname === "/api/v1/sync/catalog-snapshot",
        });
        invalidateTenantBundleCache(actor.storefrontId);
      } else if (itemsWritten > 0) {
        await env.DB.prepare(
          `UPDATE storefronts SET published_products_count = ?, last_sync_at = ?, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
        )
          .bind(publishedCount, nowIso, nowIso, actor.storefrontId, actor.pharmacyId)
          .run();
      }
      void itemsSkippedUnchanged;

      // Advance sync cursor
      await env.DB.prepare(
        `INSERT INTO storefront_sync_cursors (
         id, storefront_id, pharmacy_id, branch_id, stream_name,
         last_cursor, last_revision, last_event_id, last_sync_at, updated_at
       ) VALUES (?, ?, ?, ?, 'catalog', ?, 1, ?, ?, ?)
       ON CONFLICT(storefront_id, branch_id, stream_name) DO UPDATE SET
         last_cursor = excluded.last_cursor,
         last_revision = storefront_sync_cursors.last_revision + 1,
         last_event_id = excluded.last_event_id,
         last_sync_at = excluded.last_sync_at,
         updated_at = excluded.updated_at`
      )
        .bind(
          `sfc_${crypto.randomUUID()}`,
          actor.storefrontId,
          actor.pharmacyId,
          branchId,
          nextCursor,
          syncEventId,
          nowIso,
          nowIso
        )
        .run();

      const eventType =
        pathname === "/api/v1/sync/catalog-snapshot" ? "catalog_snapshot" : "catalog_delta";
      const status =
        itemsRejected === 0
          ? "completed"
          : itemsApplied > 0
            ? "partial"
            : "failed";

      const responsePayload: StorefrontCatalogDeltaResponse = {
        ok: true,
        duplicate: false,
        sync_event_id: syncEventId,
        storefront_id: actor.storefrontId,
        pharmacy_id: actor.pharmacyId,
        branch_id: branchId,
        applied_cursor: nextCursor,
        items_received: body.items.length,
        items_applied: itemsApplied,
        items_rejected: itemsRejected,
        published_products_count: publishedCount,
        ...(typeof batchIndex === "number" ? { batch_index: batchIndex } : {}),
        ...(typeof totalBatches === "number" ? { total_batches: totalBatches } : {}),
        ...(rejections.length > 0 ? { rejections } : {}),
      };

      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      // Batch sync event + idempotency in 1 single D1 round-trip
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO storefront_sync_events (
           id, storefront_id, pharmacy_id, branch_id, idempotency_key,
           event_type, source_cursor, next_cursor,
           items_received, items_applied, items_rejected, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          syncEventId,
          actor.storefrontId,
          actor.pharmacyId,
          branchId,
          idempotencyKey,
          eventType,
          body.source_cursor || null,
          nextCursor,
          body.items.length,
          itemsApplied,
          itemsRejected,
          status,
          nowIso
        ),
        env.DB.prepare(
          `INSERT INTO storefront_import_idempotency (
           storefront_id, pharmacy_id, idempotency_key, request_hash, response_json, created_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          actor.storefrontId,
          actor.pharmacyId,
          idempotencyKey,
          requestHash,
          JSON.stringify(responsePayload),
          nowIso,
          expiresAt
        ),
      ]);

      if (!isIntermediateBatch) {
        await recordStorefrontUsage(env.DB, {
          storefrontId: actor.storefrontId,
          pharmacyId: actor.pharmacyId,
          syncRequests: 1,
          d1RowsReadEst: syncActualRowsRead,
          d1RowsWrittenEst: 4,
          r2ClassAOps: 1,
        });

        await writeStorefrontAuditLog(env.DB, {
          storefrontId: actor.storefrontId,
          pharmacyId: actor.pharmacyId,
          action: `catalog_sync_${eventType}`,
          actorType: "pos_sync",
          actorId: branchId,
          entityType: "catalog",
          entityId: syncEventId,
          summary: `Synced ${itemsApplied} catalog items to R2 (${itemsRejected} rejected); ${publishedCount} total published.`,
          metadata: {
            idempotency_key: idempotencyKey,
            next_cursor: nextCursor,
            items_received: body.items.length,
            items_applied: itemsApplied,
            items_rejected: itemsRejected,
            storage_engine: "r2_first_v2",
          },
        });
      }

      return new Response(JSON.stringify(responsePayload), { status: 200, headers });
    } catch (syncErr: any) {
      console.error("[SyncRoutes] Catalog delta sync processing error:", syncErr);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "catalog_sync_error",
          message: syncErr?.message || "Internal error during catalog synchronization.",
        }),
        { status: 500, headers }
      );
    }
  }

  // ── 4b. GET /api/v1/sync/orders/notifications — Lightweight Adaptive Notification Poll ──
  if (
    (pathname === "/api/v1/sync/orders/notifications" ||
      (pathname === "/api/v1/sync/orders/inbox" && url.searchParams.get("summary_only") === "1")) &&
    req.method === "GET"
  ) {
    const cacheKey = `${actor.storefrontId}:${actor.pharmacyId}`;
    const cached = orderNotifCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(cached.payload, { status: 200, headers });
    }

    // Single indexed query over ACTIVE orders only (never scans completed/cancelled historical orders!)
    const activeRes = await env.DB.prepare(
      `SELECT id AS order_id, order_number, customer_name, customer_phone, fulfillment_type,
              total_pkr, status, COALESCE(payment_status, 'unpaid') AS payment_status,
              COALESCE(pos_handoff_status, 'pending') AS pos_handoff_status,
              created_at, updated_at
       FROM storefront_orders
       WHERE storefront_id = ? AND pharmacy_id = ?
         AND status NOT IN ('completed', 'cancelled', 'rejected')
       ORDER BY created_at DESC
       LIMIT 30`
    )
      .bind(actor.storefrontId, actor.pharmacyId)
      .all<Record<string, unknown>>();

    const activeRows = activeRes.results || [];
    const activeAttentionCount = activeRows.length;
    let pendingConfirmationCount = 0;
    let unreadHandoffCount = 0;
    let latestUpdatedAt: string | null = null;

    for (const row of activeRows) {
      if (row.status === "pending_confirmation") pendingConfirmationCount++;
      if ((row.pos_handoff_status || "pending") === "pending") unreadHandoffCount++;
      const upd = row.updated_at ? String(row.updated_at) : null;
      if (upd && (!latestUpdatedAt || upd > latestUpdatedAt)) {
        latestUpdatedAt = upd;
      }
    }

    const recentNewOrders = activeRows.slice(0, 8);
    const { rowsRead: pollRowsRead } = sumD1MetaCounts([activeRes as any], {
      rowsRead: Math.max(1, activeRows.length),
    });

    await recordBufferedSyncPollUsage(env.DB, actor.storefrontId, actor.pharmacyId, pollRowsRead);

    const serialized = JSON.stringify({
      ok: true,
      storefront_id: actor.storefrontId,
      pharmacy_id: actor.pharmacyId,
      active_attention_count: activeAttentionCount,
      new_unacknowledged_count: pendingConfirmationCount,
      pending_confirmation_count: pendingConfirmationCount,
      unread_handoff_count: unreadHandoffCount,
      latest_updated_at: latestUpdatedAt,
      recent_orders: recentNewOrders,
      latest_orders: recentNewOrders,
    });

    orderNotifCache.set(cacheKey, {
      expiresAt: Date.now() + ORDER_NOTIF_CACHE_TTL_MS,
      payload: serialized,
    });

    return new Response(serialized, { status: 200, headers });
  }

  // ── 5. GET /api/v1/sync/orders/inbox — Safe External Order Inbox & History for POS ──
  if (pathname === "/api/v1/sync/orders/inbox" && req.method === "GET") {
    const viewFilter = (url.searchParams.get("view") || "all").trim().toLowerCase();
    const statusFilter = (url.searchParams.get("status") || "").trim();
    const handoffFilter = (url.searchParams.get("handoff_status") || "").trim();
    const fulfillmentFilter = (url.searchParams.get("fulfillment_type") || "").trim();
    const fromDate = (url.searchParams.get("from") || "").trim();
    const toDate = (url.searchParams.get("to") || "").trim();
    const searchQ = (url.searchParams.get("q") || url.searchParams.get("search") || "")
      .trim()
      .toLowerCase();
    const includeHistory = url.searchParams.get("include_history") !== "0";
    const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit")) || 120));

    let sql = `
      SELECT *
      FROM storefront_orders
      WHERE storefront_id = ? AND pharmacy_id = ?
    `;
    const params: unknown[] = [actor.storefrontId, actor.pharmacyId];

    if (viewFilter === "active") {
      sql += ` AND status NOT IN ('completed', 'cancelled', 'rejected')`;
    } else if (viewFilter === "history") {
      sql += ` AND status IN ('completed', 'cancelled', 'rejected')`;
    }

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "delivered") {
        sql += ` AND status = 'completed' AND (fulfillment_outcome = 'delivered' OR (fulfillment_outcome IS NULL AND fulfillment_type = 'delivery'))`;
      } else if (statusFilter === "collected") {
        sql += ` AND status = 'completed' AND (fulfillment_outcome = 'collected' OR (fulfillment_outcome IS NULL AND fulfillment_type = 'pickup'))`;
      } else if (statusFilter === "returned") {
        sql += ` AND status = 'completed' AND fulfillment_outcome = 'returned'`;
      } else {
        sql += ` AND status = ?`;
        params.push(statusFilter);
      }
    }
    if (handoffFilter && handoffFilter !== "all") {
      sql += ` AND COALESCE(pos_handoff_status, 'pending') = ?`;
      params.push(handoffFilter);
    }
    if (fulfillmentFilter === "delivery" || fulfillmentFilter === "pickup") {
      sql += ` AND fulfillment_type = ?`;
      params.push(fulfillmentFilter);
    }
    if (fromDate) {
      sql += ` AND created_at >= ?`;
      params.push(fromDate);
    }
    if (toDate) {
      sql += ` AND created_at <= ?`;
      params.push(toDate);
    }
    if (searchQ) {
      const pattern = `%${searchQ}%`;
      sql += ` AND (LOWER(order_number) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_phone) LIKE ? OR LOWER(COALESCE(pos_invoice_number, '')) LIKE ?)`;
      params.push(pattern, pattern, pattern, pattern);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const ordersRes = await env.DB.prepare(sql)
      .bind(...params)
      .all<StorefrontOrderRecord>();
    const orderRows = ordersRes.results || [];
    const trackedMetaResponses: Array<{ meta?: { rows_read?: number; rows_written?: number } }> = [
      ordersRes as any,
    ];

    // Batch-load order items & status history (eliminates N+1 queries AND the 2,200-row full-catalog SKU scan!)
    const itemsByOrderId = new Map<string, StorefrontOrderItemRecord[]>();
    const historyByOrderId = new Map<string, any[]>();
    const missingSkuProductIds = new Set<string>();

    const orderIds = orderRows.map((o) => o.id).filter(Boolean);
    const IN_CHUNK = 40;
    for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
      const chunk = orderIds.slice(i, i + IN_CHUNK);
      const ph = chunk.map(() => "?").join(", ");
      const itemsBatchRes = await env.DB.prepare(
        `SELECT * FROM storefront_order_items
         WHERE storefront_id = ? AND pharmacy_id = ? AND order_id IN (${ph})
         ORDER BY created_at ASC`
      )
        .bind(actor.storefrontId, actor.pharmacyId, ...chunk)
        .all<StorefrontOrderItemRecord>();
      trackedMetaResponses.push(itemsBatchRes as any);

      for (const it of itemsBatchRes.results || []) {
        const list = itemsByOrderId.get(it.order_id) || [];
        list.push(it);
        itemsByOrderId.set(it.order_id, list);
        if (!(it as any).sku_code_snapshot && it.product_id) {
          missingSkuProductIds.add(String(it.product_id));
        }
      }

      if (includeHistory) {
        const histBatchRes = await env.DB.prepare(
          `SELECT id, order_id, from_status, to_status, actor_type, actor_id, note, created_at
           FROM storefront_order_status_history
           WHERE storefront_id = ? AND pharmacy_id = ? AND order_id IN (${ph})
           ORDER BY created_at ASC`
        )
          .bind(actor.storefrontId, actor.pharmacyId, ...chunk)
          .all<any>();
        trackedMetaResponses.push(histBatchRes as any);

        for (const h of histBatchRes.results || []) {
          const list = historyByOrderId.get(String(h.order_id)) || [];
          list.push(h);
          historyByOrderId.set(String(h.order_id), list);
        }
      }
    }

    // Lookup SKU codes from R2-First catalog doc if any order line missed a snapshot SKU (0 D1 reads!)
    const skuBySfProdId = new Map<string, string | null>();
    if (missingSkuProductIds.size > 0) {
      try {
        const { doc } = await loadStorefrontCatalogDoc(env, actor.storefrontId, actor.pharmacyId, {
          hydrateCentralImages: false,
        });
        for (const pr of doc.products) {
          if (missingSkuProductIds.has(pr.id)) {
            skuBySfProdId.set(pr.id, pr.sku_code);
          }
        }
      } catch {
        // Non-fatal
      }
    }

    const inboxOrders: PosOrderInboxItem[] = [];
    for (const ord of orderRows) {
      const ordItems = itemsByOrderId.get(ord.id) || [];
      const normalizedItems: PosOrderInboxLinePayload[] = ordItems.map((it: any) => {
        const unitMult = Math.max(0.0001, Number(it.unit_multiplier || 1));
        const qtyVal = Math.max(1, Number(it.qty || 1));
        const baseQtyReq = Number(
          (it.base_qty_required !== null && it.base_qty_required !== undefined
            ? Number(it.base_qty_required)
            : qtyVal * unitMult
          ).toFixed(4)
        );
        const unitLabelStr = String(it.unit_label_snapshot || "unit");
        const sellingUnitNameStr = String(it.selling_unit_name || unitLabelStr);
        const skuCodeVal =
          it.sku_code_snapshot || skuBySfProdId.get(String(it.product_id)) || null;
        const prodNameStr = String(it.product_name_snapshot || "Ordered Medicine");

        return {
          ...it,
          order_item_id: String(it.id),
          product_name: prodNameStr,
          unit_label: unitLabelStr,
          packing_label: unitLabelStr,
          sku_code: skuCodeVal,
          selling_unit_id: it.selling_unit_id ? String(it.selling_unit_id) : null,
          selling_unit_name: sellingUnitNameStr,
          unit_multiplier: unitMult,
          qty: qtyVal,
          base_qty_required: baseQtyReq,
          unit_price_pkr: Number(it.unit_price_pkr || 0),
          line_total_pkr: Number(it.line_total_pkr || 0),
          requires_prescription: Number(it.requires_prescription) ? 1 : 0,
        };
      });

      const historyRows = includeHistory ? historyByOrderId.get(ord.id) || [] : undefined;

      const effectiveStatus = resolveEffectiveOrderStatusSync(ord as any);
      const effectivePaymentStatus: StorefrontPaymentStatus =
        ((ord as any).payment_status as StorefrontPaymentStatus) ||
        (ord.payment_method === "cod" ? "pending_cod" : "unpaid");

      inboxOrders.push({
        order_id: ord.id,
        order_number: ord.order_number,
        storefront_id: ord.storefront_id,
        pharmacy_id: ord.pharmacy_id,
        branch_id: ord.branch_id || "main",
        branch_name_snapshot: (ord as any).branch_name_snapshot || null,
        status: effectiveStatus,
        payment_status: effectivePaymentStatus,
        pos_handoff_status: (ord.pos_handoff_status || "pending") as PosHandoffStatus,
        customer_name: ord.customer_name,
        customer_phone: ord.customer_phone,
        customer_email: ord.customer_email || null,
        fulfillment_type: ord.fulfillment_type,
        delivery_address: ord.delivery_address || null,
        delivery_city: ord.delivery_city || null,
        delivery_instructions: (ord as any).delivery_instructions || ord.customer_notes || null,
        payment_method: ord.payment_method,
        subtotal_pkr: Number(ord.subtotal_pkr || 0),
        delivery_fee_pkr: Number(ord.delivery_fee_pkr || 0),
        discount_pkr: Number(ord.discount_pkr || 0),
        total_pkr: Number(ord.total_pkr || 0),
        cod_paid_amount_pkr: Number((ord as any).cod_paid_amount_pkr || 0),
        cod_balance_due_pkr:
          (ord as any).cod_balance_due_pkr !== null && (ord as any).cod_balance_due_pkr !== undefined
            ? Number((ord as any).cod_balance_due_pkr)
            : ord.payment_method === "cod" && effectivePaymentStatus !== "paid"
              ? Math.max(0, Number(ord.total_pkr || 0) - Number((ord as any).cod_paid_amount_pkr || 0))
              : 0,
        cod_last_collection_at: (ord as any).cod_last_collection_at || null,
        cod_collections_json: (ord as any).cod_collections_json || null,
        requires_prescription: Number(ord.requires_prescription) === 1,
        rx_inquiry_note: ord.rx_inquiry_note || null,
        customer_notes: ord.customer_notes || null,
        fulfillment_notes: (ord as any).fulfillment_notes || null,
        fulfilled_adjustments_json: (ord as any).fulfilled_adjustments_json || null,
        pos_order_ref: ord.pos_order_ref || null,
        pos_invoice_id: ord.pos_invoice_id || null,
        pos_invoice_number: ord.pos_invoice_number || null,
        pos_fulfilled_at: ord.pos_fulfilled_at || null,
        pos_fulfilled_by: ord.pos_fulfilled_by || null,
        created_at: ord.created_at,
        updated_at: ord.updated_at,
        items: normalizedItems,
        ...(historyRows
          ? {
            history: historyRows,
            status_history: historyRows.map((h: any) => ({
              id: h.id,
              from_status: h.from_status ?? null,
              to_status: h.to_status,
              previous_status: h.from_status ?? null,
              new_status: h.to_status,
              changed_by_role: h.actor_type || "pos",
              changed_by_label: h.actor_id || null,
              note: h.note || null,
              created_at: h.created_at,
            })),
          }
          : {}),
      });
    }

    const { rowsRead: inboxRowsRead } = sumD1MetaCounts(trackedMetaResponses, {
      rowsRead: Math.max(1, inboxOrders.length * 2),
    });

    await recordStorefrontUsage(env.DB, {
      storefrontId: actor.storefrontId,
      pharmacyId: actor.pharmacyId,
      syncRequests: 1,
      d1RowsReadEst: inboxRowsRead,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: actor.storefrontId,
        pharmacy_id: actor.pharmacyId,
        orders: inboxOrders,
      }),
      { status: 200, headers }
    );
  }

  // ── 6. POST /api/v1/sync/orders/ack — Idempotent POS Order Handoff & Lifecycle Sync ──
  if (pathname === "/api/v1/sync/orders/ack" && req.method === "POST") {
    let rawText = "";
    let body: PosOrderFulfillmentAckRequest;
    try {
      rawText = await req.text();
      body = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers,
      });
    }

    const idempotencyKey = String(body.idempotency_key || "").trim();
    const orderId = String(body.order_id || "").trim();
    const action = body.action;

    if (!idempotencyKey || !orderId || !action) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "missing_required_fields",
          message: "idempotency_key, order_id, and action are required.",
        }),
        { status: 400, headers }
      );
    }

    const requestHash = await sha256Hex(rawText);
    const existingIdemp = await env.DB.prepare(
      `SELECT request_hash, response_json
       FROM storefront_import_idempotency
       WHERE storefront_id = ? AND idempotency_key = ?
       LIMIT 1`
    )
      .bind(actor.storefrontId, idempotencyKey)
      .first<{ request_hash: string; response_json: string }>();

    if (existingIdemp) {
      if (existingIdemp.request_hash !== requestHash) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "idempotency_key_conflict",
            message: "Idempotency key was already used with a different POS handoff payload.",
          }),
          { status: 409, headers }
        );
      }
      const cached = JSON.parse(existingIdemp.response_json) as PosOrderFulfillmentAckResponse;
      return new Response(JSON.stringify({ ...cached, duplicate: true }), {
        status: 200,
        headers,
      });
    }

    const ord = await env.DB.prepare(
      `SELECT * FROM storefront_orders
       WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?
       LIMIT 1`
    )
      .bind(orderId, actor.storefrontId, actor.pharmacyId)
      .first<StorefrontOrderRecord>();

    if (!ord) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "order_not_found",
          message: "Online order not found for this pharmacy.",
        }),
        { status: 404, headers }
      );
    }

    // Prevent duplicate invoicing if already linked to a different POS invoice
    if (
      (action === "mark_fulfilled" || action === "link_pos_invoice") &&
      ord.pos_invoice_number &&
      body.pos_invoice_number &&
      ord.pos_invoice_number !== body.pos_invoice_number
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "order_already_invoiced",
          message: `Order ${ord.order_number} is already linked to POS invoice ${ord.pos_invoice_number}. Duplicate invoicing blocked.`,
        }),
        { status: 409, headers }
      );
    }

    const nowIso = new Date().toISOString();
    const prevDisplayStatus = resolveEffectiveOrderStatusSync(ord as any);
    const prevPaymentStatus: StorefrontPaymentStatus =
      ((ord as any).payment_status as StorefrontPaymentStatus) ||
      (ord.payment_method === "cod" ? "pending_cod" : "unpaid");
    const prevCodPaid = Number((ord as any).cod_paid_amount_pkr || 0);
    const prevInvoiceNumber = ord.pos_invoice_number || null;

    let dbStatus = String(ord.status);
    let fulfillmentOutcome: string | null = (ord as any).fulfillment_outcome || null;
    let nextPaymentStatus: StorefrontPaymentStatus = body.payment_status || prevPaymentStatus;
    let nextHandoffStatus: PosHandoffStatus = (ord.pos_handoff_status || "pending") as PosHandoffStatus;
    let posInvoiceId = ord.pos_invoice_id || null;
    let posInvoiceNumber = ord.pos_invoice_number || null;
    let posOrderRef = body.pos_order_ref || ord.pos_order_ref || null;
    let posFulfilledAt = ord.pos_fulfilled_at || null;
    let posFulfilledBy = ord.pos_fulfilled_by || null;
    let fulfillmentNotes = body.fulfillment_notes || (ord as any).fulfillment_notes || null;
    let fulfilledAdjustmentsJson =
      body.fulfilled_adjustments && typeof body.fulfilled_adjustments === "object"
        ? JSON.stringify(body.fulfilled_adjustments)
        : (ord as any).fulfilled_adjustments_json || null;
    let codPaidAmountPkr =
      body.cod_paid_amount_pkr !== undefined && Number.isFinite(Number(body.cod_paid_amount_pkr))
        ? Math.max(0, Number(body.cod_paid_amount_pkr))
        : prevCodPaid;
    let codBalanceDuePkr: number | null =
      body.cod_balance_due_pkr !== undefined && body.cod_balance_due_pkr !== null
        ? Math.max(0, Number(body.cod_balance_due_pkr))
        : (ord as any).cod_balance_due_pkr !== null && (ord as any).cod_balance_due_pkr !== undefined
          ? Number((ord as any).cod_balance_due_pkr)
          : ord.payment_method === "cod"
            ? Math.max(0, Number(ord.total_pkr || 0) - codPaidAmountPkr)
            : null;
    let codLastCollectionAt: string | null =
      body.cod_last_collection_at !== undefined
        ? body.cod_last_collection_at
        : (ord as any).cod_last_collection_at || null;
    let codCollectionsJson: string | null =
      body.cod_collections_json !== undefined
        ? body.cod_collections_json
        : (ord as any).cod_collections_json || null;
    let historyNote = body.note || "";

    const requestedStatus = (body.next_status ||
      body.target_status ||
      (body as any).status) as StorefrontOrderStatus | undefined;

    const validateRequestedTransition = (target: StorefrontOrderStatus): string | null => {
      if (target === prevDisplayStatus) return null;
      if (prevDisplayStatus === "cancelled" || prevDisplayStatus === "rejected") {
        return `Order ${ord.order_number} is already ${prevDisplayStatus} and cannot transition to '${target}'.`;
      }
      if (
        (prevDisplayStatus === "delivered" ||
          prevDisplayStatus === "collected" ||
          prevDisplayStatus === "returned") &&
        target !== "returned" &&
        target !== prevDisplayStatus
      ) {
        return `Completed order ${ord.order_number} ('${prevDisplayStatus}') cannot move back to '${target}'.`;
      }
      if (ord.fulfillment_type === "pickup" && target === "out_for_delivery") {
        return `Counter Pickup order ${ord.order_number} cannot be marked 'out_for_delivery'. Use 'ready_for_pickup'.`;
      }
      if (ord.fulfillment_type === "delivery" && target === "ready_for_pickup") {
        return `Home Delivery order ${ord.order_number} cannot be marked 'ready_for_pickup'. Use 'out_for_delivery'.`;
      }
      return null;
    };

    if (action === "acknowledge_receipt") {
      if (nextHandoffStatus === "pending") {
        nextHandoffStatus = "fetched_by_pos";
      }
      historyNote = historyNote || "Order received in POS Order Inbox for pharmacist/operator review.";
    } else if (action === "load_to_billing") {
      if (nextHandoffStatus !== "invoiced_in_pos" && nextHandoffStatus !== "fulfilled_in_pos") {
        nextHandoffStatus = "loaded_in_pos";
      }
      if (dbStatus === "pending_confirmation") {
        dbStatus = "confirmed";
      }
      historyNote =
        historyNote ||
        "Order loaded into active POS Billing Cart for pharmacist/cashier verification (sale not finalized yet).";
    } else if (action === "stage_held_bill") {
      if (nextHandoffStatus !== "invoiced_in_pos" && nextHandoffStatus !== "fulfilled_in_pos") {
        nextHandoffStatus = "held_in_pos";
      }
      if (dbStatus === "pending_confirmation") {
        dbStatus = "confirmed";
      }
      historyNote =
        historyNote ||
        `Order placed on Hold for Later (${posOrderRef || "POS-HOLD"}) in POS Billing.`;
    } else if (action === "link_pos_invoice") {
      posInvoiceId = body.pos_invoice_id || posInvoiceId;
      posInvoiceNumber = body.pos_invoice_number || posInvoiceNumber || posOrderRef;
      posFulfilledBy = body.operator_name || body.operator_id || "POS Operator";
      if (requestedStatus) {
        const mapped = mapStatusToDbFields(requestedStatus, ord.fulfillment_type);
        dbStatus = mapped.dbStatus;
        fulfillmentOutcome = mapped.fulfillmentOutcome;
      } else if (dbStatus === "pending_confirmation" || dbStatus === "confirmed") {
        dbStatus = ord.fulfillment_type === "pickup" ? "ready_for_pickup" : "preparing";
      }
      if (dbStatus === "completed") {
        nextHandoffStatus = "fulfilled_in_pos";
        posFulfilledAt = nowIso;
      } else {
        nextHandoffStatus = "invoiced_in_pos";
      }
      if (nextPaymentStatus === "paid") {
        codBalanceDuePkr = 0;
        if (ord.payment_method === "cod" && codPaidAmountPkr <= 0) {
          codPaidAmountPkr = Number(ord.total_pkr || 0);
        }
      }
      historyNote =
        historyNote ||
        `POS Invoice ${posInvoiceNumber || ""} finalized (payment: ${nextPaymentStatus}).`;
    } else if (action === "update_status") {
      if (requestedStatus) {
        const normalizedTarget =
          ord.fulfillment_type === "pickup" && requestedStatus === "delivered"
            ? "collected"
            : ord.fulfillment_type === "delivery" && requestedStatus === "collected"
              ? "delivered"
              : requestedStatus;
        const transitionErr = validateRequestedTransition(normalizedTarget);
        if (transitionErr) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "invalid_status_transition",
              message: transitionErr,
            }),
            { status: 400, headers }
          );
        }
        const mapped = mapStatusToDbFields(normalizedTarget, ord.fulfillment_type);
        dbStatus = mapped.dbStatus;
        fulfillmentOutcome = mapped.fulfillmentOutcome;
        if (dbStatus === "completed") {
          nextHandoffStatus = "fulfilled_in_pos";
          posFulfilledAt = posFulfilledAt || nowIso;
          posFulfilledBy = body.operator_name || body.operator_id || posFulfilledBy || "POS Operator";
        } else if (dbStatus === "cancelled" || dbStatus === "rejected") {
          nextHandoffStatus = "cancelled";
        } else if (dbStatus !== "pending_confirmation" && nextHandoffStatus === "pending") {
          nextHandoffStatus = "acknowledged";
        }
      }
      if (body.pos_invoice_id) posInvoiceId = body.pos_invoice_id;
      if (body.pos_invoice_number) posInvoiceNumber = body.pos_invoice_number;
      historyNote =
        historyNote ||
        `Order updated in POS (${requestedStatus || dbStatus}, payment: ${nextPaymentStatus}).`;
    } else if (action === "sync_cod_payment") {
      if (body.pos_invoice_id) posInvoiceId = body.pos_invoice_id;
      if (body.pos_invoice_number) posInvoiceNumber = body.pos_invoice_number;
      historyNote =
        historyNote ||
        `COD collection synced from POS (paid: PKR ${codPaidAmountPkr.toLocaleString()}, remaining: PKR ${Number(
          codBalanceDuePkr || 0
        ).toLocaleString()}, status: ${nextPaymentStatus}).`;
    } else if (action === "mark_fulfilled") {
      if (prevDisplayStatus === "cancelled" || prevDisplayStatus === "rejected") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "invalid_status_transition",
            message: `Order ${ord.order_number} is ${prevDisplayStatus} and cannot be marked fulfilled.`,
          }),
          { status: 400, headers }
        );
      }
      nextHandoffStatus = "fulfilled_in_pos";
      dbStatus = "completed";
      fulfillmentOutcome = ord.fulfillment_type === "pickup" ? "collected" : "delivered";
      posInvoiceId = body.pos_invoice_id || posInvoiceId;
      posInvoiceNumber = body.pos_invoice_number || posInvoiceNumber || posOrderRef;
      posFulfilledAt = nowIso;
      posFulfilledBy = body.operator_name || body.operator_id || "POS Operator";
      historyNote =
        historyNote ||
        `Marked ${fulfillmentOutcome} in POS (${posInvoiceNumber || "Completed"}).`;
    } else if (action === "cancel_order") {
      if (
        prevDisplayStatus === "delivered" ||
        prevDisplayStatus === "collected" ||
        prevDisplayStatus === "returned"
      ) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "invalid_status_transition",
            message: `Order ${ord.order_number} is already ${prevDisplayStatus} and cannot be cancelled. Process a POS return instead.`,
          }),
          { status: 400, headers }
        );
      }
      nextHandoffStatus = "cancelled";
      dbStatus = requestedStatus === "rejected" ? "rejected" : "cancelled";
      fulfillmentOutcome = null;
      historyNote = historyNote || `Order ${dbStatus} from POS Order Inbox.`;
    }

    await env.DB.prepare(
      `UPDATE storefront_orders
       SET status = ?,
           fulfillment_outcome = ?,
           payment_status = ?,
           cod_paid_amount_pkr = ?,
           cod_balance_due_pkr = ?,
           cod_last_collection_at = ?,
           cod_collections_json = ?,
           pos_handoff_status = ?,
           pos_order_ref = ?,
           pos_invoice_id = ?,
           pos_invoice_number = ?,
           pos_fulfilled_at = ?,
           pos_fulfilled_by = ?,
           fulfillment_notes = ?,
           fulfilled_adjustments_json = ?,
           updated_at = ?
       WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?`
    )
      .bind(
        dbStatus,
        fulfillmentOutcome,
        nextPaymentStatus,
        codPaidAmountPkr,
        codBalanceDuePkr,
        codLastCollectionAt,
        codCollectionsJson,
        nextHandoffStatus,
        posOrderRef,
        posInvoiceId,
        posInvoiceNumber,
        posFulfilledAt,
        posFulfilledBy,
        fulfillmentNotes,
        fulfilledAdjustmentsJson,
        nowIso,
        ord.id,
        actor.storefrontId,
        actor.pharmacyId
      )
      .run();

    invalidateOrderNotifCache(actor.storefrontId, actor.pharmacyId);

    const nextDisplayStatus = resolveEffectiveOrderStatusSync({
      status: dbStatus,
      fulfillment_outcome: fulfillmentOutcome,
      fulfillment_type: ord.fulfillment_type,
    });

    const meaningfulChange =
      prevDisplayStatus !== nextDisplayStatus ||
      prevPaymentStatus !== nextPaymentStatus ||
      Math.abs(prevCodPaid - codPaidAmountPkr) > 0.005 ||
      prevInvoiceNumber !== posInvoiceNumber ||
      action === "sync_cod_payment" ||
      action === "load_to_billing" ||
      action === "stage_held_bill";

    if (meaningfulChange) {
      await env.DB.prepare(
        `INSERT INTO storefront_order_status_history (
           id, storefront_id, pharmacy_id, order_id, from_status, to_status,
           actor_type, actor_id, note, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'pos_operator', ?, ?, ?)`
      )
        .bind(
          `sfosh_${crypto.randomUUID()}`,
          actor.storefrontId,
          actor.pharmacyId,
          ord.id,
          prevDisplayStatus,
          nextDisplayStatus,
          body.operator_name || body.operator_id || "pos_terminal",
          historyNote,
          nowIso
        )
        .run();
    }

    const respPayload: PosOrderFulfillmentAckResponse = {
      ok: true,
      duplicate: false,
      order_id: ord.id,
      order_number: ord.order_number,
      status: nextDisplayStatus,
      payment_status: nextPaymentStatus,
      cod_paid_amount_pkr: codPaidAmountPkr,
      cod_balance_due_pkr: codBalanceDuePkr,
      pos_handoff_status: nextHandoffStatus,
      pos_invoice_number: posInvoiceNumber,
      updated_at: nowIso,
    };

    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO storefront_import_idempotency (
         storefront_id, pharmacy_id, idempotency_key, request_hash, response_json, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        actor.storefrontId,
        actor.pharmacyId,
        idempotencyKey,
        requestHash,
        JSON.stringify(respPayload),
        nowIso,
        expiresAt
      )
      .run();

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: actor.storefrontId,
      pharmacyId: actor.pharmacyId,
      action: `pos_order_${action}`,
      actorType: "pos_sync",
      actorId: body.operator_id || actor.branchId,
      entityType: "order",
      entityId: ord.id,
      summary: `POS Order action '${action}' on ${ord.order_number} -> status=${nextDisplayStatus}, payment=${nextPaymentStatus}, handoff=${nextHandoffStatus}.`,
      metadata: {
        order_number: ord.order_number,
        action,
        status: nextDisplayStatus,
        payment_status: nextPaymentStatus,
        pos_order_ref: posOrderRef,
        pos_invoice_number: posInvoiceNumber,
      },
    });

    return new Response(JSON.stringify(respPayload), { status: 200, headers });
  }

  // 7. POST /api/v1/sync/product-image — Fast Mobile / POS 1-Tap Product Photo Upload + Optional Central Library Submission
  if (pathname === "/api/v1/sync/product-image" && req.method === "POST") {
    const auth = await verifySyncToken(req, env);
    if ("error" in auth) {
      return new Response(JSON.stringify({ ok: false, error: auth.error }), {
        status: auth.status,
        headers,
      });
    }
    const { actor } = auth;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers,
      });
    }

    const posProdId = String(body.pos_product_id || "").trim();
    const productName = String(body.name || "").trim();
    const cleanedBase64 = String(body.data_base64 || "").replace(/^data:[^;]+;base64,/, "");
    const contentType = String(body.content_type || "image/webp").toLowerCase();
    if (!posProdId || !cleanedBase64) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_product_or_image" }),
        { status: 400, headers }
      );
    }

    const byteSize = Number(body.byte_size || Math.ceil((cleanedBase64.length * 3) / 4));
    if (byteSize > 450 * 1024) {
      return new Response(
        JSON.stringify({ ok: false, error: "image_too_large", message: "Compressed image must be <= 450 KB." }),
        { status: 413, headers }
      );
    }

    const contentHash = String(body.sha256_hex || "").trim().toLowerCase() || (await sha256Hex(cleanedBase64));
    const mediaId = `sfm_${crypto.randomUUID().slice(0, 14)}`;
    const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : "webp";
    const r2Key = `storefronts/${actor.storefrontId}/products/${contentHash}.${ext}`;
    const publicUrl = `/api/v1/public/media/${mediaId}`;
    const nowIso = new Date().toISOString();

    if (env.MEDIA_BUCKET) {
      const bin = atob(cleanedBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await env.MEDIA_BUCKET.put(r2Key, bytes, {
        httpMetadata: {
          contentType,
          cacheControl: "public, max-age=86400",
        },
        customMetadata: {
          storefront_id: actor.storefrontId,
          pharmacy_id: actor.pharmacyId,
          pos_product_id: posProdId,
          sha256_hex: contentHash,
        },
      });
    }

    await env.DB.prepare(
      `INSERT INTO storefront_media (
         id, storefront_id, pharmacy_id, r2_object_key, public_url,
         content_type, byte_size, width, height, sha256_hex, purpose,
         is_shared, verification_status, source_type, contributed_by_pharmacy_id, uploaded_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'product_image', 0, 'pending_review', 'mobile_pos_capture', ?, ?, ?)`
    )
      .bind(
        mediaId,
        actor.storefrontId,
        actor.pharmacyId,
        r2Key,
        publicUrl,
        contentType,
        byteSize,
        body.width ? Number(body.width) : null,
        body.height ? Number(body.height) : null,
        contentHash,
        actor.pharmacyId,
        body.operator_name || "mobile_pos",
        nowIso
      )
      .run();

    // Update storefront product immediately in R2-First catalog (`live.json`) -> 0 D1 product writes!
    let updatedProductCount = 0;
    try {
      const { doc } = await loadStorefrontCatalogDoc(env, actor.storefrontId, actor.pharmacyId, {
        freshFromR2: true,
        hydrateCentralImages: false,
      });
      const masterIdFilter = body.master_medicine_id ? String(body.master_medicine_id).trim() : null;
      for (const p of doc.products) {
        if (
          p.pos_product_id === posProdId ||
          (masterIdFilter && p.master_medicine_id === masterIdFilter)
        ) {
          p.primary_image_url = publicUrl;
          p.selected_media_id = mediaId;
          p.image_source = "owner_override";
          p.updated_at = nowIso;
          updatedProductCount++;
        }
      }
      if (updatedProductCount > 0) {
        await saveStorefrontCatalogDoc(env, doc);
        await bumpStorefrontConfigVersion(env.DB, actor.storefrontId);
      }
    } catch {
      updatedProductCount = 0;
    }

    // Optionally submit to Super Admin Central Image Library queue (default true!) so once verified, all pharmacies benefit
    let submissionId: string | null = null;
    if (body.submit_to_central_library !== false && productName) {
      submissionId = `csub_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO central_image_submissions (
           id, media_id, pharmacy_id, storefront_id, pos_product_id,
           product_name_snapshot, generic_snapshot, strength_snapshot,
           dosage_form_snapshot, brand_snapshot, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
        .bind(
          submissionId,
          mediaId,
          actor.pharmacyId,
          actor.storefrontId,
          posProdId,
          productName,
          body.generic_name ? String(body.generic_name).trim() : null,
          body.strength ? String(body.strength).trim() : null,
          body.dosage_form ? String(body.dosage_form).trim() : null,
          body.brand_name ? String(body.brand_name).trim() : null,
          nowIso
        )
        .run()
        .catch(() => {
          submissionId = null;
        });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        media_id: mediaId,
        public_url: publicUrl,
        updated_storefront_product: updatedProductCount > 0,
        submission_id: submissionId,
      }),
      { status: 200, headers }
    );
  }

  return new Response(
    JSON.stringify({ ok: false, error: "not_found", message: "Unknown sync endpoint" }),
    { status: 404, headers }
  );
}
