/**
 * Public Storefront API Routes (`/api/v1/public/*`)
 *
 * Security & Isolation Guarantees:
 * - Tenant identity is resolved EXCLUSIVELY from the verified request hostname.
 * - Client-supplied `pharmacy_id` or `storefront_id` query/body params are ignored.
 * - Inactive or suspended storefronts never expose product, category, banner, or delivery data.
 * - Only products with `publish_status = 'published'` for the resolved `storefront_id` are returned.
 * - Only safe public product fields are selected in SQL (never cost, WAC, profit, supplier, Khata).
 * - Order creation independently validates product publication, quantities, delivery rules, and
 *   server-side prices; client-submitted prices or totals are never trusted.
 */

import type {
  PublicSellingUnitOption,
  PublicStorefrontProduct,
  StorefrontBannerRecord,
  StorefrontBranchRecord,
  StorefrontBrandingRecord,
  StorefrontCategoryRecord,
  StorefrontOrderItemRecord,
  StorefrontOrderRecord,
  StorefrontOrderStatus,
  StorefrontOrderStatusHistoryRecord,
  StorefrontPaymentStatus,
  StorefrontPromotionRecord,
  StorefrontSettingsRecord,
} from "../../shared/types";
import { decodeCursor, encodeCursor } from "../../shared/validation";
import {
  buildPublicResolutionPayload,
  extractRequestHostname,
  resolveTenantByHostname,
} from "../domain-resolver";
import type { StorefrontWorkerEnv, WorkerExecutionContext } from "../env";
import { buildResponseHeaders } from "../security";
import { recordStorefrontUsage, writeStorefrontAuditLog } from "../usage-tracker";
import { invalidateOrderNotifCache } from "./sync-routes";
import {
  buildTenantEdgeCacheKey,
  cleanGenericSaltText,
  findGenericAlternativesInSnapshot,
  getCatalogSnapshotForTenant,
  getEdgeCachedResponse,
  putEdgeCachedResponse,
  queryProductsFromSnapshot,
  suggestProductsFromSnapshot,
} from "../edge-cache-and-snapshots";

function isSyncTimestampStale(
  lastSyncIso: string | null | undefined,
  thresholdHours = 24
): boolean {
  if (!lastSyncIso) return true;
  const ts = Date.parse(lastSyncIso);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > thresholdHours * 3600 * 1000;
}

function parseProductSellingUnits(
  row: Record<string, unknown>,
  effectiveDefaultPrice: number,
  compareAtPrice: number | null,
  overridePrice: number | null,
  exposeConvertedStock = true
): PublicSellingUnitOption[] {
  const maxOrderQty = Math.max(1, Number(row.max_order_qty || 20));
  const rawAvailBase = Number(row.available_base_qty ?? -1);
  const rawAvailFallback = Number(row.available_qty ?? -1);
  const hasPosBaseStock = Number.isFinite(rawAvailBase) && rawAvailBase >= 0 && (rawAvailBase > 0 || typeof row.selling_units_json === "string");
  const rawStatus = String(row.availability_status || "in_stock");
  const isProductOut = rawStatus === "out_of_stock" || rawStatus === "unavailable";

  let parsedUnits: PublicSellingUnitOption[] = [];
  if (typeof row.selling_units_json === "string" && row.selling_units_json.trim()) {
    try {
      const arr = JSON.parse(row.selling_units_json);
      if (Array.isArray(arr)) {
        parsedUnits = arr
          .filter((u: any) => {
            if (!u || typeof u !== "object") return false;
            const uName = String(u.unit_name || u.name || "").trim();
            const mult = Number(u.multiplier);
            const price = Number(u.price_pkr);
            return (
              uName.length > 0 &&
              Number.isFinite(mult) &&
              mult > 0 &&
              Number.isFinite(price) &&
              price > 0
            );
          })
          .map((u: any) => {
            const cleanName = String(u.unit_name || u.name).trim();
            const mult = Number(u.multiplier);
            return {
              unit_id: String(
                u.unit_id || `unit_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${mult}`
              ),
              name: cleanName,
              unit_name: cleanName,
              label: String(u.label || cleanName).trim(),
              multiplier: mult,
              price_pkr: Number(u.price_pkr),
              compare_at_price_pkr:
                u.compare_at_price_pkr !== undefined && u.compare_at_price_pkr !== null
                  ? Number(u.compare_at_price_pkr)
                  : null,
              is_base: Boolean(u.is_base || mult === 1),
              is_default: Boolean(u.is_default),
              barcode: u.barcode ? String(u.barcode) : null,
            };
          });
      }
    } catch {
      parsedUnits = [];
    }
  }

  if (parsedUnits.length === 0) {
    const fallbackName = String(row.unit_label || "Pack").trim() || "Pack";
    const fallbackLabel = String(row.packing_label || fallbackName).trim() || fallbackName;
    parsedUnits = [
      {
        unit_id: `unit_${fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_1`,
        name: fallbackName,
        unit_name: fallbackName,
        label: fallbackLabel,
        multiplier: 1,
        price_pkr: effectiveDefaultPrice,
        compare_at_price_pkr: compareAtPrice,
        is_base: true,
        is_default: true,
      },
    ];
  } else {
    if (!parsedUnits.some((u) => u.is_default)) {
      parsedUnits[0].is_default = true;
    }
    if (overridePrice !== null && overridePrice > 0) {
      parsedUnits = parsedUnits.map((u) =>
        u.is_default
          ? {
              ...u,
              compare_at_price_pkr:
                overridePrice < u.price_pkr ? u.price_pkr : u.compare_at_price_pkr ?? null,
              price_pkr: overridePrice,
            }
          : u
      );
    }
  }

  const maxMultiplier = Math.max(1, ...parsedUnits.map((u) => Number(u.multiplier || 1)));

  return parsedUnits.map((u) => {
    const scaledOrderCap = Math.max(
      maxOrderQty,
      Math.floor((maxOrderQty * maxMultiplier) / Math.max(0.0001, u.multiplier))
    );
    let unitMaxQty = scaledOrderCap;
    let unitInStock = !isProductOut;
    let availableUnitQty: number | undefined = undefined;

    if (isProductOut) {
      unitMaxQty = 0;
      unitInStock = false;
      availableUnitQty = 0;
    } else if (hasPosBaseStock && rawAvailBase > 0) {
      const possible = Math.floor((rawAvailBase + 1e-9) / Math.max(0.0001, u.multiplier));
      availableUnitQty = exposeConvertedStock ? Math.max(0, possible) : undefined;
      unitMaxQty = Math.min(scaledOrderCap, Math.max(0, possible));
      unitInStock = possible >= 1;
    } else if (rawAvailFallback > 0 && parsedUnits.length === 1) {
      const possible = Math.floor(rawAvailFallback);
      availableUnitQty = exposeConvertedStock ? Math.max(0, possible) : undefined;
      unitMaxQty = Math.min(scaledOrderCap, Math.max(0, possible));
      unitInStock = possible >= 1;
    }

    return {
      ...u,
      ...(availableUnitQty !== undefined ? { available_unit_qty: availableUnitQty } : {}),
      max_qty: unitMaxQty,
      in_stock: unitInStock,
    };
  });
}

function resolveEffectiveOrderStatus(ord: Record<string, any>): StorefrontOrderStatus {
  const outcome = ord.fulfillment_outcome ? String(ord.fulfillment_outcome).trim() : "";
  if (outcome === "delivered" || outcome === "collected" || outcome === "returned") {
    return outcome as StorefrontOrderStatus;
  }
  if (ord.status === "completed") {
    return ord.fulfillment_type === "pickup" ? "collected" : "delivered";
  }
  return (ord.status || "pending_confirmation") as StorefrontOrderStatus;
}

function mapPublicProductRow(
  row: Record<string, unknown>,
  showExactStockQty: boolean,
  storefrontLastSyncAt?: string | null,
  staleThresholdHours = 24,
  showStockBadges = true
): PublicStorefrontProduct {
  const basePrice = Number(row.public_selling_price_pkr || 0);
  const overridePrice =
    row.override_price_pkr !== null &&
    row.override_price_pkr !== undefined &&
    Number(row.override_price_pkr) >= 0
      ? Number(row.override_price_pkr)
      : null;
  const effectivePrice = overridePrice !== null ? overridePrice : basePrice;
  const compareAt =
    row.compare_at_price_pkr !== null && row.compare_at_price_pkr !== undefined
      ? Number(row.compare_at_price_pkr)
      : overridePrice !== null && overridePrice < basePrice
      ? basePrice
      : null;

  const productLastSync = row.last_synced_at
    ? String(row.last_synced_at)
    : storefrontLastSyncAt || null;
  const stale = isSyncTimestampStale(productLastSync, staleThresholdHours);

  let branchAvailability: Record<string, any> | undefined;
  if (row.branch_stock_json && typeof row.branch_stock_json === "string") {
    try {
      const parsed = JSON.parse(row.branch_stock_json);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        branchAvailability = parsed;
      }
    } catch {
      branchAvailability = undefined;
    }
  }

  const rawStatus =
    (row.availability_status as PublicStorefrontProduct["availability_status"]) || "in_stock";

  const exposeStock = showExactStockQty || showStockBadges;
  const sellingUnits = parseProductSellingUnits(
    row,
    effectivePrice,
    compareAt,
    overridePrice,
    exposeStock
  );
  const defaultUnit = sellingUnits.find((u) => u.is_default) || sellingUnits[0];
  const displayPrice = defaultUnit ? defaultUnit.price_pkr : effectivePrice;

  const out: PublicStorefrontProduct = {
    id: String(row.id),
    storefront_id: String(row.storefront_id),
    pharmacy_id: String(row.pharmacy_id),
    pos_product_id: String(row.pos_product_id),
    master_medicine_id: row.master_medicine_id ? String(row.master_medicine_id) : null,
    sku_code: row.sku_code ? String(row.sku_code) : null,
    slug: String(row.slug),
    name: String(row.name),
    generic_name: row.generic_name ? String(row.generic_name) : null,
    strength: row.strength ? String(row.strength) : null,
    dosage_form: row.dosage_form ? String(row.dosage_form) : null,
    brand_name: row.brand_name ? String(row.brand_name) : null,
    packing_label: row.packing_label ? String(row.packing_label) : null,
    unit_label: String(row.unit_label || "Pack"),
    base_unit_label: row.base_unit_label ? String(row.base_unit_label) : String(row.unit_label || "unit"),
    selling_units: sellingUnits,
    public_description: row.public_description ? String(row.public_description) : null,
    public_selling_price_pkr: displayPrice,
    effective_price_pkr: displayPrice,
    compare_at_price_pkr: compareAt,
    override_price_pkr: overridePrice,
    availability_status: rawStatus,
    availability_unconfirmed: stale,
    ...(branchAvailability ? { branch_availability: branchAvailability } : {}),
    category_name: String(row.category_name || "General Medicines"),
    primary_image_url: row.primary_image_url ? String(row.primary_image_url) : null,
    requires_prescription: Number(row.requires_prescription) === 1,
    is_featured: Number(row.is_featured) === 1,
    is_popular: Number(row.is_popular) === 1,
    max_order_qty: Number(row.max_order_qty || 20),
    sync_version: Number(row.sync_version || 1),
    last_synced_at: productLastSync,
    updated_at: String(row.updated_at || ""),
  };

  if (exposeStock) {
    out.available_base_qty = Math.max(0, Number(row.available_base_qty || 0));
  }
  if (showExactStockQty) {
    out.available_qty = Math.max(0, Number(row.available_qty || 0));
  }

  return out;
}

const SAFE_PRODUCT_COLUMNS = `
  id, storefront_id, pharmacy_id, pos_product_id, master_medicine_id, sku_code, slug, name,
  generic_name, strength, dosage_form, brand_name, packing_label, unit_label,
  base_unit_label, selling_units_json, available_base_qty,
  public_description, public_selling_price_pkr, compare_at_price_pkr, override_price_pkr,
  availability_status, available_qty, branch_stock_json, category_name, primary_image_url,
  requires_prescription, is_featured, is_popular, max_order_qty, sync_version, last_synced_at, updated_at
`;

function decodeBase64ToBytes(input: string): Uint8Array {
  const cleaned = input.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function handlePublicRoutes(
  req: Request,
  env: StorefrontWorkerEnv,
  pathname: string,
  execCtx?: WorkerExecutionContext
): Promise<Response> {
  const url = new URL(req.url);
  const rawHost = extractRequestHostname(req, env);
  const ctx = await resolveTenantByHostname(
    env.DB,
    rawHost,
    env.PLATFORM_BASE_DOMAIN
  );

  // 1. GET /api/v1/public/resolve — Always returns structured resolution state
  if (pathname === "/api/v1/public/resolve" && req.method === "GET") {
    const payload = await buildPublicResolutionPayload(env.DB, ctx);
    if (ctx.storefront) {
      await recordStorefrontUsage(env.DB, {
        storefrontId: ctx.storefront.id,
        pharmacyId: ctx.storefront.pharmacy_id,
        publicRequests: 1,
        d1RowsReadEst: 3,
      });
    }
    const headers = buildResponseHeaders({
      req,
      storefrontId: ctx.storefront?.id,
      configVersion: ctx.storefront?.config_version,
      hostname: ctx.normalizedHostname,
      isPrivate: true,
    });
    return new Response(JSON.stringify(payload), {
      status: ctx.httpStatus,
      headers,
    });
  }

  // 1b. GET/HEAD /api/v1/public/media/:mediaId — Public Shared & Tenant-Scoped Media Serving (Edge-Cached + Cross-Tenant Safe)
  if (pathname.startsWith("/api/v1/public/media/") && (req.method === "GET" || req.method === "HEAD")) {
    const mediaId = decodeURIComponent(pathname.slice("/api/v1/public/media/".length));

    // Zero-D1 / Zero-R2 Edge Cache check for shared verified artwork & tenant-scoped media
    const sharedEdgeKey = new Request(
      `https://media-edge.aivrasol.internal/shared-media/${encodeURIComponent(mediaId)}`,
      { method: "GET" }
    );
    const tenantEdgeKey = new Request(
      `https://media-edge.aivrasol.internal/tenant-media/${encodeURIComponent(ctx.storefront?.id || "anon")}/${encodeURIComponent(mediaId)}`,
      { method: "GET" }
    );

    if (req.method === "GET") {
      const sharedHit = await getEdgeCachedResponse(sharedEdgeKey);
      if (sharedHit) return sharedHit;
      if (ctx.storefront?.id) {
        const tenantHit = await getEdgeCachedResponse(tenantEdgeKey);
        if (tenantHit) return tenantHit;
      }
    }

    const mediaRow = await env.DB.prepare(
      `SELECT id, storefront_id, pharmacy_id, r2_object_key, public_url, content_type, byte_size, is_shared
       FROM storefront_media
       WHERE id = ?
       LIMIT 1`
    )
      .bind(mediaId)
      .first<Record<string, unknown>>();

    if (!mediaRow) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "media_not_found",
          message: "Media asset does not exist.",
        }),
        {
          status: 404,
          headers: buildResponseHeaders({ req, isPrivate: true }),
        }
      );
    }

    const r2Key = String(mediaRow.r2_object_key);
    const isShared = Number(mediaRow.is_shared || 0) === 1;

    // Strict Cross-Tenant Check for Private Assets:
    // If NOT shared, must have an active resolved storefront that owns this media
    if (!isShared) {
      if (
        !ctx.ok ||
        !ctx.storefront ||
        String(mediaRow.storefront_id) !== ctx.storefront.id ||
        String(mediaRow.pharmacy_id) !== ctx.storefront.pharmacy_id ||
        !r2Key.startsWith(`storefronts/${ctx.storefront.id}/`)
      ) {
        return new Response(
          JSON.stringify({ ok: false, error: "cross_tenant_media_blocked" }),
          { status: 403, headers: buildResponseHeaders({ req, isPrivate: true }) }
        );
      }
    }

    if (env.MEDIA_BUCKET) {
      const obj = await env.MEDIA_BUCKET.get(r2Key);
      if (obj) {
        const headers = buildResponseHeaders({
          req,
          storefrontId: ctx.storefront?.id,
          configVersion: ctx.storefront?.config_version,
          hostname: ctx.normalizedHostname,
          cacheMaxAgeSec: isShared ? 604800 : 86400, // 7 days for shared verified artwork
        });
        headers.set("Content-Type", String(mediaRow.content_type || "image/webp"));
        if (isShared) {
          headers.set("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
        }
        if (req.method === "HEAD") {
          return new Response(null, { status: 200, headers });
        }
        const buf = await obj.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const isBinaryImage =
          (bytes.length >= 4 &&
            bytes[0] === 0x52 &&
            bytes[1] === 0x49 &&
            bytes[2] === 0x46 &&
            bytes[3] === 0x46) || // RIFF (WebP)
          (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) || // PNG
          (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8); // JPEG

        let finalBody: BodyInit = buf;
        if (!isBinaryImage) {
          try {
            const textVal = new TextDecoder().decode(bytes);
            if (
              textVal.startsWith("data:") ||
              (textVal.length > 16 && /^[A-Za-z0-9+/=\s]+$/.test(textVal.slice(0, 120)))
            ) {
              finalBody = decodeBase64ToBytes(textVal.trim()) as unknown as BodyInit;
            }
          } catch {
            finalBody = buf;
          }
        }
        const mediaResp = new Response(finalBody, { status: 200, headers });
        putEdgeCachedResponse(isShared ? sharedEdgeKey : tenantEdgeKey, mediaResp, execCtx);
        return mediaResp;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        media: mediaRow,
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: ctx.storefront?.id,
          configVersion: ctx.storefront?.config_version,
          hostname: ctx.normalizedHostname,
          cacheMaxAgeSec: 300,
        }),
      }
    );
  }

  // For all other public endpoints, require an ACTIVE resolved storefront
  if (!ctx.ok || !ctx.storefront) {
    const headers = buildResponseHeaders({
      req,
      hostname: ctx.normalizedHostname,
      isPrivate: true,
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: `storefront_${ctx.resolutionStatus}`,
        resolution_status: ctx.resolutionStatus,
        redirect_to_hostname: ctx.redirectToHostname,
        redirect_url: ctx.redirectUrl,
        message: ctx.message || "Storefront is not active.",
      }),
      { status: ctx.httpStatus, headers }
    );
  }

  const sf = ctx.storefront;

  // Load tenant settings for visibility rules
  const settings = await env.DB.prepare(
    "SELECT * FROM storefront_settings WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1"
  )
    .bind(sf.id, sf.pharmacy_id)
    .first<StorefrontSettingsRecord>();

  const showExactStock = Number(settings?.show_exact_stock_qty) === 1;
  const showStockBadges = Number(settings?.show_stock_badges ?? 1) === 1;
  const hideOutOfStock = Number(settings?.hide_out_of_stock) === 1;
  const staleThresholdHours = Number(settings?.stale_stock_threshold_hours || 24);

  const tenantEdgeScope = {
    storefrontId: sf.id,
    configVersion: Number(sf.config_version || 1),
    hostname: ctx.normalizedHostname || sf.primary_domain || "default",
  };

  // 2. GET /api/v1/public/settings (Edge-Cached by tenant + config_version)
  if (pathname === "/api/v1/public/settings" && req.method === "GET") {
    const edgeKey = buildTenantEdgeCacheKey(req, tenantEdgeScope);
    const cached = await getEdgeCachedResponse(edgeKey);
    if (cached) return cached;

    const branding = await env.DB.prepare(
      "SELECT * FROM storefront_branding WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1"
    )
      .bind(sf.id, sf.pharmacy_id)
      .first<StorefrontBrandingRecord>();

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      publicRequests: 1,
      d1RowsReadEst: 2,
    });

    let openingHours: Record<string, unknown> = {};
    try {
      openingHours = settings?.opening_hours_json ? JSON.parse(settings.opening_hours_json) : {};
    } catch {
      openingHours = {};
    }

    let socialLinks: Record<string, unknown> = {};
    try {
      socialLinks = settings?.social_links_json ? JSON.parse(settings.social_links_json) : {};
    } catch {
      socialLinks = {};
    }

    const res = new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        pharmacy_name: sf.pharmacy_name,
        slug: sf.slug,
        primary_domain: sf.primary_domain,
        last_sync_at: sf.last_sync_at,
        stock_sync_stale: isSyncTimestampStale(sf.last_sync_at, staleThresholdHours),
        contact: {
          phone: sf.contact_phone,
          whatsapp: sf.whatsapp_phone,
          email: sf.contact_email,
          support_phone: sf.support_phone,
          address_line: sf.address_line,
          city: sf.city,
          region: sf.region,
          country: sf.country,
          latitude: sf.latitude,
          longitude: sf.longitude,
        },
        regulatory: {
          drug_sale_license_no: sf.drug_sale_license_no,
          pharmacist_name: sf.pharmacist_name,
          pharmacist_reg_no: sf.pharmacist_reg_no,
          legal_disclaimer_text: settings?.legal_disclaimer_text,
          pharmacist_supervision_note: settings?.pharmacist_supervision_note,
          emergency_notice_text: settings?.emergency_notice_text,
        },
        branding,
        settings: {
          announcement_bar_enabled: Number(settings?.announcement_bar_enabled) === 1,
          announcement_bar_text: settings?.announcement_bar_text,
          featured_categories_enabled: Number(settings?.featured_categories_enabled) === 1,
          require_rx_for_prescription_items: Number(settings?.require_rx_for_prescription_items) === 1,
          prescription_upload_enabled: Number(settings?.prescription_upload_enabled) === 1,
          whatsapp_order_assist_enabled: Number(settings?.whatsapp_order_assist_enabled) === 1,
          maintenance_mode: Number(settings?.maintenance_mode || 0) === 1,
          maintenance_message: settings?.maintenance_message || null,
          seo_title: settings?.seo_title || `${sf.pharmacy_name} — Online Pharmacy`,
          seo_description: settings?.seo_description,
          opening_hours: openingHours,
          social_links: socialLinks,
        },
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: sf.id,
          configVersion: sf.config_version,
          hostname: ctx.normalizedHostname,
          cacheMaxAgeSec: 120,
        }),
      }
    );
    putEdgeCachedResponse(edgeKey, res, execCtx);
    return res;
  }

  // 3. GET /api/v1/public/categories (Edge-Cached + R2 Catalog Snapshot -> 0 D1 reads!)
  if (pathname === "/api/v1/public/categories" && req.method === "GET") {
    const edgeKey = buildTenantEdgeCacheKey(req, tenantEdgeScope);
    const cached = await getEdgeCachedResponse(edgeKey);
    if (cached) return cached;

    const { snapshot, source } = await getCatalogSnapshotForTenant(env, sf, execCtx);
    const headers = buildResponseHeaders({
      req,
      storefrontId: sf.id,
      configVersion: sf.config_version,
      hostname: ctx.normalizedHostname,
      cacheMaxAgeSec: 180,
    });
    headers.set("X-Catalog-Source", source);

    const res = new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        categories: snapshot.categories,
      }),
      { status: 200, headers }
    );
    putEdgeCachedResponse(edgeKey, res, execCtx);
    return res;
  }

  // 4a. GET /api/v1/public/products/suggest — Instant Autocomplete + Generic-Salt Alternatives (0 D1 reads on shelf hits!)
  if (pathname === "/api/v1/public/products/suggest" && req.method === "GET") {
    const edgeKey = buildTenantEdgeCacheKey(req, tenantEdgeScope);
    const cached = await getEdgeCachedResponse(edgeKey);
    if (cached) return cached;

    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 6));

    const { snapshot, source } = await getCatalogSnapshotForTenant(env, sf, execCtx);
    const result = suggestProductsFromSnapshot(snapshot, {
      q,
      limit,
      altLimit: 4,
      hideOutOfStock,
    });

    let alternativesRows = result.alternatives;
    let matchedGeneric = result.matchedGeneric;
    let matchedUnavailableName = result.matchedUnavailableName;
    let alternativeReason: string | null = result.alternativeReason;

    // If searched medicine is NOT in this pharmacy's published catalog at all,
    // check unpublished store products or central canonical library to discover its generic salt
    // and recommend in-stock same-formula alternatives!
    if (result.suggestions.length === 0 && q.length >= 3) {
      const qLike = `%${q.toLowerCase()}%`;
      try {
        const localUnpub = await env.DB.prepare(
          `SELECT name, generic_name FROM storefront_products
           WHERE storefront_id = ? AND pharmacy_id = ?
             AND LOWER(name) LIKE ? AND generic_name IS NOT NULL AND generic_name != ''
           LIMIT 1`
        )
          .bind(sf.id, sf.pharmacy_id, qLike)
          .first<{ name: string; generic_name: string }>();

        let discoveredSalt = cleanGenericSaltText(localUnpub?.generic_name);
        let discoveredName = localUnpub?.name || null;

        if (!discoveredSalt) {
          const canonical = await env.DB.prepare(
            `SELECT canonical_name, generic_name FROM central_medicine_canonical
             WHERE normalized_name LIKE ? AND generic_name IS NOT NULL AND generic_name != ''
             LIMIT 1`
          )
            .bind(qLike)
            .first<{ canonical_name: string; generic_name: string }>();
          if (canonical?.generic_name) {
            discoveredSalt = cleanGenericSaltText(canonical.generic_name);
            discoveredName = canonical.canonical_name;
          }
        }

        if (discoveredSalt) {
          const altFound = findGenericAlternativesInSnapshot(snapshot, discoveredSalt, new Set(), 5);
          if (altFound.length > 0) {
            alternativesRows = altFound;
            matchedGeneric = discoveredSalt;
            matchedUnavailableName = discoveredName || q;
            alternativeReason = "unavailable_brand";
          }
        }
      } catch {
        // Non-fatal fallback
      }
    }

    const suggestions = result.suggestions.map((r) =>
      mapPublicProductRow(r, showExactStock, sf.last_sync_at, staleThresholdHours, showStockBadges)
    );
    const alternatives = alternativesRows.map((r) =>
      mapPublicProductRow(r, showExactStock, sf.last_sync_at, staleThresholdHours, showStockBadges)
    );

    const headers = buildResponseHeaders({
      req,
      storefrontId: sf.id,
      configVersion: sf.config_version,
      hostname: ctx.normalizedHostname,
      cacheMaxAgeSec: 90,
    });
    headers.set("X-Catalog-Source", source);

    const res = new Response(
      JSON.stringify({
        ok: true,
        query: q,
        suggestions,
        alternatives,
        matched_generic: matchedGeneric,
        matched_unavailable_name: matchedUnavailableName,
        alternative_reason: alternativeReason,
        total_matches: result.totalMatches,
      }),
      { status: 200, headers }
    );
    putEdgeCachedResponse(edgeKey, res, execCtx);
    return res;
  }

  // 4. GET /api/v1/public/products/search (Edge-Cached + R2 Catalog Snapshot -> 0 D1 reads!)
  if (pathname === "/api/v1/public/products/search" && req.method === "GET") {
    const edgeKey = buildTenantEdgeCacheKey(req, tenantEdgeScope);
    const cached = await getEdgeCachedResponse(edgeKey);
    if (cached) return cached;

    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const category = (url.searchParams.get("category") || "").trim();
    const inStockOnly = url.searchParams.get("in_stock") === "true";
    const sortBy = (url.searchParams.get("sort") || "featured").trim();
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit")) || 20));

    const { snapshot, source } = await getCatalogSnapshotForTenant(env, sf, execCtx);
    const { pageRows, hasMore } = queryProductsFromSnapshot(snapshot, {
      q,
      category,
      inStockOnly,
      hideOutOfStock,
      sortBy,
      cursor,
      limit,
    });

    const items = pageRows.map((r) =>
      mapPublicProductRow(
        r,
        showExactStock,
        sf.last_sync_at,
        staleThresholdHours,
        showStockBadges
      )
    );
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.name, last.id) : null;

    // Also compute same-generic in-stock alternatives if search returned 0 in-stock hits
    let genericAlternatives: PublicStorefrontProduct[] = [];
    let matchedGeneric: string | null = null;
    const inStockCount = items.filter(
      (it) => it.availability_status === "in_stock" || it.availability_status === "low_stock"
    ).length;

    if (q.length >= 3 && inStockCount === 0) {
      let salt = cleanGenericSaltText(items[0]?.generic_name);
      if (!salt) {
        try {
          const qLike = `%${q}%`;
          const localOrCanon =
            (await env.DB.prepare(
              `SELECT generic_name FROM storefront_products
               WHERE storefront_id = ? AND pharmacy_id = ?
                 AND LOWER(name) LIKE ? AND generic_name IS NOT NULL AND generic_name != ''
               LIMIT 1`
            )
              .bind(sf.id, sf.pharmacy_id, qLike)
              .first<{ generic_name: string }>()) ||
            (await env.DB.prepare(
              `SELECT generic_name FROM central_medicine_canonical
               WHERE normalized_name LIKE ? AND generic_name IS NOT NULL AND generic_name != ''
               LIMIT 1`
            )
              .bind(qLike)
              .first<{ generic_name: string }>());
          salt = cleanGenericSaltText(localOrCanon?.generic_name);
        } catch {
          // ignore
        }
      }
      if (salt) {
        const excludeIds = new Set(items.map((it) => it.id));
        const altRows = findGenericAlternativesInSnapshot(snapshot, salt, excludeIds, 8);
        if (altRows.length > 0) {
          matchedGeneric = salt;
          genericAlternatives = altRows.map((r) =>
            mapPublicProductRow(r, showExactStock, sf.last_sync_at, staleThresholdHours, showStockBadges)
          );
        }
      }
    }

    const headers = buildResponseHeaders({
      req,
      storefrontId: sf.id,
      configVersion: sf.config_version,
      hostname: ctx.normalizedHostname,
      cacheMaxAgeSec: 120,
    });
    headers.set("X-Catalog-Source", source);

    const res = new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        query: q,
        items,
        generic_alternatives: genericAlternatives,
        matched_generic: matchedGeneric,
        next_cursor: nextCursor,
        has_more: hasMore,
      }),
      { status: 200, headers }
    );
    putEdgeCachedResponse(edgeKey, res, execCtx);
    return res;
  }

  // 5. GET /api/v1/public/products (Edge-Cached + R2 Catalog Snapshot -> 0 D1 reads!)
  if (pathname === "/api/v1/public/products" && req.method === "GET") {
    const edgeKey = buildTenantEdgeCacheKey(req, tenantEdgeScope);
    const cached = await getEdgeCachedResponse(edgeKey);
    if (cached) return cached;

    const category = (url.searchParams.get("category") || "").trim();
    const featuredOnly = url.searchParams.get("featured") === "true";
    const popularOnly = url.searchParams.get("popular") === "true";
    const inStockOnly = url.searchParams.get("in_stock") === "true";
    const sortBy = (url.searchParams.get("sort") || "name_asc").trim();
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit")) || 24));

    const { snapshot, source } = await getCatalogSnapshotForTenant(env, sf, execCtx);
    const { pageRows, hasMore } = queryProductsFromSnapshot(snapshot, {
      category,
      featuredOnly,
      popularOnly,
      inStockOnly,
      hideOutOfStock,
      sortBy,
      cursor: sortBy === "name_asc" ? cursor : null,
      limit,
    });

    const items = pageRows.map((r) =>
      mapPublicProductRow(
        r,
        showExactStock,
        sf.last_sync_at,
        staleThresholdHours,
        showStockBadges
      )
    );
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last && sortBy === "name_asc" ? encodeCursor(last.name, last.id) : null;

    const headers = buildResponseHeaders({
      req,
      storefrontId: sf.id,
      configVersion: sf.config_version,
      hostname: ctx.normalizedHostname,
      cacheMaxAgeSec: 180,
    });
    headers.set("X-Catalog-Source", source);

    const res = new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        last_sync_at: sf.last_sync_at,
        stock_sync_stale: isSyncTimestampStale(sf.last_sync_at, staleThresholdHours),
        items,
        next_cursor: nextCursor,
        has_more: hasMore,
      }),
      { status: 200, headers }
    );
    putEdgeCachedResponse(edgeKey, res, execCtx);
    return res;
  }

  // 6. GET /api/v1/public/products/:idOrSlug
  if (pathname.startsWith("/api/v1/public/products/") && req.method === "GET") {
    const idOrSlug = decodeURIComponent(pathname.slice("/api/v1/public/products/".length));
    const row = await env.DB.prepare(
      `SELECT ${SAFE_PRODUCT_COLUMNS}
       FROM storefront_products
       WHERE storefront_id = ? AND pharmacy_id = ?
         AND publish_status = 'published' AND is_controlled_substance = 0
         AND (id = ? OR slug = ? OR pos_product_id = ?)
       LIMIT 1`
    )
      .bind(sf.id, sf.pharmacy_id, idOrSlug, idOrSlug, idOrSlug)
      .first<Record<string, unknown>>();

    if (!row) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "product_not_found",
          message: "Product not found or not published on this pharmacy website.",
        }),
        {
          status: 404,
          headers: buildResponseHeaders({ req, storefrontId: sf.id, isPrivate: true }),
        }
      );
    }

    const [imagesRes, relatedRes] = await Promise.all([
      env.DB.prepare(
        `SELECT id, image_url, alt_text, sort_order, is_primary
         FROM storefront_product_images
         WHERE storefront_id = ? AND pharmacy_id = ? AND product_id = ?
         ORDER BY is_primary DESC, sort_order ASC`
      )
        .bind(sf.id, sf.pharmacy_id, String(row.id))
        .all(),
      env.DB.prepare(
        `SELECT ${SAFE_PRODUCT_COLUMNS}
         FROM storefront_products
         WHERE storefront_id = ? AND pharmacy_id = ?
           AND publish_status = 'published' AND is_controlled_substance = 0
           AND category_name = ? AND id != ?
         ORDER BY is_featured DESC, name ASC
         LIMIT 4`
      )
        .bind(sf.id, sf.pharmacy_id, String(row.category_name || "General Medicines"), String(row.id))
        .all<Record<string, unknown>>(),
    ]);

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      publicRequests: 1,
      d1RowsReadEst: 4,
    });

    const mappedProduct = mapPublicProductRow(
      row,
      showExactStock,
      sf.last_sync_at,
      staleThresholdHours,
      showStockBadges
    );
    const relatedProducts = (relatedRes.results || []).map((r) =>
      mapPublicProductRow(
        r,
        showExactStock,
        sf.last_sync_at,
        staleThresholdHours,
        showStockBadges
      )
    );

    // Same-Formula / Generic Alternatives (served from R2 snapshot in <2ms -> 0 extra D1 reads!)
    let genericAlternatives: PublicStorefrontProduct[] = [];
    const prodSalt = cleanGenericSaltText(row.generic_name);
    if (prodSalt) {
      try {
        const { snapshot } = await getCatalogSnapshotForTenant(env, sf, execCtx);
        const altRows = findGenericAlternativesInSnapshot(
          snapshot,
          prodSalt,
          new Set([String(row.id)]),
          4
        );
        genericAlternatives = altRows.map((r) =>
          mapPublicProductRow(r, showExactStock, sf.last_sync_at, staleThresholdHours, showStockBadges)
        );
      } catch {
        genericAlternatives = [];
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        product: {
          ...mappedProduct,
          images: imagesRes.results || [],
        },
        related_products: relatedProducts,
        generic_alternatives: genericAlternatives,
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: sf.id,
          configVersion: sf.config_version,
          hostname: ctx.normalizedHostname,
          cacheMaxAgeSec: 120,
        }),
      }
    );
  }

  // 7. GET /api/v1/public/banners
  if (pathname === "/api/v1/public/banners" && req.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, storefront_id, pharmacy_id, title, subtitle, badge_text,
              cta_label, cta_url, image_url, bg_gradient, placement, sort_order, is_active, starts_at, ends_at
       FROM storefront_banners
       WHERE storefront_id = ? AND pharmacy_id = ? AND is_active = 1
       ORDER BY sort_order ASC, created_at DESC`
    )
      .bind(sf.id, sf.pharmacy_id)
      .all<StorefrontBannerRecord>();

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      publicRequests: 1,
      d1RowsReadEst: Math.max(1, results.length),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        banners: results,
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: sf.id,
          configVersion: sf.config_version,
          hostname: ctx.normalizedHostname,
          isPrivate: true,
        }),
      }
    );
  }

  // 7b. GET /api/v1/public/promotions
  if (pathname === "/api/v1/public/promotions" && req.method === "GET") {
    const nowIso = new Date().toISOString();
    const { results } = await env.DB.prepare(
      `SELECT *
       FROM storefront_promotions
       WHERE storefront_id = ? AND pharmacy_id = ? AND is_active = 1
         AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at = '' OR ends_at >= ?)
       ORDER BY created_at DESC`
    )
      .bind(sf.id, sf.pharmacy_id, nowIso, nowIso)
      .all<StorefrontPromotionRecord>();

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        promotions: results || [],
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: sf.id,
          configVersion: sf.config_version,
          hostname: ctx.normalizedHostname,
          isPrivate: true,
        }),
      }
    );
  }

  // 8. GET /api/v1/public/delivery-config
  if (pathname === "/api/v1/public/delivery-config" && req.method === "GET") {
    const zonesRes = await env.DB.prepare(
      `SELECT id, zone_name, city, areas_json, delivery_fee_pkr, min_order_pkr,
              free_delivery_above_pkr, estimated_minutes, sort_order
       FROM storefront_delivery_zones
       WHERE storefront_id = ? AND pharmacy_id = ? AND is_active = 1
       ORDER BY sort_order ASC, zone_name ASC`
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      publicRequests: 1,
      d1RowsReadEst: 2,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        delivery_config: {
          delivery_enabled: Number(settings?.delivery_enabled ?? 1) === 1,
          pickup_enabled: Number(settings?.pickup_enabled ?? 1) === 1,
          min_order_amount_pkr: Number(settings?.min_order_amount_pkr ?? 300),
          standard_delivery_fee_pkr: Number(settings?.standard_delivery_fee_pkr ?? 150),
          free_delivery_threshold_pkr: Number(settings?.free_delivery_threshold_pkr ?? 2000),
          estimated_delivery_minutes: Number(settings?.estimated_delivery_minutes ?? 45),
          estimated_pickup_minutes: Number(settings?.estimated_pickup_minutes ?? 15),
          delivery_radius_km: Number(settings?.delivery_radius_km ?? 10),
          cod_enabled: Number(settings?.cod_enabled ?? 1) === 1,
          bank_transfer_enabled: Number(settings?.bank_transfer_enabled ?? 0) === 1,
          prescription_upload_enabled: Number(settings?.prescription_upload_enabled ?? 1) === 1,
          zones: zonesRes.results || [],
        },
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: sf.id,
          configVersion: sf.config_version,
          hostname: ctx.normalizedHostname,
          isPrivate: true,
        }),
      }
    );
  }

  // 9. GET /api/v1/public/opening-hours
  if (pathname === "/api/v1/public/opening-hours" && req.method === "GET") {
    const branchesRes = await env.DB.prepare(
      `SELECT id, pos_branch_id, branch_code, name, is_main, phone, whatsapp_phone,
              address_line, city, pickup_enabled, delivery_enabled, opening_hours_json
       FROM storefront_branches
       WHERE storefront_id = ? AND pharmacy_id = ? AND status = 'active'
       ORDER BY is_main DESC, name ASC`
    )
      .bind(sf.id, sf.pharmacy_id)
      .all<StorefrontBranchRecord>();

    let generalHours: Record<string, unknown> = {};
    try {
      generalHours = settings?.opening_hours_json ? JSON.parse(settings.opening_hours_json) : {};
    } catch {
      generalHours = {};
    }

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      publicRequests: 1,
      d1RowsReadEst: 2,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        timezone: sf.timezone,
        opening_hours: generalHours,
        branches: (branchesRes.results || []).map((b) => {
          let bh = {};
          try {
            bh = b.opening_hours_json ? JSON.parse(b.opening_hours_json) : {};
          } catch {
            bh = {};
          }
          return {
            ...b,
            opening_hours: bh,
          };
        }),
      }),
      {
        status: 200,
        headers: buildResponseHeaders({
          req,
          storefrontId: sf.id,
          configVersion: sf.config_version,
          hostname: ctx.normalizedHostname,
          isPrivate: true,
        }),
      }
    );
  }

  // 10. POST /api/v1/public/orders — Server-Validated Transactional Online Order Creation (Section 9)
  if (pathname === "/api/v1/public/orders" && req.method === "POST") {
    const privHeaders = buildResponseHeaders({ req, storefrontId: sf.id, isPrivate: true });

    if (Number(settings?.maintenance_mode || 0) === 1) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "storefront_maintenance",
          message:
            settings?.maintenance_message ||
            "This pharmacy website is temporarily in maintenance mode. Please contact the pharmacy directly.",
        }),
        { status: 503, headers: privHeaders }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: privHeaders,
      });
    }

    const idempotencyKey = String(body?.idempotency_key || "").trim();
    const customerName = String(body?.customer_name || "").trim();
    const customerPhone = String(body?.customer_phone || "").trim();
    const customerEmail = body?.customer_email ? String(body.customer_email).trim() : null;
    const fulfillmentType: "delivery" | "pickup" =
      body?.fulfillment_type === "pickup" ? "pickup" : "delivery";
    const deliveryAddress = body?.delivery_address ? String(body.delivery_address).trim() : null;
    const deliveryCity = body?.delivery_city
      ? String(body.delivery_city).trim()
      : sf.city || "Lahore";
    const deliveryZoneId = body?.delivery_zone_id ? String(body.delivery_zone_id).trim() : null;
    const branchId = body?.branch_id ? String(body.branch_id).trim() : "main";
    const paymentMethod: "cod" | "bank_transfer" | "counter_pay" =
      body?.payment_method === "bank_transfer"
        ? "bank_transfer"
        : fulfillmentType === "pickup" && body?.payment_method === "counter_pay"
        ? "counter_pay"
        : "cod";
    const customerNotes = body?.customer_notes ? String(body.customer_notes).trim().slice(0, 600) : null;
    const deliveryInstructions = body?.delivery_instructions
      ? String(body.delivery_instructions).trim().slice(0, 600)
      : customerNotes;
    const rxInquiryNote = body?.rx_inquiry_note ? String(body.rx_inquiry_note).trim().slice(0, 600) : null;
    const requestedItems: Array<{
      product_id: string;
      qty: number;
      selling_unit_id?: string;
      selling_unit_name?: string;
    }> = Array.isArray(body?.items) ? body.items : [];

    if (!customerName || customerName.length < 2) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_customer_name",
          message: "Please enter your full name.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    if (!customerPhone || customerPhone.replace(/\D/g, "").length < 7) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_customer_phone",
          message: "Please enter a valid contact phone number.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    if (fulfillmentType === "delivery" && Number(settings?.delivery_enabled ?? 1) !== 1) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "delivery_disabled",
          message: "Home delivery is currently disabled for this pharmacy. Please select counter pickup.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    if (fulfillmentType === "pickup" && Number(settings?.pickup_enabled ?? 1) !== 1) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "pickup_disabled",
          message: "Counter pickup is currently disabled for this pharmacy.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    if (fulfillmentType === "delivery" && (!deliveryAddress || deliveryAddress.length < 5)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "missing_delivery_address",
          message: "Please enter a complete delivery address.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    if (requestedItems.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "empty_cart",
          message: "Your shopping cart is empty.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    const maxItemsPerOrder = Number(settings?.max_items_per_order || 25);
    if (requestedItems.length > maxItemsPerOrder) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "too_many_line_items",
          message: `Maximum ${maxItemsPerOrder} distinct items allowed per online order.`,
        }),
        { status: 400, headers: privHeaders }
      );
    }

    // 1. Check duplicate order via idempotency_key
    if (idempotencyKey) {
      const existingOrder = await env.DB.prepare(
        `SELECT * FROM storefront_orders
         WHERE storefront_id = ? AND pharmacy_id = ? AND idempotency_key = ?
         LIMIT 1`
      )
        .bind(sf.id, sf.pharmacy_id, idempotencyKey)
        .first<StorefrontOrderRecord>();

      if (existingOrder) {
        const existingItems = await env.DB.prepare(
          `SELECT * FROM storefront_order_items
           WHERE storefront_id = ? AND pharmacy_id = ? AND order_id = ?`
        )
          .bind(sf.id, sf.pharmacy_id, existingOrder.id)
          .all<StorefrontOrderItemRecord>();

        return new Response(
          JSON.stringify({
            ok: true,
            duplicate: true,
            order: {
              ...existingOrder,
              items: existingItems.results || [],
            },
          }),
          { status: 200, headers: privHeaders }
        );
      }
    }

    // 2. Independently validate every product ID, selling unit, multiplier & compute authoritative server prices
    let subtotalPkr = 0;
    let orderRequiresRx = false;
    const baseQtyByPosProductId = new Map<string, number>();
    const validatedLines: Array<{
      productId: string;
      posProductId: string;
      skuCode: string | null;
      name: string;
      unitLabel: string;
      sellingUnitId: string;
      sellingUnitName: string;
      unitMultiplier: number;
      qty: number;
      baseQtyRequired: number;
      unitPricePkr: number;
      lineTotalPkr: number;
      requiresPrescription: boolean;
    }> = [];

    for (const reqLine of requestedItems) {
      const prodId = String(reqLine?.product_id || "").trim();
      const qty = Math.floor(Number(reqLine?.qty || 0));
      const reqUnitId = reqLine?.selling_unit_id ? String(reqLine.selling_unit_id).trim() : "";
      const reqUnitName = reqLine?.selling_unit_name ? String(reqLine.selling_unit_name).trim() : "";

      if (!prodId || qty <= 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "invalid_item_quantity",
            message: "Each order item must specify a valid product and positive quantity.",
          }),
          { status: 400, headers: privHeaders }
        );
      }

      const dbProd = await env.DB.prepare(
        `SELECT ${SAFE_PRODUCT_COLUMNS}
         FROM storefront_products
         WHERE storefront_id = ? AND pharmacy_id = ?
           AND (id = ? OR pos_product_id = ?)
           AND publish_status = 'published'
           AND is_controlled_substance = 0
         LIMIT 1`
      )
        .bind(sf.id, sf.pharmacy_id, prodId, prodId)
        .first<Record<string, unknown>>();

      if (!dbProd) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "product_unavailable",
            product_id: prodId,
            message: "One or more selected products are no longer available for online ordering.",
          }),
          { status: 400, headers: privHeaders }
        );
      }

      if (
        dbProd.availability_status === "out_of_stock" ||
        dbProd.availability_status === "unavailable"
      ) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "product_out_of_stock",
            product_id: String(dbProd.id),
            message: `'${dbProd.name}' is currently out of stock.`,
          }),
          { status: 400, headers: privHeaders }
        );
      }

      const basePrice = Number(dbProd.public_selling_price_pkr || 0);
      const overridePrice =
        dbProd.override_price_pkr !== null &&
        dbProd.override_price_pkr !== undefined &&
        Number(dbProd.override_price_pkr) >= 0
          ? Number(dbProd.override_price_pkr)
          : null;
      const defaultEffectivePrice = overridePrice !== null ? overridePrice : basePrice;
      const compareAt =
        dbProd.compare_at_price_pkr !== null && dbProd.compare_at_price_pkr !== undefined
          ? Number(dbProd.compare_at_price_pkr)
          : null;

      const availableUnits = parseProductSellingUnits(
        dbProd,
        defaultEffectivePrice,
        compareAt,
        overridePrice
      );

      let matchedUnit =
        (reqUnitId
          ? availableUnits.find((u) => u.unit_id === reqUnitId)
          : undefined) ||
        (reqUnitName
          ? availableUnits.find(
              (u) =>
                u.name.toLowerCase() === reqUnitName.toLowerCase() ||
                u.unit_name.toLowerCase() === reqUnitName.toLowerCase() ||
                u.label.toLowerCase() === reqUnitName.toLowerCase()
            )
          : undefined);

      if (!matchedUnit) {
        if (reqUnitId || reqUnitName) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "invalid_selling_unit",
              product_id: String(dbProd.id),
              message: `Selected unit '${reqUnitName || reqUnitId}' is not a valid POS selling unit for '${dbProd.name}'.`,
            }),
            { status: 400, headers: privHeaders }
          );
        }
        matchedUnit = availableUnits.find((u) => u.is_default) || availableUnits[0];
      }

      const maxQty = Math.max(
        1,
        Number(matchedUnit.max_qty && matchedUnit.max_qty > 0 ? matchedUnit.max_qty : dbProd.max_order_qty || 20)
      );
      if (matchedUnit.in_stock === false || (matchedUnit.max_qty !== undefined && matchedUnit.max_qty <= 0)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "insufficient_unit_stock",
            product_id: String(dbProd.id),
            message: `Insufficient stock to fulfill '${dbProd.name}' in selected unit '${matchedUnit.name}'.`,
          }),
          { status: 400, headers: privHeaders }
        );
      }
      if (qty > maxQty) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "exceeds_max_order_qty",
            product_id: String(dbProd.id),
            message: `Maximum ${maxQty} ${matchedUnit.name} allowed per order for '${dbProd.name}'.`,
          }),
          { status: 400, headers: privHeaders }
        );
      }

      const posProductId = String(dbProd.pos_product_id);
      const unitMultiplier = Math.max(0.0001, Number(matchedUnit.multiplier || 1));
      const baseQtyRequired = Number((qty * unitMultiplier).toFixed(4));
      const cumulativeBaseQty = Number(
        ((baseQtyByPosProductId.get(posProductId) || 0) + baseQtyRequired).toFixed(4)
      );
      baseQtyByPosProductId.set(posProductId, cumulativeBaseQty);

      const availableBaseQty = Number(dbProd.available_base_qty || 0);
      if (availableBaseQty > 0 && cumulativeBaseQty > availableBaseQty + 1e-6) {
        const baseUnitLbl = String(dbProd.base_unit_label || dbProd.unit_label || "unit");
        return new Response(
          JSON.stringify({
            ok: false,
            error: "insufficient_unit_stock",
            product_id: String(dbProd.id),
            message: `Requested quantity of '${dbProd.name}' (${matchedUnit.name}) exceeds available counter stock (${availableBaseQty} ${baseUnitLbl}).`,
          }),
          { status: 400, headers: privHeaders }
        );
      }

      const effectiveUnitPrice = Number(matchedUnit.price_pkr);
      const lineTotal = Number((effectiveUnitPrice * qty).toFixed(2));
      const isRx = Number(dbProd.requires_prescription) === 1;

      if (isRx) {
        orderRequiresRx = true;
      }

      subtotalPkr = Number((subtotalPkr + lineTotal).toFixed(2));
      validatedLines.push({
        productId: String(dbProd.id),
        posProductId,
        skuCode: dbProd.sku_code ? String(dbProd.sku_code) : null,
        name: String(dbProd.name),
        unitLabel: String(matchedUnit.label || matchedUnit.name),
        sellingUnitId: String(matchedUnit.unit_id),
        sellingUnitName: String(matchedUnit.name),
        unitMultiplier,
        qty,
        baseQtyRequired,
        unitPricePkr: effectiveUnitPrice,
        lineTotalPkr: lineTotal,
        requiresPrescription: isRx,
      });
    }

    // If prescription items are included and pharmacist verification is required, ensure customer acknowledged or provided pharmacist note
    if (
      orderRequiresRx &&
      Number(settings?.require_rx_for_prescription_items ?? 1) === 1 &&
      !rxInquiryNote &&
      body?.rx_acknowledged !== true
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "prescription_confirmation_required",
          message:
            "Your order includes prescription-required medicine(s). Please confirm that you hold a valid registered doctor's prescription for pharmacist verification before dispensing.",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    // 3. Validate minimum order amount & delivery fee
    let minOrderAmount = Number(settings?.min_order_amount_pkr ?? 300);
    let deliveryFeePkr =
      fulfillmentType === "delivery" ? Number(settings?.standard_delivery_fee_pkr ?? 150) : 0;
    let freeThreshold = Number(settings?.free_delivery_threshold_pkr ?? 2000);

    if (fulfillmentType === "delivery" && deliveryZoneId) {
      const zoneRow = await env.DB.prepare(
        `SELECT delivery_fee_pkr, min_order_pkr, free_delivery_above_pkr
         FROM storefront_delivery_zones
         WHERE id = ? AND storefront_id = ? AND pharmacy_id = ? AND is_active = 1
         LIMIT 1`
      )
        .bind(deliveryZoneId, sf.id, sf.pharmacy_id)
        .first<{
          delivery_fee_pkr: number;
          min_order_pkr: number;
          free_delivery_above_pkr: number | null;
        }>();

      if (zoneRow) {
        deliveryFeePkr = Number(zoneRow.delivery_fee_pkr ?? deliveryFeePkr);
        minOrderAmount = Number(zoneRow.min_order_pkr ?? minOrderAmount);
        if (zoneRow.free_delivery_above_pkr !== null && zoneRow.free_delivery_above_pkr !== undefined) {
          freeThreshold = Number(zoneRow.free_delivery_above_pkr);
        }
      }
    }

    if (fulfillmentType === "delivery" && subtotalPkr < minOrderAmount) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "below_minimum_order",
          min_order_amount_pkr: minOrderAmount,
          subtotal_pkr: subtotalPkr,
          message: `Minimum order amount for delivery is PKR ${minOrderAmount.toLocaleString()}.`,
        }),
        { status: 400, headers: privHeaders }
      );
    }

    if (fulfillmentType === "delivery" && freeThreshold > 0 && subtotalPkr >= freeThreshold) {
      deliveryFeePkr = 0;
    }

    // Optional promo code discount validation
    let discountPkr = 0;
    let appliedPromoCodeUsed: string | null = null;
    let appliedPromoTitle: string | null = null;
    const promoCode = body?.promo_code ? String(body.promo_code).trim().toUpperCase() : "";
    if (promoCode) {
      const nowIso = new Date().toISOString();
      const promo = await env.DB.prepare(
        `SELECT * FROM storefront_promotions
         WHERE storefront_id = ? AND pharmacy_id = ? AND is_active = 1
           AND UPPER(COALESCE(code, '')) = ?
           AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
           AND (ends_at IS NULL OR ends_at = '' OR ends_at >= ?)
         LIMIT 1`
      )
        .bind(sf.id, sf.pharmacy_id, promoCode, nowIso, nowIso)
        .first<StorefrontPromotionRecord>();

      if (promo && subtotalPkr >= Number(promo.min_order_pkr || 0)) {
        if (promo.promo_type === "percentage") {
          discountPkr = Number(((subtotalPkr * Number(promo.discount_value || 0)) / 100).toFixed(2));
        } else if (promo.promo_type === "fixed_amount") {
          discountPkr = Number(Math.min(subtotalPkr, Number(promo.discount_value || 0)).toFixed(2));
        }
        if (discountPkr > 0) {
          appliedPromoCodeUsed = promo.code ? String(promo.code).trim().toUpperCase() : promoCode;
          appliedPromoTitle = promo.title ? String(promo.title).trim() : null;
        }
      }
    }

    const totalPkr = Number(Math.max(0, subtotalPkr - discountPkr + deliveryFeePkr).toFixed(2));
    const orderId = `sfo_${crypto.randomUUID()}`;
    const shortRand = Math.floor(1000 + Math.random() * 9000);
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const orderNumber = `ORD-${datePart}-${shortRand}`;
    const trackingToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const nowIso = new Date().toISOString();
    const initialPaymentStatus: StorefrontPaymentStatus =
      paymentMethod === "cod" ? "pending_cod" : "unpaid";
    const initialCodBalanceDue = paymentMethod === "cod" ? totalPkr : null;

    let branchNameSnapshot: string | null = null;
    try {
      const br = await env.DB.prepare(
        `SELECT name FROM storefront_branches
         WHERE storefront_id = ? AND pharmacy_id = ? AND (id = ? OR pos_branch_id = ?)
         LIMIT 1`
      )
        .bind(sf.id, sf.pharmacy_id, branchId, branchId)
        .first<{ name: string }>();
      branchNameSnapshot = br?.name || `${sf.pharmacy_name} (Main Counter)`;
    } catch {
      branchNameSnapshot = `${sf.pharmacy_name} (Main Counter)`;
    }

    await env.DB.prepare(
      `INSERT INTO storefront_orders (
         id, storefront_id, pharmacy_id, branch_id, branch_name_snapshot, order_number,
         customer_name, customer_phone, customer_email,
         fulfillment_type, delivery_address, delivery_city, delivery_zone_id, delivery_instructions,
         payment_method, payment_status, status, subtotal_pkr, delivery_fee_pkr, discount_pkr, total_pkr,
         cod_paid_amount_pkr, cod_balance_due_pkr,
         requires_prescription, rx_inquiry_note, customer_notes,
         idempotency_key, tracking_token, pos_handoff_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirmation', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
      .bind(
        orderId,
        sf.id,
        sf.pharmacy_id,
        branchId,
        branchNameSnapshot,
        orderNumber,
        customerName,
        customerPhone,
        customerEmail,
        fulfillmentType,
        deliveryAddress,
        deliveryCity,
        deliveryZoneId,
        deliveryInstructions,
        paymentMethod,
        initialPaymentStatus,
        subtotalPkr,
        deliveryFeePkr,
        discountPkr,
        totalPkr,
        initialCodBalanceDue,
        orderRequiresRx ? 1 : 0,
        rxInquiryNote,
        customerNotes,
        idempotencyKey || null,
        trackingToken,
        nowIso,
        nowIso
      )
      .run();

    const persistedItems: StorefrontOrderItemRecord[] = [];
    for (const line of validatedLines) {
      const itemId = `sfoi_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO storefront_order_items (
           id, storefront_id, pharmacy_id, order_id, product_id, pos_product_id, sku_code_snapshot,
           product_name_snapshot, unit_label_snapshot, selling_unit_id, selling_unit_name,
           unit_multiplier, qty, base_qty_required, unit_price_pkr, line_total_pkr,
           requires_prescription, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          itemId,
          sf.id,
          sf.pharmacy_id,
          orderId,
          line.productId,
          line.posProductId,
          line.skuCode,
          line.name,
          line.unitLabel,
          line.sellingUnitId,
          line.sellingUnitName,
          line.unitMultiplier,
          line.qty,
          line.baseQtyRequired,
          line.unitPricePkr,
          line.lineTotalPkr,
          line.requiresPrescription ? 1 : 0,
          nowIso
        )
        .run();

      persistedItems.push({
        id: itemId,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        order_id: orderId,
        product_id: line.productId,
        pos_product_id: line.posProductId,
        sku_code_snapshot: line.skuCode,
        product_name_snapshot: line.name,
        unit_label_snapshot: line.unitLabel,
        selling_unit_id: line.sellingUnitId,
        selling_unit_name: line.sellingUnitName,
        unit_multiplier: line.unitMultiplier,
        qty: line.qty,
        base_qty_required: line.baseQtyRequired,
        unit_price_pkr: line.unitPricePkr,
        line_total_pkr: line.lineTotalPkr,
        requires_prescription: line.requiresPrescription ? 1 : 0,
        created_at: nowIso,
        product_name: line.name,
        unit_label: line.unitLabel,
        sku_code: line.skuCode,
      });
    }

    const initialHistoryNote = orderRequiresRx
      ? "Online order submitted. Awaiting pharmacist prescription review & stock confirmation."
      : "Online order submitted. Awaiting pharmacy confirmation.";

    await env.DB.prepare(
      `INSERT INTO storefront_order_status_history (
         id, storefront_id, pharmacy_id, order_id, from_status, to_status,
         actor_type, actor_id, note, created_at
       ) VALUES (?, ?, ?, ?, NULL, 'pending_confirmation', 'customer', ?, ?, ?)`
    )
      .bind(
        `sfosh_${crypto.randomUUID()}`,
        sf.id,
        sf.pharmacy_id,
        orderId,
        customerPhone,
        initialHistoryNote,
        nowIso
      )
      .run();

    invalidateOrderNotifCache(sf.id, sf.pharmacy_id);

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      publicRequests: 1,
      ordersCreated: 1,
      d1RowsReadEst: validatedLines.length + 2,
      d1RowsWrittenEst: validatedLines.length + 3,
    });

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "public_order_created",
      actorType: "system",
      actorId: customerPhone,
      entityType: "order",
      entityId: orderId,
      summary: `Online order ${orderNumber} placed by ${customerName} (PKR ${totalPkr.toLocaleString()}, ${fulfillmentType}).`,
      metadata: {
        order_number: orderNumber,
        fulfillment_type: fulfillmentType,
        total_pkr: totalPkr,
        items_count: validatedLines.length,
        requires_prescription: orderRequiresRx,
      },
    });

    const createdOrder = await env.DB.prepare(
      "SELECT * FROM storefront_orders WHERE id = ? AND storefront_id = ? LIMIT 1"
    )
      .bind(orderId, sf.id)
      .first<StorefrontOrderRecord>();

    const trimmedEmail = String(customerEmail || "").trim();
    const isValidCustomerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    let invoiceEmailQueued = false;

    if (isValidCustomerEmail && env.STOREFRONT_ADMIN_SECRET) {
      invoiceEmailQueued = true;
      const sendInvoiceTask = (async () => {
        try {
          const brandingRow = await env.DB.prepare(
            "SELECT display_name, logo_url, logo_media_id, primary_color FROM storefront_branding WHERE storefront_id = ? LIMIT 1"
          )
            .bind(sf.id)
            .first<{
              display_name: string | null;
              logo_url: string | null;
              logo_media_id: string | null;
              primary_color: string | null;
            }>();

          let logoPdfDataUrl: string | null = null;
          if (brandingRow?.logo_media_id) {
            const mediaRow = await env.DB.prepare(
              "SELECT variants_json FROM storefront_media WHERE id = ? AND storefront_id = ? LIMIT 1"
            )
              .bind(brandingRow.logo_media_id, sf.id)
              .first<{ variants_json: string | null }>();
            if (mediaRow?.variants_json) {
              try {
                const parsedVars = JSON.parse(mediaRow.variants_json);
                if (typeof parsedVars?.pdf_logo_jpeg === "string") {
                  logoPdfDataUrl = parsedVars.pdf_logo_jpeg;
                }
              } catch {
                // Ignore malformed variants_json
              }
            }
          }

          const workerOrigin = url.origin;
          const rawLogo = brandingRow?.logo_url || null;
          const resolvedLogoPublicUrl = rawLogo
            ? rawLogo.startsWith("/")
              ? `${workerOrigin}${rawLogo}${rawLogo.includes("?") ? "&" : "?"}store=${encodeURIComponent(sf.slug)}`
              : rawLogo
            : null;
          const storefrontPublicUrl = `${workerOrigin}/s/${encodeURIComponent(sf.slug)}`;
          const portalBase = (env.PORTAL_INTERNAL_URL || "https://mediqoo.vercel.app").replace(
            /\/+$/,
            ""
          );

          await fetch(`${portalBase}/api/internal/storefront/order-invoice-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Storefront-Admin-Secret": env.STOREFRONT_ADMIN_SECRET,
            },
            body: JSON.stringify({
              storefront: {
                id: sf.id,
                pharmacy_id: sf.pharmacy_id,
                slug: sf.slug,
                pharmacy_name:
                  (brandingRow?.display_name && brandingRow.display_name.trim()) ||
                  sf.pharmacy_name,
                address_line: sf.address_line,
                city: sf.city,
                contact_phone: sf.contact_phone,
                whatsapp_phone: sf.whatsapp_phone,
                contact_email: sf.contact_email,
                drug_sale_license_no: sf.drug_sale_license_no,
                pharmacist_name: sf.pharmacist_name,
                primary_color: brandingRow?.primary_color || "#176B58",
                logo_url: resolvedLogoPublicUrl,
                logo_pdf_data_url: logoPdfDataUrl,
                public_url: storefrontPublicUrl,
              },
              order: {
                ...createdOrder,
                applied_promo_code: appliedPromoCodeUsed,
                applied_promo_title: appliedPromoTitle,
                items: persistedItems,
              },
            }),
          });
        } catch (err) {
          console.error("[StorefrontWorker] Invoice email dispatch error:", err);
        }
      })();

      if (execCtx && typeof execCtx.waitUntil === "function") {
        execCtx.waitUntil(sendInvoiceTask);
      } else {
        await sendInvoiceTask;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        duplicate: false,
        invoice_email_queued: invoiceEmailQueued,
        order: {
          ...createdOrder,
          applied_promo_code: appliedPromoCodeUsed,
          applied_promo_title: appliedPromoTitle,
          items: persistedItems,
        },
      }),
      { status: 201, headers: privHeaders }
    );
  }

  // 11. GET /api/v1/public/orders/track — Customer-Safe Order Tracking (Section 5 & 9)
  if (pathname === "/api/v1/public/orders/track" && req.method === "GET") {
    const privHeaders = buildResponseHeaders({ req, storefrontId: sf.id, isPrivate: true });
    const orderNumber = (url.searchParams.get("order_number") || "").trim().toUpperCase();
    const phoneParam = (url.searchParams.get("phone") || "").replace(/\D/g, "");
    const tokenParam = (url.searchParams.get("token") || "").trim();

    if (!orderNumber) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "missing_order_number",
          message: "Please provide your Order Number (e.g. ORD-...).",
        }),
        { status: 400, headers: privHeaders }
      );
    }

    const ord = await env.DB.prepare(
      `SELECT * FROM storefront_orders
       WHERE storefront_id = ? AND pharmacy_id = ? AND UPPER(order_number) = ?
       LIMIT 1`
    )
      .bind(sf.id, sf.pharmacy_id, orderNumber)
      .first<StorefrontOrderRecord>();

    if (!ord) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "order_not_found",
          message: "No order found with that reference number on this pharmacy website.",
        }),
        { status: 404, headers: privHeaders }
      );
    }

    // Order reference number (`ORD-...`) scoped to this tenant storefront is sufficient for tracking;
    // sensitive customer phone digits remain masked (`***-***-XXXX`) in the response.
    const storedPhoneDigits = String(ord.customer_phone || "").replace(/\D/g, "");

    const [itemsRes, historyRes] = await Promise.all([
      env.DB.prepare(
        `SELECT id, product_id, pos_product_id, sku_code_snapshot, product_name_snapshot, unit_label_snapshot,
                selling_unit_id, selling_unit_name, unit_multiplier, qty, base_qty_required,
                unit_price_pkr, line_total_pkr, requires_prescription
         FROM storefront_order_items
         WHERE storefront_id = ? AND pharmacy_id = ? AND order_id = ?
         ORDER BY created_at ASC`
      )
        .bind(sf.id, sf.pharmacy_id, ord.id)
        .all<StorefrontOrderItemRecord>(),
      env.DB.prepare(
        `SELECT id, from_status, to_status, note, created_at
         FROM storefront_order_status_history
         WHERE storefront_id = ? AND pharmacy_id = ? AND order_id = ?
         ORDER BY created_at ASC`
      )
        .bind(sf.id, sf.pharmacy_id, ord.id)
        .all<StorefrontOrderStatusHistoryRecord>(),
    ]);

    const effectiveStatus = resolveEffectiveOrderStatus(ord as any);

    return new Response(
      JSON.stringify({
        ok: true,
        order: {
          id: ord.id,
          order_number: ord.order_number,
          status: effectiveStatus,
          payment_status:
            (ord as any).payment_status ||
            (ord.payment_method === "cod" ? "pending_cod" : "unpaid"),
          fulfillment_type: ord.fulfillment_type,
          branch_id: ord.branch_id,
          branch_name_snapshot: (ord as any).branch_name_snapshot || null,
          pos_invoice_number: ord.pos_invoice_number || null,
          customer_name: ord.customer_name,
          customer_phone_masked:
            storedPhoneDigits.length >= 4
              ? `***-***-${storedPhoneDigits.slice(-4)}`
              : ord.customer_phone,
          delivery_city: ord.delivery_city,
          delivery_address: ord.delivery_address,
          delivery_instructions: (ord as any).delivery_instructions || ord.customer_notes || null,
          payment_method: ord.payment_method,
          subtotal_pkr: ord.subtotal_pkr,
          delivery_fee_pkr: ord.delivery_fee_pkr,
          discount_pkr: ord.discount_pkr,
          total_pkr: ord.total_pkr,
          cod_paid_amount_pkr: Number((ord as any).cod_paid_amount_pkr || 0),
          cod_balance_due_pkr:
            (ord as any).cod_balance_due_pkr !== null &&
            (ord as any).cod_balance_due_pkr !== undefined
              ? Number((ord as any).cod_balance_due_pkr)
              : ord.payment_method === "cod" &&
                ((ord as any).payment_status || "pending_cod") !== "paid"
              ? Math.max(0, Number(ord.total_pkr || 0) - Number((ord as any).cod_paid_amount_pkr || 0))
              : 0,
          requires_prescription: Number(ord.requires_prescription) === 1,
          customer_notes: ord.customer_notes,
          created_at: ord.created_at,
          updated_at: ord.updated_at,
          items: (itemsRes.results || []).map((it) => ({
            ...it,
            product_name: it.product_name_snapshot,
            unit_label: it.selling_unit_name || it.unit_label_snapshot,
          })),
          history: historyRes.results || [],
        },
      }),
      { status: 200, headers: privHeaders }
    );
  }



  // 13. GET /api/v1/public/sitemap.xml & /api/v1/public/robots.txt (Auto-SEO from R2 Snapshot -> 0 D1 reads!)
  if (pathname === "/api/v1/public/sitemap.xml" && req.method === "GET") {
    const baseUrl = `https://${sf.primary_domain}`;
    const { snapshot } = await getCatalogSnapshotForTenant(env, sf, execCtx);
    const todayStr = new Date().toISOString().slice(0, 10);

    const staticPages = [
      { path: "", priority: "1.0", freq: "daily" },
      { path: "/catalog", priority: "0.95", freq: "daily" },
      { path: "/delivery", priority: "0.7", freq: "weekly" },
      { path: "/branches", priority: "0.7", freq: "weekly" },
      { path: "/about", priority: "0.7", freq: "monthly" },
      { path: "/contact", priority: "0.7", freq: "monthly" },
      { path: "/track", priority: "0.6", freq: "weekly" },
    ];

    const categoryUrls = (snapshot.categories || [])
      .filter((c) => c.name && !/^\d+$/.test(String(c.name).trim()))
      .slice(0, 40)
      .map(
        (c) =>
          `<url><loc>${baseUrl}/catalog?category=${encodeURIComponent(String(c.name))}</loc><lastmod>${todayStr}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`
      );

    const productUrls = (snapshot.products || [])
      .slice(0, 2000)
      .map((pr) => {
        const slug = encodeURIComponent(String(pr.slug || pr.id || ""));
        const lastmod = String(pr.updated_at || todayStr).slice(0, 10);
        return `<url><loc>${baseUrl}/product/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      });

    const urlsXml = [
      ...staticPages.map(
        (p) =>
          `<url><loc>${baseUrl}${p.path}</loc><lastmod>${todayStr}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`
      ),
      ...categoryUrls,
      ...productUrls,
    ].join("\n  ");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urlsXml}\n</urlset>`;
    const headers = buildResponseHeaders({
      req,
      storefrontId: sf.id,
      hostname: ctx.normalizedHostname,
      cacheMaxAgeSec: 3600,
    });
    headers.set("Content-Type", "application/xml; charset=utf-8");
    return new Response(xml, { status: 200, headers });
  }

  if (pathname === "/api/v1/public/robots.txt" && req.method === "GET") {
    const txt = `User-agent: *\nAllow: /\nDisallow: /api/v1/manage/\nDisallow: /api/v1/sync/\nDisallow: /checkout\nSitemap: https://${sf.primary_domain}/sitemap.xml\n`;
    const headers = buildResponseHeaders({
      req,
      storefrontId: sf.id,
      hostname: ctx.normalizedHostname,
      cacheMaxAgeSec: 3600,
    });
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(txt, { status: 200, headers });
  }

  return new Response(
    JSON.stringify({ ok: false, error: "not_found", message: "Unknown public endpoint" }),
    { status: 404, headers: buildResponseHeaders({ req, isPrivate: true }) }
  );
}
