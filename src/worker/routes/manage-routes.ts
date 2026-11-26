/**
 * Storefront Management API Routes (`/api/v1/manage/*`)
 *
 * Security & Authorization Rules (Sections 4, 9, 11, 12, 14):
 * - Every endpoint requires a verified management actor (`verifyManagementAuth`).
 * - Super Admin (`actor.actorType === 'super_admin'`) has platform-wide authority.
 * - Portal Owners/Managers (`actor.scopedPharmacyId !== null`) are strictly restricted
 *   to their own pharmacy's storefront and cannot create/suspend storefronts or access
 *   any other pharmacy's records.
 */

import {
  CLOUDFLARE_FREE_TIER_LIMITS,
  PLATFORM_PRIMARY_BASE_DOMAIN,
  THEME_PRESETS,
} from "../../shared/constants";
import type {
  StorefrontBannerRecord,
  StorefrontBranchRecord,
  StorefrontBrandingRecord,
  StorefrontCategoryRecord,
  StorefrontDomainRecord,
  StorefrontRecord,
  StorefrontSettingsRecord,
  ThemePresetId,
} from "../../shared/types";
import {
  decodeCursor,
  detectForbiddenPrivateKeys,
  encodeCursor,
  normalizeHostname,
  toUrlSlug,
  validateStorefrontSlug,
} from "../../shared/validation";
import type { D1Database, StorefrontWorkerEnv } from "../env";
import {
  buildResponseHeaders,
  sha256Hex,
  verifyManagementAuth,
  type ManagementActor,
} from "../security";
import {
  getTodayUtcDateString,
  recordStorefrontUsage,
  writeStorefrontAuditLog,
} from "../usage-tracker";
import { recalculateStorefrontCatalogCounts } from "./sync-routes";
import {
  getCentralLibraryOverview,
  listCanonicalMedicines,
  upsertCanonicalMedicine,
  matchAndPropagateCanonicalMedicine,
  batchMatchStorefrontProducts,
  assignProductImage,
  getDiscoveryQueueOverview,
  listDiscoveryQueueItems,
  importMasterCatalogToDiscoveryQueue,
  getDiscoveryBatchForCollector,
  submitDiscoveryResult,
  approveDiscoveryCandidate,
  rejectDiscoveryCandidate,
  updateCollectorSettings,
  retryFailedDiscoveryJobs,
  bulkUploadVerifiedCentralImages,
} from "../central-image-service";
import {
  bumpStorefrontConfigVersion,
  invalidateCategoryMetaCache,
  resolveSharedMediaPublicUrl,
} from "../edge-cache-and-snapshots";
import { invalidateTenantBundleCache } from "../domain-resolver";
import { computeNormalizedCoreKey } from "../../shared/medicine-identity-matcher";
import {
  loadStorefrontCatalogDoc,
  rebuildAndSaveCentralImageIndex,
  saveStorefrontCatalogDoc,
  syncStorefrontMetadataFromCatalogDoc,
  type R2CatalogProductRecord,
} from "../r2-catalog-store";

function computeSetupProgress(
  sf: StorefrontRecord,
  branding: StorefrontBrandingRecord | null,
  settings: StorefrontSettingsRecord | null,
  domains: StorefrontDomainRecord[]
) {
  const hasPrimaryVerifiedDomain = domains.some(
    (d) => d.is_primary === 1 && d.verification_status === "verified"
  );
  const hasBrandingConfigured = Boolean(
    branding?.display_name &&
      branding?.primary_color &&
      (branding?.tagline || branding?.hero_title)
  );
  const hasContactAndLicense = Boolean(
    (sf.contact_phone || sf.whatsapp_phone) && sf.address_line && sf.city
  );
  const hasDeliveryOrPickup = Boolean(
    settings && (Number(settings.delivery_enabled) === 1 || Number(settings.pickup_enabled) === 1)
  );
  const hasPublishedCatalog = Number(sf.published_products_count || 0) > 0;

  const steps = [
    {
      id: "storefront_provisioned",
      label: "Storefront Subdomain & Tenant Identity",
      completed: Boolean(sf.id && sf.slug),
      detail: `${sf.slug}.${PLATFORM_PRIMARY_BASE_DOMAIN}`,
    },
    {
      id: "domain_verified",
      label: "Domain Resolution Verified",
      completed: hasPrimaryVerifiedDomain,
      detail: sf.primary_domain,
    },
    {
      id: "branding_configured",
      label: "Pharmacy Branding & Theme",
      completed: hasBrandingConfigured,
      detail: branding ? `Theme: ${branding.theme_preset}` : "Pending configuration",
    },
    {
      id: "contact_and_delivery",
      label: "Contact, Address & Delivery/Pickup Rules",
      completed: hasContactAndLicense && hasDeliveryOrPickup,
      detail: hasContactAndLicense ? `${sf.city} • ${sf.contact_phone || sf.whatsapp_phone}` : "Add phone & address",
    },
    {
      id: "catalog_published",
      label: "Initial Approved Catalog Published",
      completed: hasPublishedCatalog,
      detail: `${sf.published_products_count || 0} products published`,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const percent = Math.round((completedCount / steps.length) * 100);

  return {
    completed_steps: completedCount,
    total_steps: steps.length,
    percent,
    steps,
  };
}

async function loadAndAuthorizeStorefront(
  db: D1Database,
  idOrPharmacyId: string,
  actor: ManagementActor,
  byPharmacyId = false
): Promise<{ storefront: StorefrontRecord } | { error: string; status: 403 | 404 }> {
  const sf = byPharmacyId
    ? await db
        .prepare("SELECT * FROM storefronts WHERE pharmacy_id = ? LIMIT 1")
        .bind(idOrPharmacyId)
        .first<StorefrontRecord>()
    : await db
        .prepare("SELECT * FROM storefronts WHERE id = ? LIMIT 1")
        .bind(idOrPharmacyId)
        .first<StorefrontRecord>();

  if (!sf) {
    return { error: "Storefront not found.", status: 404 };
  }

  // Enforce tenant isolation for scoped non-super-admin actors
  if (actor.scopedPharmacyId && sf.pharmacy_id !== actor.scopedPharmacyId) {
    return {
      error: "Forbidden: Cross-pharmacy access denied.",
      status: 403,
    };
  }

  return { storefront: sf };
}

export async function handleManageRoutes(
  req: Request,
  env: StorefrontWorkerEnv,
  pathname: string
): Promise<Response> {
  const response = await handleManageRoutesInner(req, env, pathname);
  if (req.method !== "GET" && response.status >= 200 && response.status < 300) {
    const sfMatch = pathname.match(/^\/api\/v1\/manage\/storefronts\/([^/]+)/);
    if (sfMatch?.[1]) {
      const sfId = decodeURIComponent(sfMatch[1]);
      invalidateTenantBundleCache(sfId);
      invalidateCategoryMetaCache(sfId);
    }
  }
  return response;
}

async function handleManageRoutesInner(
  req: Request,
  env: StorefrontWorkerEnv,
  pathname: string
): Promise<Response> {
  const url = new URL(req.url);
  const headers = buildResponseHeaders({ req, isPrivate: true });

  const auth = await verifyManagementAuth(req, env);
  if ("error" in auth) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized", message: auth.error }),
      { status: auth.status, headers }
    );
  }
  const { actor } = auth;
  const baseDomain = env.PLATFORM_BASE_DOMAIN || PLATFORM_PRIMARY_BASE_DOMAIN;

  // ── 0. GET /api/v1/manage/platform-status (Super Admin infrastructure probe) ──
  if (pathname === "/api/v1/manage/platform-status" && req.method === "GET") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: "Super Admin access required." }),
        { status: 403, headers }
      );
    }

    let d1Available = false;
    let d1SchemaMigrated = false;
    let activeWebsites = 0;
    let totalWebsites = 0;
    let d1Error: string | null = null;

    try {
      if (env.DB) {
        const tbl = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='storefronts' LIMIT 1"
        ).first<{ name: string }>();
        d1Available = true;
        if (tbl?.name === "storefronts") {
          d1SchemaMigrated = true;
          const counts = await env.DB.prepare(
            `SELECT
               COUNT(*) AS total_count,
               SUM(CASE WHEN status = 'active' AND website_enabled = 1 THEN 1 ELSE 0 END) AS active_count
             FROM storefronts`
          ).first<{ total_count: number; active_count: number }>();
          totalWebsites = Number(counts?.total_count || 0);
          activeWebsites = Number(counts?.active_count || 0);
        }
      }
    } catch (e: any) {
      d1Error = e?.message || "D1 query failed";
    }

    let r2Available = false;
    let r2Error: string | null = null;
    try {
      if (env.MEDIA_BUCKET && typeof env.MEDIA_BUCKET.list === "function") {
        await env.MEDIA_BUCKET.list({ limit: 1 });
        r2Available = true;
      } else if (env.MEDIA_BUCKET && typeof env.MEDIA_BUCKET.get === "function") {
        await env.MEDIA_BUCKET.get("__health_probe_nonexistent__");
        r2Available = true;
      }
    } catch (e: any) {
      r2Error = e?.message || "R2 probe failed";
    }

    return new Response(
      JSON.stringify({
        ok: true,
        worker: { status: "connected", version: "2.1.0", origin: url.origin },
        d1: {
          status: d1Available && d1SchemaMigrated ? "available" : "unavailable",
          binding_present: Boolean(env.DB),
          schema_migrated: d1SchemaMigrated,
          error: d1Error,
        },
        r2: {
          status: r2Available ? "available" : "unavailable",
          binding_present: Boolean(env.MEDIA_BUCKET),
          error: r2Error,
        },
        website_api: {
          status: d1Available && d1SchemaMigrated ? "working" : "error",
        },
        secrets: {
          admin_secret_configured: Boolean(env.STOREFRONT_ADMIN_SECRET),
          sync_secret_configured: Boolean(env.STOREFRONT_SYNC_SECRET),
        },
        active_websites: activeWebsites,
        total_websites: totalWebsites,
        checked_at: new Date().toISOString(),
      }),
      { status: 200, headers }
    );
  }

  // ── 1. GET /api/v1/manage/overview (Super Admin only) ──
  if (pathname === "/api/v1/manage/overview" && req.method === "GET") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden_super_admin_only" }),
        { status: 403, headers }
      );
    }

    const today = getTodayUtcDateString();
    const [countsRow, ordersRow, usageTodayRow, usage30dRow, mediaRow] = await Promise.all([
      env.DB.prepare(
        `SELECT
           COUNT(*) AS total_storefronts,
           SUM(CASE WHEN website_enabled = 1 THEN 1 ELSE 0 END) AS total_enabled,
           SUM(CASE WHEN status = 'active' AND website_enabled = 1 THEN 1 ELSE 0 END) AS active_websites,
           SUM(CASE WHEN status = 'disabled' OR website_enabled = 0 THEN 1 ELSE 0 END) AS disabled_websites,
           SUM(CASE WHEN status = 'pending_setup' THEN 1 ELSE 0 END) AS pending_setup,
           SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_websites,
           SUM(published_products_count) AS total_public_products
         FROM storefronts`
      ).first<Record<string, number>>(),
      env.DB.prepare(
        `SELECT
           COUNT(*) AS total_orders,
           SUM(CASE WHEN status = 'pending_confirmation' THEN 1 ELSE 0 END) AS pending_orders,
           SUM(total_pkr) AS total_order_value_pkr
         FROM storefront_orders`
      ).first<Record<string, number>>(),
      env.DB.prepare(
        `SELECT
           SUM(public_requests) AS public_requests,
           SUM(search_requests) AS search_requests,
           SUM(sync_requests) AS sync_requests,
           SUM(manage_requests) AS manage_requests,
           SUM(d1_rows_read_est) AS d1_rows_read_est,
           SUM(d1_rows_written_est) AS d1_rows_written_est
         FROM storefront_usage_daily
         WHERE usage_date = ?`
      )
        .bind(today)
        .first<Record<string, number>>(),
      env.DB.prepare(
        `SELECT
           SUM(public_requests) AS public_requests_30d,
           SUM(sync_requests) AS sync_requests_30d,
           SUM(r2_class_a_ops) AS r2_class_a_ops_30d,
           SUM(r2_class_b_ops) AS r2_class_b_ops_30d
         FROM storefront_usage_daily
         WHERE usage_date >= date('now', '-30 days')`
      ).first<Record<string, number>>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS media_objects, COALESCE(SUM(byte_size), 0) AS media_bytes
         FROM storefront_media`
      ).first<Record<string, number>>(),
    ]);

    const todayReads = Number(usageTodayRow?.d1_rows_read_est || 0);
    const todayWrites = Number(usageTodayRow?.d1_rows_written_est || 0);
    const todayWorkerReqs =
      Number(usageTodayRow?.public_requests || 0) +
      Number(usageTodayRow?.sync_requests || 0) +
      Number(usageTodayRow?.manage_requests || 0);

    return new Response(
      JSON.stringify({
        ok: true,
        overview: {
          total_storefronts: Number(countsRow?.total_storefronts || 0),
          total_enabled_websites: Number(countsRow?.total_enabled || 0),
          active_websites: Number(countsRow?.active_websites || 0),
          disabled_websites: Number(countsRow?.disabled_websites || 0),
          pending_setup: Number(countsRow?.pending_setup || 0),
          suspended_websites: Number(countsRow?.suspended_websites || 0),
          total_public_products: Number(countsRow?.total_public_products || 0),
          orders_summary: {
            total_orders: Number(ordersRow?.total_orders || 0),
            pending_orders: Number(ordersRow?.pending_orders || 0),
            total_order_value_pkr: Number(ordersRow?.total_order_value_pkr || 0),
          },
          cloud_usage_summary: {
            usage_date_utc: today,
            today_worker_requests: todayWorkerReqs,
            today_public_requests: Number(usageTodayRow?.public_requests || 0),
            today_search_requests: Number(usageTodayRow?.search_requests || 0),
            today_sync_requests: Number(usageTodayRow?.sync_requests || 0),
            today_d1_rows_read: todayReads,
            today_d1_rows_written: todayWrites,
            r2_media_objects: Number(mediaRow?.media_objects || 0),
            r2_media_bytes: Number(mediaRow?.media_bytes || 0),
            r2_class_a_ops_30d: Number(usage30dRow?.r2_class_a_ops_30d || 0),
            r2_class_b_ops_30d: Number(usage30dRow?.r2_class_b_ops_30d || 0),
            free_tier_limits: CLOUDFLARE_FREE_TIER_LIMITS,
            headroom_pct: {
              workers_requests_daily_pct: Number(
                ((todayWorkerReqs / CLOUDFLARE_FREE_TIER_LIMITS.workers_requests_daily) * 100).toFixed(2)
              ),
              d1_reads_daily_pct: Number(
                ((todayReads / CLOUDFLARE_FREE_TIER_LIMITS.d1_rows_read_daily) * 100).toFixed(3)
              ),
              d1_writes_daily_pct: Number(
                ((todayWrites / CLOUDFLARE_FREE_TIER_LIMITS.d1_rows_written_daily) * 100).toFixed(2)
              ),
            },
          },
        },
      }),
      { status: 200, headers }
    );
  }

  // ── 2. GET /api/v1/manage/storefronts/check-slug ──
  if (pathname === "/api/v1/manage/storefronts/check-slug" && req.method === "GET") {
    const rawSlug = url.searchParams.get("slug") || "";
    const validation = validateStorefrontSlug(rawSlug);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          ok: true,
          available: false,
          normalized_slug: validation.normalized,
          reason: validation.error,
        }),
        { status: 200, headers }
      );
    }

    const primaryHostname = `${validation.normalized}.${baseDomain}`;
    const [existingSf, existingDomain] = await Promise.all([
      env.DB.prepare("SELECT id, pharmacy_name FROM storefronts WHERE slug = ? LIMIT 1")
        .bind(validation.normalized)
        .first<{ id: string; pharmacy_name: string }>(),
      env.DB.prepare("SELECT id, domain_type FROM storefront_domains WHERE hostname = ? LIMIT 1")
        .bind(primaryHostname)
        .first<{ id: string; domain_type: string }>(),
    ]);

    if (existingSf || existingDomain) {
      return new Response(
        JSON.stringify({
          ok: true,
          available: false,
          normalized_slug: validation.normalized,
          primary_domain: primaryHostname,
          reason: existingSf
            ? `Slug '${validation.normalized}' is already assigned to another pharmacy.`
            : `Hostname '${primaryHostname}' is already registered or reserved for redirect.`,
        }),
        { status: 200, headers }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        available: true,
        normalized_slug: validation.normalized,
        primary_domain: primaryHostname,
      }),
      { status: 200, headers }
    );
  }

  // ── 3. GET /api/v1/manage/storefronts (Directory list) ──
  if (pathname === "/api/v1/manage/storefronts" && req.method === "GET") {
    const statusFilter = (url.searchParams.get("status") || "").trim();
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();

    let sql = `
      SELECT s.*,
             b.theme_preset, b.primary_color, b.logo_url, b.display_name,
             (SELECT COUNT(*) FROM storefront_domains d WHERE d.storefront_id = s.id AND d.verification_status = 'verified') AS verified_domains_count,
             (SELECT COUNT(*) FROM storefront_domains d WHERE d.storefront_id = s.id AND d.domain_type = 'custom') AS custom_domains_count,
             (SELECT c.last_cursor FROM storefront_sync_cursors c WHERE c.storefront_id = s.id AND c.stream_name = 'catalog' LIMIT 1) AS last_sync_cursor
      FROM storefronts s
      LEFT JOIN storefront_branding b ON b.storefront_id = s.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (actor.scopedPharmacyId) {
      sql += ` AND s.pharmacy_id = ?`;
      params.push(actor.scopedPharmacyId);
    }
    if (statusFilter && statusFilter !== "all") {
      sql += ` AND s.status = ?`;
      params.push(statusFilter);
    }
    if (search) {
      const pattern = `%${search}%`;
      sql += ` AND (LOWER(s.pharmacy_name) LIKE ? OR LOWER(s.slug) LIKE ? OR LOWER(s.primary_domain) LIKE ? OR LOWER(s.city) LIKE ?)`;
      params.push(pattern, pattern, pattern, pattern);
    }

    sql += ` ORDER BY s.created_at DESC`;

    const { results } = await env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
    return new Response(
      JSON.stringify({
        ok: true,
        storefronts: results.map((r) => ({
          ...r,
          website_enabled: Number(r.website_enabled) === 1,
          pilot_access: Number(r.pilot_access) === 1,
          website_url: String(r.primary_domain || "").endsWith(".workers.dev")
            ? `${url.origin}/s/${r.slug}`
            : `https://${r.primary_domain}`,
          domain_status: Number(r.verified_domains_count || 0) > 0 ? "verified" : "pending",
        })),
      }),
      { status: 200, headers }
    );
  }

  // ── 4. POST /api/v1/manage/storefronts (Create / Activate Website — Super Admin only) ──
  if (pathname === "/api/v1/manage/storefronts" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "forbidden",
          message: "Only Super Admin can create and activate a new pharmacy website.",
        }),
        { status: 403, headers }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers,
      });
    }

    const pharmacyId = String(body?.pharmacy_id || "").trim();
    const pharmacyName = String(body?.pharmacy_name || "").trim();
    const slugValidation = validateStorefrontSlug(body?.slug);

    if (!pharmacyId || !pharmacyName) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "missing_fields",
          message: "pharmacy_id and pharmacy_name are required.",
        }),
        { status: 400, headers }
      );
    }

    if (!slugValidation.valid) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_slug",
          message: slugValidation.error,
        }),
        { status: 400, headers }
      );
    }

    const slug = slugValidation.normalized;
    const primaryDomain = `${slug}.${baseDomain}`;

    // Check uniqueness for pharmacy_id, slug, and primary_domain
    const [existingByPharmacy, existingBySlug, existingDomain] = await Promise.all([
      env.DB.prepare("SELECT id, slug FROM storefronts WHERE pharmacy_id = ? LIMIT 1")
        .bind(pharmacyId)
        .first<{ id: string; slug: string }>(),
      env.DB.prepare("SELECT id, pharmacy_name FROM storefronts WHERE slug = ? LIMIT 1")
        .bind(slug)
        .first<{ id: string; pharmacy_name: string }>(),
      env.DB.prepare("SELECT id FROM storefront_domains WHERE hostname = ? LIMIT 1")
        .bind(primaryDomain)
        .first<{ id: string }>(),
    ]);

    if (existingByPharmacy) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "pharmacy_already_has_storefront",
          message: `This pharmacy already has an assigned storefront (${existingByPharmacy.slug}.${baseDomain}).`,
        }),
        { status: 409, headers }
      );
    }

    if (existingBySlug || existingDomain) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "duplicate_slug",
          message: `The slug '${slug}' (${primaryDomain}) is already in use.`,
        }),
        { status: 409, headers }
      );
    }

    const storefrontId = `sf_${crypto.randomUUID()}`;
    const domainId = `sfd_${crypto.randomUUID()}`;
    const branchId = `sfb_${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    const activateImmediately = body?.activate_immediately !== false;
    const status = activateImmediately ? "active" : "pending_setup";
    const websiteEnabled = activateImmediately ? 1 : 0;
    const pilotAccess = body?.pilot_access ? 1 : 0;
    const entitlementStatus = body?.entitlement_status || (pilotAccess ? "pilot" : "active");
    const planTier = body?.plan_tier || (pilotAccess ? "pilot" : "standard");

    const themePreset: ThemePresetId =
      body?.theme_preset && body.theme_preset in THEME_PRESETS
        ? body.theme_preset
        : "emerald_clinical";
    const presetColors = THEME_PRESETS[themePreset];
    const primaryColor = body?.primary_color || presetColors.primary_color;

    const city = String(body?.city || "Lahore").trim();
    const contactPhone = body?.contact_phone ? String(body.contact_phone).trim() : null;
    const whatsappPhone = body?.whatsapp_phone
      ? String(body.whatsapp_phone).trim()
      : contactPhone;
    const contactEmail = body?.contact_email ? String(body.contact_email).trim() : null;
    const addressLine = body?.address_line ? String(body.address_line).trim() : null;
    const drugLicenseNo = body?.drug_sale_license_no
      ? String(body.drug_sale_license_no).trim()
      : null;
    const pharmacistName = body?.pharmacist_name ? String(body.pharmacist_name).trim() : null;

    // 1. Insert storefront tenant record
    await env.DB.prepare(
      `INSERT INTO storefronts (
         id, pharmacy_id, license_id, project_id, slug, pharmacy_name, legal_business_name,
         status, website_enabled, entitlement_status, pilot_access, plan_tier,
         primary_domain, contact_phone, whatsapp_phone, contact_email,
         address_line, city, timezone, drug_sale_license_no, pharmacist_name,
         config_version, published_products_count, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`
    )
      .bind(
        storefrontId,
        pharmacyId,
        body?.license_id || null,
        body?.project_id || null,
        slug,
        pharmacyName,
        body?.legal_business_name || pharmacyName,
        status,
        websiteEnabled,
        entitlementStatus,
        pilotAccess,
        planTier,
        primaryDomain,
        contactPhone,
        whatsappPhone,
        contactEmail,
        addressLine,
        city,
        body?.timezone || "Asia/Karachi",
        drugLicenseNo,
        pharmacistName,
        actor.actorId,
        nowIso,
        nowIso
      )
      .run();

    // 2. Insert verified primary subdomain
    await env.DB.prepare(
      `INSERT INTO storefront_domains (
         id, storefront_id, pharmacy_id, hostname, domain_type, is_primary,
         verification_status, verification_method, ssl_status, verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'subdomain', 1, 'verified', 'system_subdomain', 'active', ?, ?, ?)`
    )
      .bind(domainId, storefrontId, pharmacyId, primaryDomain, nowIso, nowIso, nowIso)
      .run();

    // 3. Insert branding record
    await env.DB.prepare(
      `INSERT INTO storefront_branding (
         storefront_id, pharmacy_id, display_name, tagline, logo_url,
         hero_title, hero_subtitle, theme_preset, primary_color, secondary_color, accent_color,
         surface_mode, card_style, show_verified_license_badge, updated_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'light', 'elevated', ?, ?, ?, ?)`
    )
      .bind(
        storefrontId,
        pharmacyId,
        body?.display_name || pharmacyName,
        body?.tagline || `Community Pharmacy • ${city}`,
        body?.logo_url || null,
        body?.hero_title || `Order Medicines Online from ${pharmacyName}`,
        body?.hero_subtitle ||
          "Browse available medicines, healthcare essentials, and counter stock for home delivery or pickup.",
        themePreset,
        primaryColor,
        presetColors.secondary_color,
        presetColors.accent_color,
        drugLicenseNo ? 1 : 0,
        actor.actorId,
        nowIso,
        nowIso
      )
      .run();

    // 4. Insert storefront settings
    const publishingMode = body?.publishing_mode || "manual_only";
    const hideOutOfStock = body?.hide_out_of_stock ? 1 : 0;
    const requireRx = body?.require_rx_for_prescription_items !== false ? 1 : 0;
    const deliveryEnabled = body?.delivery_enabled !== false ? 1 : 0;
    const pickupEnabled = body?.pickup_enabled !== false ? 1 : 0;

    await env.DB.prepare(
      `INSERT INTO storefront_settings (
         storefront_id, pharmacy_id, publishing_mode, hide_out_of_stock,
         show_exact_stock_qty, allow_controlled_medicines, require_rx_for_prescription_items,
         auto_unpublish_zero_stock, max_published_products,
         delivery_enabled, pickup_enabled, min_order_amount_pkr, standard_delivery_fee_pkr,
         free_delivery_threshold_pkr, estimated_delivery_minutes, estimated_pickup_minutes,
         seo_title, seo_description, updated_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?, 45, 15, ?, ?, ?, ?, ?)`
    )
      .bind(
        storefrontId,
        pharmacyId,
        publishingMode,
        hideOutOfStock,
        requireRx,
        Number(body?.max_published_products || 2500),
        deliveryEnabled,
        pickupEnabled,
        Number(body?.min_order_amount_pkr ?? 300),
        Number(body?.standard_delivery_fee_pkr ?? 150),
        Number(body?.free_delivery_threshold_pkr ?? 2000),
        `${pharmacyName} — Online Pharmacy (${city})`,
        `Order genuine medicines and healthcare essentials from ${pharmacyName} in ${city}.`,
        actor.actorId,
        nowIso,
        nowIso
      )
      .run();

    // 5. Insert main pharmacy branch
    await env.DB.prepare(
      `INSERT INTO storefront_branches (
         id, storefront_id, pharmacy_id, pos_branch_id, branch_code, name,
         is_main, status, phone, whatsapp_phone, address_line, city,
         pickup_enabled, delivery_enabled, opening_hours_json, created_at, updated_at
       ) VALUES (?, ?, ?, 'main', 'BR-01', ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        branchId,
        storefrontId,
        pharmacyId,
        `${pharmacyName} (Main Branch)`,
        contactPhone,
        whatsappPhone,
        addressLine,
        city,
        pickupEnabled,
        deliveryEnabled,
        JSON.stringify({
          mon_sat: "09:00 AM - 11:00 PM",
          sun: "10:00 AM - 10:00 PM",
          is_24_hours: false,
        }),
        nowIso,
        nowIso
      )
      .run();

    // 6. Insert default delivery zone
    await env.DB.prepare(
      `INSERT INTO storefront_delivery_zones (
         id, storefront_id, pharmacy_id, branch_id, zone_name, city,
         areas_json, delivery_fee_pkr, min_order_pkr, free_delivery_above_pkr,
         estimated_minutes, is_active, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, 'main', ?, ?, '["All Local Areas"]', ?, ?, ?, 45, 1, 1, ?, ?)`
    )
      .bind(
        `sfdz_${crypto.randomUUID()}`,
        storefrontId,
        pharmacyId,
        `${city} Standard Delivery Zone`,
        city,
        Number(body?.standard_delivery_fee_pkr ?? 150),
        Number(body?.min_order_amount_pkr ?? 300),
        Number(body?.free_delivery_threshold_pkr ?? 2000),
        nowIso,
        nowIso
      )
      .run();

    // 7. Insert default role permissions (Owner, Manager, Viewer)
    const ownerAllowPublish = body?.owner_can_publish !== false ? 1 : 0;
    const defaultRoles = [
      {
        role: "owner",
        cat: 1,
        pub: ownerAllowPublish,
        brand: 1,
        set: 1,
        ban: 1,
        ord: 1,
        dom: 0,
      },
      {
        role: "manager",
        cat: 1,
        pub: ownerAllowPublish,
        brand: 0,
        set: 0,
        ban: 1,
        ord: 1,
        dom: 0,
      },
      {
        role: "viewer",
        cat: 0,
        pub: 0,
        brand: 0,
        set: 0,
        ban: 0,
        ord: 0,
        dom: 0,
      },
    ];
    for (const r of defaultRoles) {
      await env.DB.prepare(
        `INSERT INTO storefront_permissions (
           id, storefront_id, pharmacy_id, subject_type, subject_id,
           can_manage_catalog, can_publish_products, can_manage_branding,
           can_manage_settings, can_manage_banners, can_manage_orders, can_manage_domains,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'portal_role', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          `sfperm_${crypto.randomUUID()}`,
          storefrontId,
          pharmacyId,
          r.role,
          r.cat,
          r.pub,
          r.brand,
          r.set,
          r.ban,
          r.ord,
          r.dom,
          nowIso,
          nowIso
        )
        .run();
    }

    // 8. Seed default pharmacy categories & welcome banner
    const defaultCats = [
      { name: "Prescription Medicines", slug: "prescription-medicines", order: 1 },
      { name: "OTC & Pain Relief", slug: "otc-pain-relief", order: 2 },
      { name: "Vitamins & Supplements", slug: "vitamins-supplements", order: 3 },
      { name: "Mother & Baby Care", slug: "mother-baby-care", order: 4 },
      { name: "Medical Devices & First Aid", slug: "medical-devices-first-aid", order: 5 },
    ];
    for (const c of defaultCats) {
      await env.DB.prepare(
        `INSERT INTO storefront_categories (
           id, storefront_id, pharmacy_id, slug, name, description,
           sort_order, is_visible, published_product_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
      )
        .bind(
          `sfc_${crypto.randomUUID()}`,
          storefrontId,
          pharmacyId,
          c.slug,
          c.name,
          `Genuine ${c.name} dispensed by ${pharmacyName}`,
          c.order,
          nowIso,
          nowIso
        )
        .run();
    }

    await env.DB.prepare(
      `INSERT INTO storefront_banners (
         id, storefront_id, pharmacy_id, title, subtitle, badge_text,
         cta_label, cta_url, bg_gradient, placement, sort_order, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'Browse Catalog', '#catalog', ?, 'hero', 1, 1, ?, ?)`
    )
      .bind(
        `sfban_${crypto.randomUUID()}`,
        storefrontId,
        pharmacyId,
        `${pharmacyName} — Online Pharmacy`,
        `Order medicines and healthcare essentials in ${city} with local home delivery or counter pickup.`,
        "Online Medicine Ordering",
        presetColors.bg_gradient,
        nowIso,
        nowIso
      )
      .run();

    await recordStorefrontUsage(env.DB, {
      storefrontId,
      pharmacyId,
      manageRequests: 1,
      d1RowsReadEst: 3,
      d1RowsWrittenEst: 15,
    });

    await writeStorefrontAuditLog(env.DB, {
      storefrontId,
      pharmacyId,
      action: "storefront_created",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "storefront",
      entityId: storefrontId,
      summary: `Created storefront '${pharmacyName}' at ${primaryDomain} (status: ${status}, entitlement: ${entitlementStatus}).`,
      metadata: {
        slug,
        primary_domain: primaryDomain,
        status,
        website_enabled: Boolean(websiteEnabled),
        entitlement_status: entitlementStatus,
        pilot_access: Boolean(pilotAccess),
        theme_preset: themePreset,
      },
    });

    const created = await env.DB.prepare("SELECT * FROM storefronts WHERE id = ? LIMIT 1")
      .bind(storefrontId)
      .first<StorefrontRecord>();

    return new Response(
      JSON.stringify({
        ok: true,
        storefront: {
          ...created,
          website_enabled: Number(created?.website_enabled) === 1,
          pilot_access: Number(created?.pilot_access) === 1,
          website_url: primaryDomain.endsWith(".workers.dev")
            ? `${url.origin}/s/${slug}`
            : `https://${primaryDomain}`,
        },
      }),
      { status: 201, headers }
    );
  }

  // ── 5. GET /api/v1/manage/storefronts/by-pharmacy/:pharmacyId ──
  if (pathname.startsWith("/api/v1/manage/storefronts/by-pharmacy/") && req.method === "GET") {
    const pharmacyId = decodeURIComponent(
      pathname.slice("/api/v1/manage/storefronts/by-pharmacy/".length)
    );
    const loaded = await loadAndAuthorizeStorefront(env.DB, pharmacyId, actor, true);
    if ("error" in loaded) {
      if (loaded.status === 404) {
        return new Response(
          JSON.stringify({
            ok: true,
            exists: false,
            storefront: null,
          }),
          { status: 200, headers }
        );
      }
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: loaded.error }),
        { status: loaded.status, headers }
      );
    }

    const sf = loaded.storefront;
    const [
      branding,
      settings,
      domainsRes,
      cursorsRes,
      categoriesRes,
      bannersRes,
      promotionsRes,
      zonesRes,
      branchesRes,
      ordersSummaryRow,
      mediaRes,
    ] = await Promise.all([
      env.DB.prepare("SELECT * FROM storefront_branding WHERE storefront_id = ? LIMIT 1")
        .bind(sf.id)
        .first<StorefrontBrandingRecord>(),
      env.DB.prepare("SELECT * FROM storefront_settings WHERE storefront_id = ? LIMIT 1")
        .bind(sf.id)
        .first<StorefrontSettingsRecord>(),
      env.DB.prepare("SELECT * FROM storefront_domains WHERE storefront_id = ? ORDER BY is_primary DESC, created_at ASC")
        .bind(sf.id)
        .all<StorefrontDomainRecord>(),
      env.DB.prepare("SELECT * FROM storefront_sync_cursors WHERE storefront_id = ?")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_categories WHERE storefront_id = ? ORDER BY sort_order ASC, name ASC")
        .bind(sf.id)
        .all<StorefrontCategoryRecord>(),
      env.DB.prepare("SELECT * FROM storefront_banners WHERE storefront_id = ? ORDER BY sort_order ASC, created_at DESC")
        .bind(sf.id)
        .all<StorefrontBannerRecord>(),
      env.DB.prepare("SELECT * FROM storefront_promotions WHERE storefront_id = ? ORDER BY created_at DESC")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_delivery_zones WHERE storefront_id = ? ORDER BY sort_order ASC, zone_name ASC")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_branches WHERE storefront_id = ? ORDER BY is_main DESC, name ASC")
        .bind(sf.id)
        .all<StorefrontBranchRecord>(),
      env.DB.prepare(
        `SELECT
           COUNT(*) AS total_orders,
           SUM(CASE WHEN status = 'pending_confirmation' THEN 1 ELSE 0 END) AS pending_orders,
           SUM(CASE WHEN status IN ('confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery') THEN 1 ELSE 0 END) AS active_orders,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
           COALESCE(SUM(CASE WHEN status != 'cancelled' AND status != 'rejected' THEN total_pkr ELSE 0 END), 0) AS total_order_value_pkr
         FROM storefront_orders
         WHERE storefront_id = ? AND pharmacy_id = ?`
      )
        .bind(sf.id, sf.pharmacy_id)
        .first<Record<string, number>>(),
      env.DB.prepare("SELECT * FROM storefront_media WHERE storefront_id = ? ORDER BY created_at DESC LIMIT 40")
        .bind(sf.id)
        .all(),
    ]);

    const domains = domainsRes.results || [];
    const setupProgress = computeSetupProgress(sf, branding, settings, domains);

    return new Response(
      JSON.stringify({
        ok: true,
        exists: true,
        storefront: {
          ...sf,
          website_enabled: Number(sf.website_enabled) === 1,
          pilot_access: Number(sf.pilot_access) === 1,
          website_url: `https://${sf.primary_domain}`,
        },
        branding,
        settings,
        domains,
        categories: categoriesRes.results || [],
        banners: bannersRes.results || [],
        promotions: promotionsRes.results || [],
        delivery_zones: zonesRes.results || [],
        branches: branchesRes.results || [],
        media: mediaRes.results || [],
        orders_summary: {
          total_orders: Number(ordersSummaryRow?.total_orders || 0),
          pending_orders: Number(ordersSummaryRow?.pending_orders || 0),
          active_orders: Number(ordersSummaryRow?.active_orders || 0),
          completed_orders: Number(ordersSummaryRow?.completed_orders || 0),
          total_order_value_pkr: Number(ordersSummaryRow?.total_order_value_pkr || 0),
        },
        sync_cursors: cursorsRes.results || [],
        setup_progress: setupProgress,
      }),
      { status: 200, headers }
    );
  }

  // ── Central Smart Medicine Image Library Endpoints (Sections 4, 8, 9, 10, 14, 15) ──

  // POST /api/v1/manage/r2-catalog/warm-all (Super Admin: Build R2 Central Image Index + Hydrate All Active Storefronts to R2)
  if (pathname === "/api/v1/manage/r2-catalog/warm-all" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: "Super Admin privileges required." }),
        { status: 403, headers }
      );
    }
    const centralCompiled = await rebuildAndSaveCentralImageIndex(env);
    const { results: sfRows } = await env.DB.prepare(
      `SELECT id, pharmacy_id, slug, pharmacy_name FROM storefronts ORDER BY created_at ASC`
    ).all<{ id: string; pharmacy_id: string; slug: string; pharmacy_name: string }>();

    const migrated: Array<{
      storefront_id: string;
      slug: string;
      pharmacy_name: string;
      source: string;
      total_products: number;
      published_count: number;
      shared_matched_count: number;
    }> = [];

    for (const row of sfRows || []) {
      const { doc, source } = await loadStorefrontCatalogDoc(env, row.id, row.pharmacy_id, {
        freshFromR2: true,
        hydrateCentralImages: true,
      });
      await saveStorefrontCatalogDoc(env, doc);
      await syncStorefrontMetadataFromCatalogDoc(env.DB, doc, {
        bumpConfigVersion: true,
        syncCategories: doc.categories.length > 0,
      });
      invalidateTenantBundleCache(row.id);
      migrated.push({
        storefront_id: row.id,
        slug: row.slug,
        pharmacy_name: row.pharmacy_name,
        source,
        total_products: doc.products.length,
        published_count: doc.published_count,
        shared_matched_count: doc.shared_matched_count,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        central_index_version: centralCompiled.doc.version,
        central_verified_images: centralCompiled.doc.total_verified,
        storefronts_warmed: migrated.length,
        storefronts: migrated,
      }),
      { status: 200, headers }
    );
  }

  // GET /api/v1/manage/central-library/overview
  if (pathname === "/api/v1/manage/central-library/overview" && req.method === "GET") {
    const overview = await getCentralLibraryOverview(env);
    return new Response(JSON.stringify({ ok: true, overview }), { status: 200, headers });
  }

  // GET /api/v1/manage/central-library/medicines
  if (pathname === "/api/v1/manage/central-library/medicines" && req.method === "GET") {
    const q = url.searchParams.get("q") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const dosage_form = url.searchParams.get("dosage_form") || undefined;
    const brand = url.searchParams.get("brand") || undefined;
    const has_image = url.searchParams.get("has_image") || undefined;
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "40", 10);

    const listRes = await listCanonicalMedicines(env.DB, {
      q,
      status,
      dosage_form,
      brand,
      has_image,
      page,
      limit,
    });
    return new Response(JSON.stringify({ ok: true, ...listRes }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/medicines (Super Admin)
  if (pathname === "/api/v1/manage/central-library/medicines" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: "Super Admin privileges required." }),
        { status: 403, headers }
      );
    }
    const body: any = await req.json();
    if (!body.canonical_name || !String(body.canonical_name).trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "validation_failed", message: "canonical_name is required." }),
        { status: 400, headers }
      );
    }
    const upsertRes = await upsertCanonicalMedicine(env, {
      id: body.id,
      canonical_name: body.canonical_name,
      brand_name: body.brand_name,
      generic_name: body.generic_name,
      strength: body.strength,
      dosage_form: body.dosage_form,
      manufacturer: body.manufacturer,
      pack_size: body.pack_size ? Number(body.pack_size) : undefined,
      pack_unit: body.pack_unit,
      barcode: body.barcode,
      aliases: Array.isArray(body.aliases) ? body.aliases : undefined,
      verification_status: body.verification_status,
      preferred_media_id: body.preferred_media_id,
      review_notes: body.review_notes,
    });
    return new Response(JSON.stringify({ ok: true, ...upsertRes }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/upload (Super Admin Shared Image Upload)
  if (pathname === "/api/v1/manage/central-library/upload" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: "Super Admin privileges required." }),
        { status: 403, headers }
      );
    }
    const body: any = await req.json();
    const contentType = String(body.content_type || body.mime_type || "image/webp").toLowerCase();
    const allowedMime = ["image/webp", "image/avif", "image/png", "image/jpeg"];
    if (!allowedMime.includes(contentType)) {
      return new Response(
        JSON.stringify({ ok: false, error: "unsupported_media_type", message: "Only WebP, PNG, JPEG allowed." }),
        { status: 400, headers }
      );
    }

    const contentStr = String(body.data_base64 || body.base64_data || body.content || "");
    const cleanedBase64 = contentStr.replace(/^data:[^;]+;base64,/, "");
    const estimatedBytes = Math.ceil((cleanedBase64.length * 3) / 4);
    const byteSize = Number(body.byte_size ?? estimatedBytes);

    if (byteSize > 650 * 1024) {
      return new Response(
        JSON.stringify({ ok: false, error: "media_too_large", message: "Exceeds 650 KB limit." }),
        { status: 413, headers }
      );
    }

    const contentHash = body.sha256_hex
      ? String(body.sha256_hex).toLowerCase()
      : await sha256Hex(cleanedBase64 || `shared:${Date.now()}`);

    // Check duplicate in shared media
    const existingMedia = await env.DB.prepare(
      `SELECT * FROM storefront_media WHERE sha256_hex = ? AND is_shared = 1 LIMIT 1`
    ).bind(contentHash).first<Record<string, any>>();

    let mediaId: string;
    let publicUrl: string;
    let r2Key: string;
    let deduplicated = false;

    if (existingMedia) {
      mediaId = String(existingMedia.id);
      publicUrl = String(existingMedia.public_url);
      r2Key = String(existingMedia.r2_object_key);
      deduplicated = true;
    } else {
      mediaId = `sfm_shared_${crypto.randomUUID().slice(0, 12)}`;
      const ext = String(contentType.split("/")[1] || "webp").replace(/[^a-z0-9]/gi, "").toLowerCase() || "webp";
      r2Key = `shared/medicines/${contentHash}.${ext}`;

      if (env.MEDIA_BUCKET && cleanedBase64) {
        let binaryPayload: Uint8Array | string = contentStr;
        try {
          const bin = atob(cleanedBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          binaryPayload = bytes;
        } catch {
          binaryPayload = contentStr;
        }
        await env.MEDIA_BUCKET.put(r2Key, binaryPayload, {
          httpMetadata: { contentType },
          customMetadata: {
            is_shared: "true",
            sha256_hex: contentHash,
            uploaded_by: actor.actorId,
          },
        });
      }

      publicUrl = resolveSharedMediaPublicUrl(env, mediaId, r2Key);
      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO storefront_media (
           id, storefront_id, pharmacy_id, r2_object_key, public_url,
           content_type, byte_size, width, height, sha256_hex, purpose,
           is_shared, verification_status, source_type, uploaded_by, created_at
         ) VALUES (?, 'sf_central_library', 'pharmacy_central_platform', ?, ?, ?, ?, ?, ?, ?, 'product_image', 1, 'verified', 'super_admin', ?, ?)`
      )
        .bind(
          mediaId,
          r2Key,
          publicUrl,
          contentType,
          byteSize,
          body.width ? Number(body.width) : null,
          body.height ? Number(body.height) : null,
          contentHash,
          actor.actorId,
          nowIso
        )
        .run();
    }

    // Attach to canonical medicine if provided or requested
    let canonicalId = body.canonical_medicine_id ? String(body.canonical_medicine_id).trim() : null;
    if (canonicalId) {
      await env.DB.prepare(
        `UPDATE central_medicines
         SET preferred_media_id = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?`
      ).bind(mediaId, canonicalId).run();

      // Immediately publish to R2 Central Image Index (0 pharmacy D1 scans!)
      await matchAndPropagateCanonicalMedicine(env, canonicalId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        media_id: mediaId,
        public_url: publicUrl,
        r2_key: r2Key,
        deduplicated,
        canonical_id: canonicalId,
      }),
      { status: 200, headers }
    );
  }

  // POST /api/v1/manage/central-library/bulk-upload (Super Admin Bulk ZIP Auto-Verified Upload)
  if (pathname === "/api/v1/manage/central-library/bulk-upload" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: "Super Admin privileges required." }),
        { status: 403, headers }
      );
    }
    const body: any = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "empty_batch", message: "Provide a non-empty items array." }),
        { status: 400, headers }
      );
    }
    if (items.length > 30) {
      return new Response(
        JSON.stringify({ ok: false, error: "batch_too_large", message: "Maximum 30 images per chunk." }),
        { status: 400, headers }
      );
    }

    const bulkRes = await bulkUploadVerifiedCentralImages(env, actor.actorId, items);
    return new Response(JSON.stringify({ ok: true, ...bulkRes }), { status: 200, headers });
  }

  // GET /api/v1/manage/central-library/submissions (Owner submissions review queue)
  if (pathname === "/api/v1/manage/central-library/submissions" && req.method === "GET") {
    const status = url.searchParams.get("status") || "pending";
    const { results } = await env.DB.prepare(
      `SELECT
         s.*,
         m.public_url AS media_url,
         m.byte_size,
         m.width,
         m.height,
         sf.pharmacy_name
       FROM central_image_submissions s
       LEFT JOIN storefront_media m ON s.media_id = m.id
       LEFT JOIN storefronts sf ON s.storefront_id = sf.id
       WHERE s.status = ?
       ORDER BY s.created_at DESC
       LIMIT 60`
    ).bind(status).all<Record<string, unknown>>();

    return new Response(JSON.stringify({ ok: true, submissions: results || [] }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/submissions/:id/approve
  const approveSubMatch = pathname.match(/^\/api\/v1\/manage\/central-library\/submissions\/([^/]+)\/approve$/);
  if (approveSubMatch && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const subId = decodeURIComponent(approveSubMatch[1]);
    const body: any = await req.json().catch(() => ({}));
    const sub = await env.DB.prepare(
      `SELECT * FROM central_image_submissions WHERE id = ? LIMIT 1`
    ).bind(subId).first<Record<string, any>>();

    if (!sub) {
      return new Response(JSON.stringify({ ok: false, error: "submission_not_found" }), { status: 404, headers });
    }

    const nowIso = new Date().toISOString();
    const targetCanonicalId = body.target_canonical_id || sub.target_canonical_id;

    // Promote media to is_shared = 1
    await env.DB.prepare(
      `UPDATE storefront_media
       SET is_shared = 1, verification_status = 'verified', source_type = 'owner_contributed', contributed_by_pharmacy_id = ?
       WHERE id = ?`
    ).bind(sub.pharmacy_id, sub.media_id).run();

    // Mark submission approved
    await env.DB.prepare(
      `UPDATE central_image_submissions
       SET status = 'approved', target_canonical_id = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ?`
    ).bind(targetCanonicalId || null, actor.actorId, nowIso, subId).run();

    // If linked to canonical identity, update preferred_media_id and propagate to all matching products
    if (targetCanonicalId) {
      await env.DB.prepare(
        `UPDATE central_medicines
         SET preferred_media_id = ?, updated_at = ?
         WHERE id = ?`
      ).bind(sub.media_id, nowIso, targetCanonicalId).run();

      await matchAndPropagateCanonicalMedicine(env, targetCanonicalId);
    }

    return new Response(JSON.stringify({ ok: true, status: "approved" }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/submissions/:id/reject
  const rejectSubMatch = pathname.match(/^\/api\/v1\/manage\/central-library\/submissions\/([^/]+)\/reject$/);
  if (rejectSubMatch && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const subId = decodeURIComponent(rejectSubMatch[1]);
    const body: any = await req.json().catch(() => ({}));
    const reason = String(body.reason || "Image did not meet quality or verification criteria.");

    await env.DB.prepare(
      `UPDATE central_image_submissions
       SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = ?`
    ).bind(reason, actor.actorId, subId).run();

    return new Response(JSON.stringify({ ok: true, status: "rejected" }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/batch-match (Batch Match Existing Products)
  if (pathname === "/api/v1/manage/central-library/batch-match" && req.method === "POST") {
    const body: any = await req.json().catch(() => ({}));
    const batchSize = Math.min(200, Math.max(10, Number(body.batch_size || 100)));
    const offset = Math.max(0, Number(body.offset || 0));
    let sfFilter: string | undefined = undefined;
    if (actor.actorType === "super_admin") {
      sfFilter = body.storefront_id || undefined;
    } else if (actor.scopedPharmacyId) {
      const sfRow = await env.DB.prepare("SELECT id FROM storefronts WHERE pharmacy_id = ? LIMIT 1")
        .bind(actor.scopedPharmacyId)
        .first<{ id: string }>();
      sfFilter = sfRow?.id;
    }

    const matchRes = await batchMatchStorefrontProducts(env, batchSize, offset, sfFilter);
    return new Response(JSON.stringify({ ok: true, ...matchRes }), { status: 200, headers });
  }

  // ── Automatic Image Discovery Queue & Collector Endpoints ──

  // GET /api/v1/manage/central-library/discovery/overview
  if (pathname === "/api/v1/manage/central-library/discovery/overview" && req.method === "GET") {
    const overview = await getDiscoveryQueueOverview(env.DB);
    return new Response(JSON.stringify({ ok: true, overview }), { status: 200, headers });
  }

  // GET /api/v1/manage/central-library/discovery/queue
  if (pathname === "/api/v1/manage/central-library/discovery/queue" && req.method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const search = url.searchParams.get("q") || url.searchParams.get("search") || undefined;
    const priority = url.searchParams.get("priority") ? Number(url.searchParams.get("priority")) : undefined;
    const page = url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20;

    const queueRes = await listDiscoveryQueueItems(env.DB, { status, search, priority, page, limit });
    return new Response(JSON.stringify({ ok: true, ...queueRes }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/import (Super Admin: Batch Master Catalog Import)
  if (pathname === "/api/v1/manage/central-library/discovery/import" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const body: any = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const importRes = await importMasterCatalogToDiscoveryQueue(env.DB, items);
    return new Response(JSON.stringify({ ok: true, ...importRes }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/settings
  if (pathname === "/api/v1/manage/central-library/discovery/settings" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const body: any = await req.json().catch(() => ({}));
    const updated = await updateCollectorSettings(env.DB, body);
    return new Response(JSON.stringify({ ok: true, settings: updated }), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/retry-failed
  if (pathname === "/api/v1/manage/central-library/discovery/retry-failed" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const res = await retryFailedDiscoveryJobs(env.DB);
    return new Response(JSON.stringify({ ok: true, ...res }), { status: 200, headers });
  }

  // GET /api/v1/manage/central-library/discovery/batch (Collector Worker Fetch)
  if (pathname === "/api/v1/manage/central-library/discovery/batch" && req.method === "GET") {
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 10)));
    const batchRes = await getDiscoveryBatchForCollector(env.DB, limit);
    return new Response(JSON.stringify(batchRes), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/submit (Collector Submit Results)
  if (pathname === "/api/v1/manage/central-library/discovery/submit" && req.method === "POST") {
    const body: any = await req.json().catch(() => ({}));
    const queueId = String(body.queue_id || "").trim();
    if (!queueId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_queue_id" }), { status: 400, headers });
    }
    const subRes = await submitDiscoveryResult(env, queueId, {
      status: body.status,
      source: body.source || "collector",
      candidates: body.candidates || [],
      error: body.error,
    });
    return new Response(JSON.stringify(subRes), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/approve-candidate
  if (pathname === "/api/v1/manage/central-library/discovery/approve-candidate" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const body: any = await req.json().catch(() => ({}));
    const queueId = String(body.queue_id || "").trim();
    if (!queueId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_queue_id" }), { status: 400, headers });
    }
    const approveRes = await approveDiscoveryCandidate(env, queueId, body.candidate || body);
    return new Response(JSON.stringify(approveRes), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/reject-candidate
  if (pathname === "/api/v1/manage/central-library/discovery/reject-candidate" && req.method === "POST") {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers });
    }
    const body: any = await req.json().catch(() => ({}));
    const queueId = String(body.queue_id || "").trim();
    const rejRes = await rejectDiscoveryCandidate(env.DB, queueId, body.reason);
    return new Response(JSON.stringify(rejRes), { status: 200, headers });
  }

  // POST /api/v1/manage/central-library/discovery/upload-optimized (Collector Direct WebP Upload)
  if (pathname === "/api/v1/manage/central-library/discovery/upload-optimized" && req.method === "POST") {
    const body: any = await req.json().catch(() => ({}));
    const cleanedBase64 = String(body.data_base64 || "").replace(/^data:[^;]+;base64,/, "");
    const contentHash = String(body.sha256_hex || "").toLowerCase();
    const exactMasterName = String(body.master_catalog_name || "Medicine").trim();
    const logicalFileName = String(body.logical_file_name || `${exactMasterName}.webp`).trim();

    if (!cleanedBase64 || !contentHash) {
      return new Response(JSON.stringify({ ok: false, error: "missing_image_payload" }), { status: 400, headers });
    }

    // Check R2 / DB deduplication
    const existing = await env.DB.prepare(
      `SELECT * FROM storefront_media WHERE sha256_hex = ? AND is_shared = 1 LIMIT 1`
    ).bind(contentHash).first<Record<string, any>>();

    let mediaId: string;
    let publicUrl: string;
    let r2Key: string;
    let deduplicated = false;

    if (existing) {
      mediaId = String(existing.id);
      publicUrl = String(existing.public_url);
      r2Key = String(existing.r2_object_key);
      deduplicated = true;
    } else {
      mediaId = `sfm_shared_${crypto.randomUUID().slice(0, 12)}`;
      r2Key = `shared/medicines/${contentHash}.webp`;

      if (env.MEDIA_BUCKET) {
        let binaryPayload: Uint8Array | string = cleanedBase64;
        try {
          const bin = atob(cleanedBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          binaryPayload = bytes;
        } catch {
          binaryPayload = cleanedBase64;
        }
        await env.MEDIA_BUCKET.put(r2Key, binaryPayload, {
          httpMetadata: { contentType: "image/webp" },
          customMetadata: {
            is_shared: "true",
            sha256_hex: contentHash,
            logical_name: logicalFileName,
            uploaded_by: "image_collector",
          },
        });
      }

      publicUrl = resolveSharedMediaPublicUrl(env, mediaId, r2Key);
      const nowIso = new Date().toISOString();
      const byteSize = Number(body.byte_size || Math.ceil((cleanedBase64.length * 3) / 4));

      await env.DB.prepare(
        `INSERT INTO storefront_media (
           id, storefront_id, pharmacy_id, r2_object_key, public_url,
           content_type, byte_size, width, height, sha256_hex, purpose,
           is_shared, verification_status, source_type, logical_file_name,
           rights_status, attribution_text, uploaded_by, created_at
         ) VALUES (?, 'sf_central_library', 'pharmacy_central_platform', ?, ?, 'image/webp', ?, ?, ?, ?, 'product_image', 1, 'verified', ?, ?, ?, ?, 'image_collector', ?)`
      )
        .bind(
          mediaId,
          r2Key,
          publicUrl,
          byteSize,
          body.width ? Number(body.width) : null,
          body.height ? Number(body.height) : null,
          contentHash,
          body.source_type || "collector_wikimedia",
          logicalFileName,
          body.rights_status || "open_license",
          body.attribution || null,
          nowIso
        )
        .run();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        media_id: mediaId,
        public_url: publicUrl,
        r2_key: r2Key,
        deduplicated,
        logical_file_name: logicalFileName,
      }),
      { status: 200, headers }
    );
  }

  // ── Extract `:id` for `/api/v1/manage/storefronts/:id...` routes ──
  const idMatch = pathname.match(/^\/api\/v1\/manage\/storefronts\/([^/]+)(\/.*)?$/);
  if (!idMatch) {
    return new Response(
      JSON.stringify({ ok: false, error: "not_found", message: "Unknown management endpoint" }),
      { status: 404, headers }
    );
  }

  const storefrontId = decodeURIComponent(idMatch[1]);
  const subPath = idMatch[2] || "";

  const loaded = await loadAndAuthorizeStorefront(env.DB, storefrontId, actor, false);
  if ("error" in loaded) {
    return new Response(
      JSON.stringify({ ok: false, error: loaded.status === 403 ? "forbidden" : "not_found", message: loaded.error }),
      { status: loaded.status, headers }
    );
  }
  const sf = loaded.storefront;

  // ── 6. GET /api/v1/manage/storefronts/:id (Full Website Details) ──
  if (subPath === "" && req.method === "GET") {
    const [
      branding,
      settings,
      domainsRes,
      branchesRes,
      permissionsRes,
      categoriesRes,
      bannersRes,
      cursorsRes,
      syncEventsRes,
      syncFailuresRes,
      usageRes,
      auditRes,
    ] = await Promise.all([
      env.DB.prepare("SELECT * FROM storefront_branding WHERE storefront_id = ? LIMIT 1")
        .bind(sf.id)
        .first<StorefrontBrandingRecord>(),
      env.DB.prepare("SELECT * FROM storefront_settings WHERE storefront_id = ? LIMIT 1")
        .bind(sf.id)
        .first<StorefrontSettingsRecord>(),
      env.DB.prepare("SELECT * FROM storefront_domains WHERE storefront_id = ? ORDER BY is_primary DESC, created_at ASC")
        .bind(sf.id)
        .all<StorefrontDomainRecord>(),
      env.DB.prepare("SELECT * FROM storefront_branches WHERE storefront_id = ? ORDER BY is_main DESC, name ASC")
        .bind(sf.id)
        .all<StorefrontBranchRecord>(),
      env.DB.prepare("SELECT * FROM storefront_permissions WHERE storefront_id = ?")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_categories WHERE storefront_id = ? ORDER BY sort_order ASC, name ASC")
        .bind(sf.id)
        .all<StorefrontCategoryRecord>(),
      env.DB.prepare("SELECT * FROM storefront_banners WHERE storefront_id = ? ORDER BY sort_order ASC, created_at DESC")
        .bind(sf.id)
        .all<StorefrontBannerRecord>(),
      env.DB.prepare("SELECT * FROM storefront_sync_cursors WHERE storefront_id = ?")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_sync_events WHERE storefront_id = ? ORDER BY created_at DESC LIMIT 15")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_sync_failures WHERE storefront_id = ? ORDER BY created_at DESC LIMIT 15")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_usage_daily WHERE storefront_id = ? ORDER BY usage_date DESC LIMIT 30")
        .bind(sf.id)
        .all(),
      env.DB.prepare("SELECT * FROM storefront_audit_logs WHERE storefront_id = ? ORDER BY created_at DESC LIMIT 25")
        .bind(sf.id)
        .all(),
    ]);

    const domains = domainsRes.results || [];
    const setupProgress = computeSetupProgress(sf, branding, settings, domains);

    return new Response(
      JSON.stringify({
        ok: true,
        storefront: {
          ...sf,
          website_enabled: Number(sf.website_enabled) === 1,
          pilot_access: Number(sf.pilot_access) === 1,
          website_url: `https://${sf.primary_domain}`,
        },
        branding,
        settings,
        domains,
        branches: branchesRes.results || [],
        permissions: permissionsRes.results || [],
        categories: categoriesRes.results || [],
        banners: bannersRes.results || [],
        sync_health: {
          last_sync_at: sf.last_sync_at,
          cursors: cursorsRes.results || [],
          recent_events: syncEventsRes.results || [],
          recent_failures: syncFailuresRes.results || [],
        },
        usage_daily: usageRes.results || [],
        audit_logs: auditRes.results || [],
        setup_progress: setupProgress,
      }),
      { status: 200, headers }
    );
  }

  // ── 7. PATCH /api/v1/manage/storefronts/:id/status (Enable / Disable / Suspend / Pilot) ──
  if (subPath === "/status" && req.method === "PATCH") {
    if (actor.actorType !== "super_admin") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "forbidden",
          message: "Only Super Admin can change storefront entitlement or operational status.",
        }),
        { status: 403, headers }
      );
    }

    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    const nextStatus = body.status ?? sf.status;
    const nextEnabled =
      body.website_enabled !== undefined
        ? body.website_enabled
          ? 1
          : 0
        : nextStatus === "active"
        ? 1
        : nextStatus === "disabled" || nextStatus === "suspended"
        ? 0
        : sf.website_enabled;
    const nextEntitlement = body.entitlement_status ?? sf.entitlement_status;
    const nextPilot =
      body.pilot_access !== undefined ? (body.pilot_access ? 1 : 0) : sf.pilot_access;
    const nextPlanTier = body.plan_tier ?? sf.plan_tier;
    const suspendedReason =
      body.suspended_reason !== undefined ? body.suspended_reason : sf.suspended_reason;
    const disabledReason =
      body.disabled_reason !== undefined ? body.disabled_reason : sf.disabled_reason;

    await env.DB.prepare(
      `UPDATE storefronts
       SET status = ?,
           website_enabled = ?,
           entitlement_status = ?,
           pilot_access = ?,
           plan_tier = ?,
           suspended_reason = ?,
           disabled_reason = ?,
           config_version = config_version + 1,
           updated_at = ?
       WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(
        nextStatus,
        nextEnabled,
        nextEntitlement,
        nextPilot,
        nextPlanTier,
        suspendedReason,
        disabledReason,
        nowIso,
        sf.id,
        sf.pharmacy_id
      )
      .run();

    await recordStorefrontUsage(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      manageRequests: 1,
      d1RowsReadEst: 1,
      d1RowsWrittenEst: 2,
    });

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "storefront_status_updated",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "storefront",
      entityId: sf.id,
      summary: `Updated status to '${nextStatus}' (enabled=${Boolean(nextEnabled)}, entitlement='${nextEntitlement}').`,
      metadata: {
        previous: {
          status: sf.status,
          website_enabled: Boolean(sf.website_enabled),
          entitlement_status: sf.entitlement_status,
        },
        updated: {
          status: nextStatus,
          website_enabled: Boolean(nextEnabled),
          entitlement_status: nextEntitlement,
          pilot_access: Boolean(nextPilot),
        },
      },
    });

    const updated = await env.DB.prepare("SELECT * FROM storefronts WHERE id = ? LIMIT 1")
      .bind(sf.id)
      .first<StorefrontRecord>();

    return new Response(
      JSON.stringify({
        ok: true,
        storefront: {
          ...updated,
          website_enabled: Number(updated?.website_enabled) === 1,
          pilot_access: Number(updated?.pilot_access) === 1,
        },
      }),
      { status: 200, headers }
    );
  }

  // ── 8. PUT /api/v1/manage/storefronts/:id/branding ──
  if (subPath === "/branding" && req.method === "PUT") {
    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    const currentBranding = await env.DB.prepare(
      "SELECT * FROM storefront_branding WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1"
    )
      .bind(sf.id, sf.pharmacy_id)
      .first<StorefrontBrandingRecord>();

    const themePreset: ThemePresetId =
      body.theme_preset && body.theme_preset in THEME_PRESETS
        ? body.theme_preset
        : currentBranding?.theme_preset || "emerald_clinical";

    const preset = THEME_PRESETS[themePreset];
    const displayName = String(body.display_name || currentBranding?.display_name || sf.pharmacy_name).trim();
    const tagline = body.tagline !== undefined ? String(body.tagline) : currentBranding?.tagline;
    const logoUrl = body.logo_url !== undefined ? body.logo_url : currentBranding?.logo_url;
    const rawHeroUrl =
      body.hero_banner_url !== undefined
        ? body.hero_banner_url
        : body.hero_image_url !== undefined
        ? body.hero_image_url
        : (currentBranding as any)?.hero_banner_url ?? null;
    const heroBannerUrl =
      rawHeroUrl && String(rawHeroUrl).trim() ? String(rawHeroUrl).trim() : null;
    const heroTitle = body.hero_title !== undefined ? String(body.hero_title) : currentBranding?.hero_title;
    const heroSubtitle =
      body.hero_subtitle !== undefined ? String(body.hero_subtitle) : currentBranding?.hero_subtitle;
    const primaryColor = body.primary_color || currentBranding?.primary_color || preset.primary_color;
    const secondaryColor =
      body.secondary_color || currentBranding?.secondary_color || preset.secondary_color;
    const accentColor = body.accent_color || currentBranding?.accent_color || preset.accent_color;
    const showBadge =
      body.show_verified_license_badge !== undefined
        ? body.show_verified_license_badge
          ? 1
          : 0
        : currentBranding?.show_verified_license_badge ?? 1;

    const aboutTitle =
      body.about_title !== undefined ? String(body.about_title) : (currentBranding as any)?.about_title ?? null;
    const aboutContent =
      body.about_content !== undefined ? String(body.about_content) : (currentBranding as any)?.about_content ?? null;
    const footerTagline =
      body.footer_tagline !== undefined ? String(body.footer_tagline) : (currentBranding as any)?.footer_tagline ?? null;
    const servicesJson =
      body.services && Array.isArray(body.services)
        ? JSON.stringify(body.services)
        : body.services_json ?? (currentBranding as any)?.services_json ?? "[]";

    await env.DB.prepare(
      `UPDATE storefront_branding
       SET display_name = ?, tagline = ?, logo_url = ?, hero_banner_url = ?, hero_title = ?, hero_subtitle = ?,
           theme_preset = ?, primary_color = ?, secondary_color = ?, accent_color = ?,
           show_verified_license_badge = ?, about_title = ?, about_content = ?,
           footer_tagline = ?, services_json = ?, updated_by = ?, updated_at = ?
       WHERE storefront_id = ? AND pharmacy_id = ?`
    )
      .bind(
        displayName,
        tagline,
        logoUrl,
        heroBannerUrl,
        heroTitle,
        heroSubtitle,
        themePreset,
        primaryColor,
        secondaryColor,
        accentColor,
        showBadge,
        aboutTitle,
        aboutContent,
        footerTagline,
        servicesJson,
        actor.actorId,
        nowIso,
        sf.id,
        sf.pharmacy_id
      )
      .run();

    // Bump config_version so Edge Cache picks up updated branding / hero photo immediately
    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();

    // Also allow updating pharmacy contact info if provided
    if (
      body.contact_phone !== undefined ||
      body.whatsapp_phone !== undefined ||
      body.contact_email !== undefined ||
      body.address_line !== undefined ||
      body.city !== undefined ||
      body.drug_sale_license_no !== undefined ||
      body.pharmacist_name !== undefined
    ) {
      await env.DB.prepare(
        `UPDATE storefronts
         SET contact_phone = COALESCE(?, contact_phone),
             whatsapp_phone = COALESCE(?, whatsapp_phone),
             contact_email = COALESCE(?, contact_email),
             address_line = COALESCE(?, address_line),
             city = COALESCE(?, city),
             drug_sale_license_no = COALESCE(?, drug_sale_license_no),
             pharmacist_name = COALESCE(?, pharmacist_name),
             config_version = config_version + 1,
             updated_at = ?
         WHERE id = ? AND pharmacy_id = ?`
      )
        .bind(
          body.contact_phone ?? null,
          body.whatsapp_phone ?? null,
          body.contact_email ?? null,
          body.address_line ?? null,
          body.city ?? null,
          body.drug_sale_license_no ?? null,
          body.pharmacist_name ?? null,
          nowIso,
          sf.id,
          sf.pharmacy_id
        )
        .run();
    } else {
      await env.DB.prepare(
        "UPDATE storefronts SET config_version = config_version + 1, updated_at = ? WHERE id = ?"
      )
        .bind(nowIso, sf.id)
        .run();
    }

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "storefront_branding_updated",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "branding",
      entityId: sf.id,
      summary: `Updated branding for '${displayName}' (theme: ${themePreset}, primary: ${primaryColor}).`,
      metadata: { theme_preset: themePreset, primary_color: primaryColor },
    });

    const updatedBranding = await env.DB.prepare(
      "SELECT * FROM storefront_branding WHERE storefront_id = ? LIMIT 1"
    )
      .bind(sf.id)
      .first<StorefrontBrandingRecord>();

    return new Response(JSON.stringify({ ok: true, branding: updatedBranding }), {
      status: 200,
      headers,
    });
  }

  // ── 9. PUT /api/v1/manage/storefronts/:id/settings ──
  if (subPath === "/settings" && req.method === "PUT") {
    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    const current = await env.DB.prepare(
      "SELECT * FROM storefront_settings WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1"
    )
      .bind(sf.id, sf.pharmacy_id)
      .first<StorefrontSettingsRecord>();

    if (!current) {
      return new Response(JSON.stringify({ ok: false, error: "settings_not_found" }), {
        status: 404,
        headers,
      });
    }

    const openingHoursJson =
      body.opening_hours && typeof body.opening_hours === "object"
        ? JSON.stringify(body.opening_hours)
        : body.opening_hours_json ?? current.opening_hours_json;

    const socialLinksJson =
      body.social_links && typeof body.social_links === "object"
        ? JSON.stringify(body.social_links)
        : body.social_links_json ?? current.social_links_json ?? "{}";

    await env.DB.prepare(
      `UPDATE storefront_settings
       SET publishing_mode = ?,
           hide_out_of_stock = ?,
           show_exact_stock_qty = ?,
           require_rx_for_prescription_items = ?,
           auto_unpublish_zero_stock = ?,
           max_published_products = ?,
           delivery_enabled = ?,
           pickup_enabled = ?,
           min_order_amount_pkr = ?,
           standard_delivery_fee_pkr = ?,
           free_delivery_threshold_pkr = ?,
           estimated_delivery_minutes = ?,
           estimated_pickup_minutes = ?,
           delivery_radius_km = ?,
           cod_enabled = ?,
           bank_transfer_enabled = ?,
           prescription_upload_enabled = ?,
           whatsapp_order_assist_enabled = ?,
           announcement_bar_enabled = ?,
           announcement_bar_text = ?,
           opening_hours_json = ?,
           social_links_json = ?,
           seo_title = ?,
           seo_description = ?,
           legal_disclaimer_text = ?,
           pharmacist_supervision_note = ?,
           maintenance_mode = ?,
           maintenance_message = ?,
           updated_by = ?,
           updated_at = ?
       WHERE storefront_id = ? AND pharmacy_id = ?`
    )
      .bind(
        body.publishing_mode ??
          (body.auto_sync_all_products !== undefined
            ? body.auto_sync_all_products
              ? "in_stock_approved"
              : "manual_only"
            : current.publishing_mode),
        body.hide_out_of_stock !== undefined ? (body.hide_out_of_stock ? 1 : 0) : current.hide_out_of_stock,
        body.show_exact_stock_qty !== undefined ? (body.show_exact_stock_qty ? 1 : 0) : current.show_exact_stock_qty,
        body.require_rx_for_prescription_items !== undefined
          ? body.require_rx_for_prescription_items
            ? 1
            : 0
          : current.require_rx_for_prescription_items,
        body.auto_unpublish_zero_stock !== undefined
          ? body.auto_unpublish_zero_stock
            ? 1
            : 0
          : current.auto_unpublish_zero_stock,
        Number(body.max_published_products ?? current.max_published_products),
        body.delivery_enabled !== undefined ? (body.delivery_enabled ? 1 : 0) : current.delivery_enabled,
        body.pickup_enabled !== undefined ? (body.pickup_enabled ? 1 : 0) : current.pickup_enabled,
        Number(body.min_order_amount_pkr ?? current.min_order_amount_pkr),
        Number(body.standard_delivery_fee_pkr ?? current.standard_delivery_fee_pkr),
        Number(body.free_delivery_threshold_pkr ?? current.free_delivery_threshold_pkr),
        Number(body.estimated_delivery_minutes ?? current.estimated_delivery_minutes),
        Number(body.estimated_pickup_minutes ?? current.estimated_pickup_minutes),
        Number(body.delivery_radius_km ?? current.delivery_radius_km),
        body.cod_enabled !== undefined ? (body.cod_enabled ? 1 : 0) : current.cod_enabled,
        body.bank_transfer_enabled !== undefined ? (body.bank_transfer_enabled ? 1 : 0) : current.bank_transfer_enabled,
        body.prescription_upload_enabled !== undefined
          ? body.prescription_upload_enabled
            ? 1
            : 0
          : current.prescription_upload_enabled,
        body.whatsapp_order_assist_enabled !== undefined
          ? body.whatsapp_order_assist_enabled
            ? 1
            : 0
          : current.whatsapp_order_assist_enabled,
        body.announcement_bar_enabled !== undefined
          ? body.announcement_bar_enabled
            ? 1
            : 0
          : current.announcement_bar_enabled,
        body.announcement_bar_text ?? current.announcement_bar_text,
        openingHoursJson,
        socialLinksJson,
        body.seo_title ?? current.seo_title,
        body.seo_description ?? current.seo_description,
        body.legal_disclaimer_text ?? current.legal_disclaimer_text,
        body.pharmacist_supervision_note ?? current.pharmacist_supervision_note,
        body.maintenance_mode !== undefined ? (body.maintenance_mode ? 1 : 0) : Number(current.maintenance_mode || 0),
        body.maintenance_message !== undefined ? body.maintenance_message : current.maintenance_message ?? null,
        actor.actorId,
        nowIso,
        sf.id,
        sf.pharmacy_id
      )
      .run();

    await env.DB.prepare(
      "UPDATE storefronts SET config_version = config_version + 1, updated_at = ? WHERE id = ?"
    )
      .bind(nowIso, sf.id)
      .run();

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "storefront_settings_updated",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "settings",
      entityId: sf.id,
      summary: "Updated storefront operational, delivery, and catalog publishing settings.",
    });

    const updated = await env.DB.prepare(
      "SELECT * FROM storefront_settings WHERE storefront_id = ? LIMIT 1"
    )
      .bind(sf.id)
      .first<StorefrontSettingsRecord>();

    return new Response(JSON.stringify({ ok: true, settings: updated }), {
      status: 200,
      headers,
    });
  }

  // ── 10. Domain & Slug Management (`/domains`) ──
  if (subPath === "/domains" && req.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_domains WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY is_primary DESC, created_at ASC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all<StorefrontDomainRecord>();
    return new Response(JSON.stringify({ ok: true, domains: results }), {
      status: 200,
      headers,
    });
  }

  if (subPath === "/domains" && req.method === "POST") {
    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    // Case A: Rename primary subdomain slug with safe redirect creation (Section 5)
    if (body.action === "rename_slug") {
      if (actor.actorType !== "super_admin") {
        return new Response(
          JSON.stringify({ ok: false, error: "forbidden_super_admin_only" }),
          { status: 403, headers }
        );
      }
      const slugCheck = validateStorefrontSlug(body.new_slug);
      if (!slugCheck.valid) {
        return new Response(
          JSON.stringify({ ok: false, error: "invalid_slug", message: slugCheck.error }),
          { status: 400, headers }
        );
      }

      const newSlug = slugCheck.normalized;
      if (newSlug === sf.slug) {
        return new Response(
          JSON.stringify({ ok: false, error: "same_slug", message: "New slug is identical to current slug." }),
          { status: 400, headers }
        );
      }

      const newPrimaryHostname = `${newSlug}.${baseDomain}`;
      const oldPrimaryHostname = sf.primary_domain;

      const [collisionSf, collisionDom] = await Promise.all([
        env.DB.prepare("SELECT id FROM storefronts WHERE slug = ? AND id != ? LIMIT 1")
          .bind(newSlug, sf.id)
          .first(),
        env.DB.prepare("SELECT id, storefront_id FROM storefront_domains WHERE hostname = ? LIMIT 1")
          .bind(newPrimaryHostname)
          .first<{ id: string; storefront_id: string }>(),
      ]);

      if (collisionSf || (collisionDom && collisionDom.storefront_id !== sf.id)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "domain_collision",
            message: `Slug '${newSlug}' or hostname '${newPrimaryHostname}' is already registered.`,
          }),
          { status: 409, headers }
        );
      }

      // Convert old primary domain into a verified `redirect_alias` pointing to `newPrimaryHostname`
      await env.DB.prepare(
        `UPDATE storefront_domains
         SET is_primary = 0,
             domain_type = 'redirect_alias',
             redirect_to_hostname = ?,
             updated_at = ?
         WHERE storefront_id = ? AND hostname = ?`
      )
        .bind(newPrimaryHostname, nowIso, sf.id, oldPrimaryHostname)
        .run();

      // Also update any earlier redirect_alias rows for this storefront so redirect chains stay 1-hop
      await env.DB.prepare(
        `UPDATE storefront_domains
         SET redirect_to_hostname = ?, updated_at = ?
         WHERE storefront_id = ? AND domain_type = 'redirect_alias'`
      )
        .bind(newPrimaryHostname, nowIso, sf.id)
        .run();

      // Insert or promote the new primary subdomain
      await env.DB.prepare(
        `INSERT INTO storefront_domains (
           id, storefront_id, pharmacy_id, hostname, domain_type, is_primary,
           verification_status, verification_method, redirect_to_hostname, ssl_status, verified_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'subdomain', 1, 'verified', 'system_subdomain', NULL, 'active', ?, ?, ?)
         ON CONFLICT(hostname) DO UPDATE SET
           domain_type = 'subdomain',
           is_primary = 1,
           verification_status = 'verified',
           redirect_to_hostname = NULL,
           updated_at = excluded.updated_at`
      )
        .bind(
          `sfd_${crypto.randomUUID()}`,
          sf.id,
          sf.pharmacy_id,
          newPrimaryHostname,
          nowIso,
          nowIso,
          nowIso
        )
        .run();

      await env.DB.prepare(
        `UPDATE storefronts
         SET slug = ?, primary_domain = ?, config_version = config_version + 1, updated_at = ?
         WHERE id = ? AND pharmacy_id = ?`
      )
        .bind(newSlug, newPrimaryHostname, nowIso, sf.id, sf.pharmacy_id)
        .run();

      await writeStorefrontAuditLog(env.DB, {
        storefrontId: sf.id,
        pharmacyId: sf.pharmacy_id,
        action: "storefront_slug_renamed",
        actorType: actor.actorType,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        entityType: "domain",
        entityId: sf.id,
        summary: `Renamed storefront slug from '${sf.slug}' to '${newSlug}'; registered 301 redirect from ${oldPrimaryHostname} -> ${newPrimaryHostname}.`,
        metadata: {
          old_slug: sf.slug,
          new_slug: newSlug,
          old_hostname: oldPrimaryHostname,
          new_hostname: newPrimaryHostname,
        },
      });

      const domainsRes = await env.DB.prepare(
        "SELECT * FROM storefront_domains WHERE storefront_id = ? ORDER BY is_primary DESC, created_at ASC"
      )
        .bind(sf.id)
        .all<StorefrontDomainRecord>();

      return new Response(
        JSON.stringify({
          ok: true,
          slug: newSlug,
          primary_domain: newPrimaryHostname,
          redirect_from: oldPrimaryHostname,
          domains: domainsRes.results || [],
        }),
        { status: 200, headers }
      );
    }

    // Case B: Add custom domain (`storefront_domains`)
    const customHostname = normalizeHostname(body.hostname);
    if (!customHostname || !customHostname.includes(".")) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_hostname", message: "Please provide a valid domain name." }),
        { status: 400, headers }
      );
    }

    if (customHostname.endsWith(`.${baseDomain}`) || customHostname === baseDomain) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "reserved_platform_domain",
          message: `Cannot add a *.${baseDomain} address as a custom domain; use slug rename instead.`,
        }),
        { status: 400, headers }
      );
    }

    const existingCustom = await env.DB.prepare(
      "SELECT id, storefront_id FROM storefront_domains WHERE hostname = ? LIMIT 1"
    )
      .bind(customHostname)
      .first();

    if (existingCustom) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "domain_collision",
          message: `Domain '${customHostname}' is already registered on the platform.`,
        }),
        { status: 409, headers }
      );
    }

    const domainId = `sfd_${crypto.randomUUID()}`;
    const verifyToken = `aivrasol-verify=${crypto.randomUUID().replace(/-/g, "")}`;
    const autoVerify = body.verify_immediately === true;

    await env.DB.prepare(
      `INSERT INTO storefront_domains (
         id, storefront_id, pharmacy_id, hostname, domain_type, is_primary,
         verification_status, verification_token, verification_method, ssl_status,
         verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'custom', 0, ?, ?, 'cname_txt', ?, ?, ?, ?)`
    )
      .bind(
        domainId,
        sf.id,
        sf.pharmacy_id,
        customHostname,
        autoVerify ? "verified" : "pending",
        verifyToken,
        autoVerify ? "active" : "pending",
        autoVerify ? nowIso : null,
        nowIso,
        nowIso
      )
      .run();

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "custom_domain_added",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "domain",
      entityId: domainId,
      summary: `Added custom domain '${customHostname}' (status: ${autoVerify ? "verified" : "pending"}).`,
      metadata: { hostname: customHostname, verification_status: autoVerify ? "verified" : "pending" },
    });

    const createdDomain = await env.DB.prepare("SELECT * FROM storefront_domains WHERE id = ? LIMIT 1")
      .bind(domainId)
      .first<StorefrontDomainRecord>();

    return new Response(JSON.stringify({ ok: true, domain: createdDomain }), {
      status: 201,
      headers,
    });
  }

  // PATCH or DELETE `/domains/:domainId`
  if (subPath.startsWith("/domains/")) {
    if (actor.actorType !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "forbidden_super_admin_only" }), {
        status: 403,
        headers,
      });
    }
    const domainId = decodeURIComponent(subPath.slice("/domains/".length));
    const domRow = await env.DB.prepare(
      "SELECT * FROM storefront_domains WHERE id = ? AND storefront_id = ? AND pharmacy_id = ? LIMIT 1"
    )
      .bind(domainId, sf.id, sf.pharmacy_id)
      .first<StorefrontDomainRecord>();

    if (!domRow) {
      return new Response(JSON.stringify({ ok: false, error: "domain_not_found" }), {
        status: 404,
        headers,
      });
    }

    if (req.method === "PATCH") {
      const body: any = await req.json();
      const nowIso = new Date().toISOString();
      const nextVerStatus = body.verification_status || "verified";
      await env.DB.prepare(
        `UPDATE storefront_domains
         SET verification_status = ?,
             ssl_status = ?,
             verified_at = CASE WHEN ? = 'verified' THEN ? ELSE verified_at END,
             last_checked_at = ?,
             updated_at = ?
         WHERE id = ? AND storefront_id = ?`
      )
        .bind(
          nextVerStatus,
          nextVerStatus === "verified" ? "active" : "pending",
          nextVerStatus,
          nowIso,
          nowIso,
          nowIso,
          domainId,
          sf.id
        )
        .run();

      await writeStorefrontAuditLog(env.DB, {
        storefrontId: sf.id,
        pharmacyId: sf.pharmacy_id,
        action: "custom_domain_verification_updated",
        actorType: actor.actorType,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        entityType: "domain",
        entityId: domainId,
        summary: `Updated domain '${domRow.hostname}' verification status to '${nextVerStatus}'.`,
      });

      const updatedDom = await env.DB.prepare("SELECT * FROM storefront_domains WHERE id = ? LIMIT 1")
        .bind(domainId)
        .first();
      return new Response(JSON.stringify({ ok: true, domain: updatedDom }), {
        status: 200,
        headers,
      });
    }

    if (req.method === "DELETE") {
      if (domRow.is_primary === 1) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "cannot_delete_primary_domain",
            message: "Cannot delete the primary storefront domain.",
          }),
          { status: 400, headers }
        );
      }
      await env.DB.prepare("DELETE FROM storefront_domains WHERE id = ? AND storefront_id = ?")
        .bind(domainId, sf.id)
        .run();
      return new Response(JSON.stringify({ ok: true, deleted_id: domainId }), {
        status: 200,
        headers,
      });
    }
  }

  // ── 11. Product Catalog & Publishing Management (`/products`, `/products/publishing`) — R2-First (0 D1 product reads/writes!) ──
  if (subPath === "/products" && req.method === "GET") {
    const statusFilter = (url.searchParams.get("publish_status") || "").trim();
    const categoryFilter = (url.searchParams.get("category") || "").trim().toLowerCase();
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));

    const { doc } = await loadStorefrontCatalogDoc(env, sf.id, sf.pharmacy_id, {
      hydrateCentralImages: true,
    });

    let rows = doc.products.filter((p) => {
      if (statusFilter && statusFilter !== "all" && p.publish_status !== statusFilter) {
        return false;
      }
      if (
        categoryFilter &&
        categoryFilter !== "all" &&
        String(p.category_name || "General Medicines").trim().toLowerCase() !== categoryFilter
      ) {
        return false;
      }
      if (search) {
        const matchName = p.name.toLowerCase().includes(search);
        const matchGen = (p.generic_name || "").toLowerCase().includes(search);
        const matchSku = (p.sku_code || "").toLowerCase().includes(search);
        const matchBrand = (p.brand_name || "").toLowerCase().includes(search);
        if (!matchName && !matchGen && !matchSku && !matchBrand) return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      const sCmp = String(a.publish_status || "").localeCompare(String(b.publish_status || ""));
      return sCmp !== 0 ? sCmp : a.name.localeCompare(b.name);
    });

    return new Response(JSON.stringify({ ok: true, products: rows.slice(0, limit) }), {
      status: 200,
      headers,
    });
  }

  // POST `/products/:posProdId/assign-image` — Manage product image source (owner override, shared pick, revert)
  const assignImgMatch = subPath.match(/^\/products\/([^/]+)\/assign-image$/);
  if (assignImgMatch && req.method === "POST") {
    const posProdId = decodeURIComponent(assignImgMatch[1]);
    const body: any = await req.json();
    const action = body.action as "set_owner_override" | "select_shared" | "revert_to_shared" | "submit_for_library";

    try {
      const result = await assignProductImage(
        env,
        sf.id,
        sf.pharmacy_id,
        posProdId,
        action,
        body.payload || body
      );
      return new Response(JSON.stringify({ ...result, ok: true }), { status: 200, headers });
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err?.message || "Failed to assign image" }), { status: 400, headers });
    }
  }

  // PATCH `/products/:productId` — Update website-only product presentation directly in R2-First Catalog (0 D1 product writes!)
  if (subPath.startsWith("/products/") && subPath !== "/products/publishing" && req.method === "PATCH") {
    const productId = decodeURIComponent(subPath.slice("/products/".length));
    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    const { doc } = await loadStorefrontCatalogDoc(env, sf.id, sf.pharmacy_id, {
      freshFromR2: true,
      hydrateCentralImages: false,
    });
    const prod = doc.products.find(
      (p) => p.id === productId || p.pos_product_id === productId
    );

    if (!prod) {
      return new Response(JSON.stringify({ ok: false, error: "product_not_found" }), {
        status: 404,
        headers,
      });
    }

    const settings = await env.DB.prepare(
      "SELECT allow_controlled_medicines FROM storefront_settings WHERE storefront_id = ? LIMIT 1"
    )
      .bind(sf.id)
      .first<{ allow_controlled_medicines: number }>();
    const allowControlled = Number(settings?.allow_controlled_medicines ?? 0) === 1;

    let nextPubStatus = body.publish_status ?? prod.publish_status;
    if (Number(prod.is_controlled_substance) === 1 && !allowControlled && nextPubStatus === "published") {
      nextPubStatus = "unpublished";
    }

    const nextOverridePrice =
      body.override_price_pkr === null || body.override_price_pkr === ""
        ? null
        : body.override_price_pkr !== undefined
        ? Math.max(0, Number(body.override_price_pkr))
        : prod.override_price_pkr;

    const nextComparePrice =
      body.compare_at_price_pkr === null || body.compare_at_price_pkr === ""
        ? null
        : body.compare_at_price_pkr !== undefined
        ? Math.max(0, Number(body.compare_at_price_pkr))
        : prod.compare_at_price_pkr;

    prod.publish_status = nextPubStatus;
    if (body.public_description !== undefined) prod.public_description = body.public_description;
    if (body.category_name !== undefined) {
      prod.category_name = String(body.category_name).trim() || "General Medicines";
    }
    if (body.primary_image_url !== undefined) {
      prod.primary_image_url = body.primary_image_url || null;
      if (body.primary_image_url) {
        prod.image_source = "owner_override";
      }
    }
    prod.override_price_pkr = nextOverridePrice;
    prod.compare_at_price_pkr = nextComparePrice;
    if (body.is_featured !== undefined) prod.is_featured = body.is_featured ? 1 : 0;
    if (body.is_popular !== undefined) prod.is_popular = body.is_popular ? 1 : 0;
    if (body.max_order_qty !== undefined) prod.max_order_qty = Math.max(1, Number(body.max_order_qty));
    prod.updated_at = nowIso;

    await saveStorefrontCatalogDoc(env, doc);
    const { publishedCount } = await syncStorefrontMetadataFromCatalogDoc(env.DB, doc, {
      bumpConfigVersion: true,
      syncCategories: true,
    });
    invalidateCategoryMetaCache(sf.id);
    invalidateTenantBundleCache(sf.id);

    return new Response(
      JSON.stringify({
        ok: true,
        product: prod,
        published_products_count: publishedCount,
      }),
      { status: 200, headers }
    );
  }

  if (subPath === "/products/publishing" && req.method === "PUT") {
    const body: any = await req.json();
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    const nowIso = new Date().toISOString();

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "empty_items", message: "No product publishing updates provided." }),
        { status: 400, headers }
      );
    }

    const settings = await env.DB.prepare(
      "SELECT allow_controlled_medicines FROM storefront_settings WHERE storefront_id = ? LIMIT 1"
    )
      .bind(sf.id)
      .first<{ allow_controlled_medicines: number }>();
    const allowControlled = Number(settings?.allow_controlled_medicines ?? 0) === 1;

    const { doc } = await loadStorefrontCatalogDoc(env, sf.id, sf.pharmacy_id, {
      freshFromR2: true,
      hydrateCentralImages: false,
    });
    const byPosId = new Map<string, R2CatalogProductRecord>();
    for (const p of doc.products) byPosId.set(p.pos_product_id, p);

    let updatedCount = 0;
    const rejected: Array<{ pos_product_id: string; reason: string }> = [];

    for (const item of items) {
      const violations = detectForbiddenPrivateKeys(item);
      if (violations.length > 0) {
        rejected.push({
          pos_product_id: String(item.pos_product_id || item.id || "unknown"),
          reason: `Forbidden private POS fields rejected: ${violations.join(", ")}`,
        });
        continue;
      }

      const posProductId = String(item.pos_product_id || "").trim();
      const name = String(item.name || "").trim();
      const price = Number(item.public_selling_price_pkr ?? 0);

      if (!posProductId || !name || price < 0) {
        rejected.push({
          pos_product_id: posProductId || "unknown",
          reason: "Missing pos_product_id, name, or valid public selling price.",
        });
        continue;
      }

      const isControlled = Boolean(item.is_controlled_substance);
      let publishStatus = item.publish_status || "published";
      if (isControlled && !allowControlled && publishStatus === "published") {
        publishStatus = "unpublished";
      }

      const existing = byPosId.get(posProductId);
      const prodId = existing?.id || `sfp_${crypto.randomUUID()}`;
      const prodSlug = existing?.slug || toUrlSlug(name, posProductId);
      const categoryName = String(item.category_name || existing?.category_name || "General Medicines").trim();
      const searchKeywords = [
        name,
        item.generic_name ?? existing?.generic_name,
        item.brand_name ?? existing?.brand_name,
        item.strength ?? existing?.strength,
        item.dosage_form ?? existing?.dosage_form,
        categoryName,
        item.sku_code ?? existing?.sku_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const nextRec: R2CatalogProductRecord = {
        id: prodId,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        pos_product_id: posProductId,
        master_medicine_id: item.master_medicine_id || existing?.master_medicine_id || null,
        sku_code: item.sku_code || existing?.sku_code || null,
        slug: prodSlug,
        name,
        generic_name: item.generic_name ?? existing?.generic_name ?? null,
        strength: item.strength ?? existing?.strength ?? null,
        dosage_form: item.dosage_form ?? existing?.dosage_form ?? null,
        brand_name: item.brand_name ?? existing?.brand_name ?? null,
        packing_label: item.packing_label ?? existing?.packing_label ?? null,
        unit_label: item.unit_label || existing?.unit_label || "Pack",
        base_unit_label: existing?.base_unit_label || item.unit_label || "Pack",
        selling_units_json: existing?.selling_units_json || "[]",
        public_description: item.public_description ?? existing?.public_description ?? null,
        public_selling_price_pkr: price,
        compare_at_price_pkr: item.compare_at_price_pkr ?? existing?.compare_at_price_pkr ?? null,
        override_price_pkr: existing?.override_price_pkr ?? null,
        availability_status: item.availability_status || existing?.availability_status || "in_stock",
        available_qty: Math.max(0, Number(item.available_qty ?? existing?.available_qty ?? 10)),
        available_base_qty: existing?.available_base_qty ?? Math.max(0, Number(item.available_qty ?? 10)),
        branch_stock_json: existing?.branch_stock_json || "{}",
        category_name: categoryName,
        primary_image_url: item.primary_image_url || existing?.primary_image_url || null,
        image_source: item.primary_image_url
          ? "owner_override"
          : existing?.image_source || "none",
        selected_media_id: existing?.selected_media_id || null,
        canonical_medicine_id: existing?.canonical_medicine_id || null,
        normalized_core_key: computeNormalizedCoreKey(name) || existing?.normalized_core_key || null,
        search_keywords: searchKeywords,
        publish_status: publishStatus,
        requires_prescription: item.requires_prescription ? 1 : 0,
        is_controlled_substance: isControlled ? 1 : 0,
        is_featured: item.is_featured ? 1 : 0,
        is_popular: existing?.is_popular ?? 0,
        max_order_qty: Math.max(1, Number(item.max_order_qty ?? existing?.max_order_qty ?? 10)),
        sync_version: (existing?.sync_version || 0) + 1,
        deleted_at: null,
        last_synced_at: nowIso,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
      };
      byPosId.set(posProductId, nextRec);
      updatedCount++;
    }

    doc.products = Array.from(byPosId.values());
    await saveStorefrontCatalogDoc(env, doc);
    const { publishedCount } = await syncStorefrontMetadataFromCatalogDoc(env.DB, doc, {
      bumpConfigVersion: true,
      syncCategories: true,
    });
    invalidateCategoryMetaCache(sf.id);
    invalidateTenantBundleCache(sf.id);

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "catalog_publishing_configured",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "catalog",
      entityId: sf.id,
      summary: `Updated publishing configuration for ${updatedCount} products (${publishedCount} total published).`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        updated_count: updatedCount,
        published_products_count: publishedCount,
        rejected,
      }),
      { status: 200, headers }
    );
  }

  // ── 12. Categories Management (`/categories`) ──
  if (subPath === "/categories" && (req.method === "GET" || req.method === "PUT")) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM storefront_categories WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, name ASC"
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, categories: results }), {
        status: 200,
        headers,
      });
    }

    const body: any = await req.json();
    const nowIso = new Date().toISOString();
    const name = String(body.name || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "missing_name" }), {
        status: 400,
        headers,
      });
    }
    const slug = toUrlSlug(body.slug || name);
    const catId = body.id || `sfc_${crypto.randomUUID()}`;

    await env.DB.prepare(
      `INSERT INTO storefront_categories (
         id, storefront_id, pharmacy_id, slug, name, description,
         sort_order, is_visible, published_product_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(storefront_id, slug) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         sort_order = excluded.sort_order,
         is_visible = excluded.is_visible,
         updated_at = excluded.updated_at`
    )
      .bind(
        catId,
        sf.id,
        sf.pharmacy_id,
        slug,
        name,
        body.description || null,
        Number(body.sort_order ?? 10),
        body.is_visible !== false ? 1 : 0,
        nowIso,
        nowIso
      )
      .run();

    await recalculateStorefrontCatalogCounts(env, sf.id, sf.pharmacy_id);
    invalidateCategoryMetaCache(sf.id);
    invalidateTenantBundleCache(sf.id);
    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_categories WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, name ASC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    return new Response(JSON.stringify({ ok: true, categories: results }), {
      status: 200,
      headers,
    });
  }

  // ── 13. Banners Management (`/banners`) ──
  if (subPath === "/banners" && (req.method === "GET" || req.method === "PUT")) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM storefront_banners WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, created_at DESC"
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, banners: results }), {
        status: 200,
        headers,
      });
    }

    const body: any = await req.json();
    const nowIso = new Date().toISOString();
    const title = String(body.title || "").trim();
    if (!title) {
      return new Response(JSON.stringify({ ok: false, error: "missing_title" }), {
        status: 400,
        headers,
      });
    }
    const bannerId = body.id || `sfban_${crypto.randomUUID()}`;

    await env.DB.prepare(
      `INSERT INTO storefront_banners (
         id, storefront_id, pharmacy_id, title, subtitle, badge_text,
         cta_label, cta_url, image_url, bg_gradient, placement, sort_order, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         subtitle = excluded.subtitle,
         badge_text = excluded.badge_text,
         cta_label = excluded.cta_label,
         cta_url = excluded.cta_url,
         image_url = excluded.image_url,
         bg_gradient = excluded.bg_gradient,
         placement = excluded.placement,
         sort_order = excluded.sort_order,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    )
      .bind(
        bannerId,
        sf.id,
        sf.pharmacy_id,
        title,
        body.subtitle || null,
        body.badge_text || null,
        body.cta_label || "Shop Now",
        body.cta_url || "#catalog",
        body.image_url || null,
        body.bg_gradient || "from-emerald-700 to-teal-900",
        body.placement || "hero",
        Number(body.sort_order ?? 1),
        body.is_active !== false ? 1 : 0,
        nowIso,
        nowIso
      )
      .run();

    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_banners WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, created_at DESC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    return new Response(JSON.stringify({ ok: true, banners: results }), {
      status: 200,
      headers,
    });
  }

  if (subPath.startsWith("/banners/") && req.method === "DELETE") {
    const bannerId = decodeURIComponent(subPath.slice("/banners/".length));
    await env.DB.prepare(
      "DELETE FROM storefront_banners WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
    )
      .bind(bannerId, sf.id, sf.pharmacy_id)
      .run();
    return new Response(JSON.stringify({ ok: true, deleted_id: bannerId }), { status: 200, headers });
  }

  // ── 14. Tenant & Shared Media System (`/media`, `/media/cleanup`) ──
  if (subPath === "/media" && req.method === "GET") {
    const purpose = (url.searchParams.get("purpose") || "").trim();
    let sql = `
      SELECT * FROM storefront_media
      WHERE (storefront_id = ? AND pharmacy_id = ?) OR is_shared = 1
    `;
    const params: unknown[] = [sf.id, sf.pharmacy_id];
    if (purpose) {
      sql += ` AND purpose = ?`;
      params.push(purpose);
    }
    sql += ` ORDER BY created_at DESC LIMIT 60`;
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return new Response(JSON.stringify({ ok: true, media: results || [] }), {
      status: 200,
      headers,
    });
  }

  if (subPath === "/media" && req.method === "POST") {
    const body: any = await req.json();
    const contentType = String(body.content_type || body.mime_type || "image/webp").toLowerCase();
    const allowedMime = ["image/webp", "image/avif", "image/png", "image/jpeg"];
    if (!allowedMime.includes(contentType)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "unsupported_media_type",
          message: "Only WebP, AVIF, PNG, and JPEG images are permitted.",
        }),
        { status: 400, headers }
      );
    }

    const contentStr = String(body.data_base64 || body.base64_data || body.content || "");
    const cleanedBase64 = contentStr.replace(/^data:[^;]+;base64,/, "");
    const estimatedBytes = Math.ceil((cleanedBase64.length * 3) / 4);
    const byteSize = Number(body.byte_size ?? estimatedBytes);

    // Server-side size guard: reject unoptimized multi-MB uploads (max 650 KB)
    if (byteSize > 650 * 1024) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "media_too_large",
          message: "Image exceeds 650 KB server limit. Please use the browser-side WebP optimizer before uploading.",
        }),
        { status: 413, headers }
      );
    }

    const contentHash = body.sha256_hex
      ? String(body.sha256_hex).toLowerCase()
      : await sha256Hex(cleanedBase64 || `${sf.id}:${Date.now()}`);
    const rawPurpose = String(body.purpose || body.asset_purpose || "product_image");
    const purpose = rawPurpose === "product" ? "product_image" : rawPurpose;
    const isShared = actor.actorType === "super_admin" && body.is_shared === true ? 1 : 0;
    const masterMedicineId = body.master_medicine_id ? String(body.master_medicine_id).trim() : null;
    const nowIso = new Date().toISOString();

    // Content-hash duplicate detection for this tenant (or shared library)
    const existingMedia = await env.DB.prepare(
      `SELECT * FROM storefront_media
       WHERE sha256_hex = ? AND ((storefront_id = ? AND pharmacy_id = ?) OR is_shared = 1)
       LIMIT 1`
    )
      .bind(contentHash, sf.id, sf.pharmacy_id)
      .first<Record<string, any>>();

    let mediaRecord: Record<string, any>;
    let deduplicated = false;

    if (existingMedia) {
      mediaRecord = existingMedia;
      deduplicated = true;
    } else {
      const mediaId = `sfm_${crypto.randomUUID()}`;
      const ext =
        String(body.extension || contentType.split("/")[1] || "webp")
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "webp";
      const r2Key = isShared
        ? `shared/medicines/${mediaId}.${ext}`
        : `storefronts/${sf.id}/${mediaId}.${ext}`;

      if (env.MEDIA_BUCKET && cleanedBase64) {
        let binaryPayload: Uint8Array | string = contentStr;
        try {
          const bin = atob(cleanedBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
          }
          binaryPayload = bytes;
        } catch {
          binaryPayload = contentStr;
        }
        await env.MEDIA_BUCKET.put(r2Key, binaryPayload, {
          httpMetadata: { contentType },
          customMetadata: {
            storefront_id: sf.id,
            pharmacy_id: sf.pharmacy_id,
            sha256_hex: contentHash,
          },
        });
      }

      const publicUrl = `/api/v1/public/media/${mediaId}`;
      const variantsJson =
        body.variants && typeof body.variants === "object"
          ? JSON.stringify(body.variants)
          : "{}";

      await env.DB.prepare(
        `INSERT INTO storefront_media (
           id, storefront_id, pharmacy_id, r2_object_key, public_url,
           content_type, byte_size, width, height, sha256_hex, purpose,
           is_shared, master_medicine_id, variants_json, uploaded_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          mediaId,
          sf.id,
          sf.pharmacy_id,
          r2Key,
          publicUrl,
          contentType,
          byteSize,
          body.width ? Number(body.width) : null,
          body.height ? Number(body.height) : null,
          contentHash,
          purpose,
          isShared,
          masterMedicineId,
          variantsJson,
          actor.actorId,
          nowIso
        )
        .run();

      await recordStorefrontUsage(env.DB, {
        storefrontId: sf.id,
        pharmacyId: sf.pharmacy_id,
        manageRequests: 1,
        r2BytesStoredDelta: byteSize,
        r2ClassAOps: 1,
      });

      mediaRecord = {
        id: mediaId,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        r2_object_key: r2Key,
        public_url: publicUrl,
        content_type: contentType,
        byte_size: byteSize,
        width: body.width ? Number(body.width) : null,
        height: body.height ? Number(body.height) : null,
        sha256_hex: contentHash,
        purpose,
        is_shared: isShared,
        master_medicine_id: masterMedicineId,
      };
    }

    // Automatically link reference if entity_type & entity_id are provided (or logo purpose)
    const rawEntityType = body.entity_type ? String(body.entity_type).trim() : "";
    const entityType =
      rawEntityType === "branding_logo"
        ? "branding"
        : rawEntityType || (purpose === "logo" ? "branding" : "");
    const entityId = body.entity_id
      ? String(body.entity_id).trim()
      : entityType === "branding"
      ? sf.id
      : "";

    if (entityType && entityId) {
      await env.DB.prepare(
        `INSERT INTO storefront_media_references (
           id, storefront_id, pharmacy_id, media_id, entity_type, entity_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(storefront_id, media_id, entity_type, entity_id) DO NOTHING`
      )
        .bind(
          `sfmr_${crypto.randomUUID()}`,
          sf.id,
          sf.pharmacy_id,
          mediaRecord.id,
          entityType,
          entityId,
          nowIso
        )
        .run();

      if (rawEntityType === "branding_hero") {
        await env.DB.prepare(
          `UPDATE storefront_branding
           SET hero_banner_url = ?, updated_at = ?
           WHERE storefront_id = ? AND pharmacy_id = ?`
        )
          .bind(mediaRecord.public_url, nowIso, sf.id, sf.pharmacy_id)
          .run();
        await env.DB.prepare(
          `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
        )
          .bind(nowIso, sf.id, sf.pharmacy_id)
          .run();
      } else if (entityType === "branding" || purpose === "logo") {
        await env.DB.prepare(
          `UPDATE storefront_branding
           SET logo_url = ?, logo_media_id = ?, updated_at = ?
           WHERE storefront_id = ? AND pharmacy_id = ?`
        )
          .bind(mediaRecord.public_url, mediaRecord.id, nowIso, sf.id, sf.pharmacy_id)
          .run();
      } else if (entityType === "product") {
        // Update product image directly inside R2-First Catalog (`live.json`) -> 0 D1 product writes!
        const { doc } = await loadStorefrontCatalogDoc(env, sf.id, sf.pharmacy_id, {
          freshFromR2: true,
          hydrateCentralImages: false,
        });
        const prodRow = doc.products.find(
          (p) => p.id === entityId || p.pos_product_id === entityId
        );
        if (prodRow) {
          prodRow.primary_image_url = mediaRecord.public_url;
          prodRow.selected_media_id = mediaRecord.id;
          prodRow.image_source = "owner_override";
          prodRow.updated_at = nowIso;
          const existingGallery = Array.isArray(prodRow.gallery_images) ? prodRow.gallery_images : [];
          prodRow.gallery_images = [
            {
              id: `sfpi_${crypto.randomUUID()}`,
              image_url: mediaRecord.public_url,
              alt_text: prodRow.name,
              sort_order: 0,
              is_primary: 1,
            },
            ...existingGallery
              .filter((g) => g.image_url !== mediaRecord.public_url)
              .map((g, idx) => ({ ...g, is_primary: 0, sort_order: idx + 1 })),
          ];
          await saveStorefrontCatalogDoc(env, doc);
        }
      } else if (entityType === "banner") {
        await env.DB.prepare(
          `UPDATE storefront_banners
           SET image_url = ?, media_id = ?, updated_at = ?
           WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?`
        )
          .bind(mediaRecord.public_url, mediaRecord.id, nowIso, entityId, sf.id, sf.pharmacy_id)
          .run();
      } else if (entityType === "category") {
        await env.DB.prepare(
          `UPDATE storefront_categories
           SET image_url = ?, updated_at = ?
           WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?`
        )
          .bind(mediaRecord.public_url, nowIso, entityId, sf.id, sf.pharmacy_id)
          .run();
        invalidateCategoryMetaCache(sf.id);
      }

      await bumpStorefrontConfigVersion(env.DB, sf.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        deduplicated,
        media: mediaRecord,
      }),
      { status: deduplicated ? 200 : 201, headers }
    );
  }

  if (subPath === "/media/cleanup" && req.method === "POST") {
    const unreferenced = await env.DB.prepare(
      `SELECT m.id, m.r2_object_key, m.byte_size
       FROM storefront_media m
       LEFT JOIN storefront_media_references r
         ON r.media_id = m.id AND r.storefront_id = m.storefront_id
       WHERE m.storefront_id = ? AND m.pharmacy_id = ? AND m.is_shared = 0
         AND r.id IS NULL`
    )
      .bind(sf.id, sf.pharmacy_id)
      .all<{ id: string; r2_object_key: string; byte_size: number }>();

    let removedCount = 0;
    let freedBytes = 0;
    for (const row of unreferenced.results || []) {
      await env.DB.prepare(
        "DELETE FROM storefront_media WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
      )
        .bind(row.id, sf.id, sf.pharmacy_id)
        .run();
      removedCount++;
      freedBytes += Number(row.byte_size || 0);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        removed_count: removedCount,
        freed_bytes: freedBytes,
      }),
      { status: 200, headers }
    );
  }

  // ── 14b. Online Orders Management & Notification Summary (`/orders`, `/orders/notifications`, `/orders/:orderId`) ──
  if (subPath === "/orders/notifications" && req.method === "GET") {
    // Query ONLY active/open orders using partial index `idx_storefront_orders_open_poll`
    // (avoids scanning historical completed/cancelled/rejected orders).
    const openRes = await env.DB.prepare(
      `SELECT id, order_number, customer_name, customer_phone, fulfillment_type,
              total_pkr, status, COALESCE(payment_status, 'unpaid') AS payment_status,
              COALESCE(pos_handoff_status, 'pending') AS pos_handoff_status,
              created_at, updated_at
       FROM storefront_orders
       WHERE storefront_id = ? AND pharmacy_id = ?
         AND status NOT IN ('completed', 'cancelled', 'rejected')
       ORDER BY created_at DESC
       LIMIT 50`
    )
      .bind(sf.id, sf.pharmacy_id)
      .all<Record<string, unknown>>();

    const openRows = openRes.results || [];
    const activeCount = openRows.length;
    let pendingNewCount = 0;
    let latestUpdatedAt: string | null = null;
    for (const r of openRows) {
      if (r.status === "pending_confirmation") pendingNewCount++;
      const upd = r.updated_at ? String(r.updated_at) : null;
      if (upd && (!latestUpdatedAt || upd > latestUpdatedAt)) latestUpdatedAt = upd;
    }
    const recentOrders = openRows.slice(0, 6);

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        active_attention_count: activeCount,
        new_unacknowledged_count: pendingNewCount,
        pending_confirmation_count: pendingNewCount,
        latest_updated_at: latestUpdatedAt,
        recent_orders: recentOrders,
      }),
      { status: 200, headers }
    );
  }

  if (subPath === "/orders" && req.method === "GET") {
    const statusFilter = (url.searchParams.get("status") || "").trim();
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 80));

    let sql = `
      SELECT *
      FROM storefront_orders
      WHERE storefront_id = ? AND pharmacy_id = ?
    `;
    const params: unknown[] = [sf.id, sf.pharmacy_id];

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "pending") {
        sql += ` AND status = 'pending_confirmation'`;
      } else if (statusFilter === "delivered") {
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
    if (search) {
      const pattern = `%${search}%`;
      sql += ` AND (LOWER(order_number) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_phone) LIKE ?)`;
      params.push(pattern, pattern, pattern);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const { results: orders } = await env.DB.prepare(sql)
      .bind(...params)
      .all<Record<string, any>>();

    const enriched: any[] = [];
    for (const ord of orders || []) {
      const [itemsRes, historyRes] = await Promise.all([
        env.DB.prepare(
          "SELECT * FROM storefront_order_items WHERE storefront_id = ? AND pharmacy_id = ? AND order_id = ? ORDER BY created_at ASC"
        )
          .bind(sf.id, sf.pharmacy_id, ord.id)
          .all(),
        env.DB.prepare(
          "SELECT * FROM storefront_order_status_history WHERE storefront_id = ? AND pharmacy_id = ? AND order_id = ? ORDER BY created_at ASC"
        )
          .bind(sf.id, sf.pharmacy_id, ord.id)
          .all(),
      ]);

      const outcome = ord.fulfillment_outcome ? String(ord.fulfillment_outcome).trim() : "";
      const displayStatus =
        outcome === "delivered" || outcome === "collected" || outcome === "returned"
          ? outcome
          : ord.status === "completed"
          ? ord.fulfillment_type === "pickup"
            ? "collected"
            : "delivered"
          : ord.status;

      const effectivePaymentStatus =
        ord.payment_status || (ord.payment_method === "cod" ? "pending_cod" : "unpaid");
      const codPaid = Number(ord.cod_paid_amount_pkr || 0);
      const codBalance =
        ord.cod_balance_due_pkr !== null && ord.cod_balance_due_pkr !== undefined
          ? Number(ord.cod_balance_due_pkr)
          : ord.payment_method === "cod" && effectivePaymentStatus !== "paid"
          ? Math.max(0, Number(ord.total_pkr || 0) - codPaid)
          : 0;
      let codCollections: any[] = [];
      if (typeof ord.cod_collections_json === "string" && ord.cod_collections_json.trim()) {
        try {
          const parsed = JSON.parse(ord.cod_collections_json);
          if (Array.isArray(parsed)) codCollections = parsed;
        } catch {
          codCollections = [];
        }
      }

      enriched.push({
        ...ord,
        status: displayStatus,
        pos_invoice_number: ord.pos_invoice_number || ord.pos_order_ref || null,
        payment_status: effectivePaymentStatus,
        cod_paid_amount_pkr: codPaid,
        cod_balance_due_pkr: codBalance,
        cod_collections: codCollections,
        requires_prescription: Number(ord.requires_prescription) === 1,
        items: (itemsRes.results || []).map((it: any) => ({
          ...it,
          product_name: it.product_name_snapshot,
          unit_label: it.selling_unit_name || it.unit_label_snapshot,
        })),
        history: historyRes.results || [],
      });
    }

    return new Response(JSON.stringify({ ok: true, orders: enriched }), {
      status: 200,
      headers,
    });
  }

  if (subPath.startsWith("/orders/") && req.method === "PATCH") {
    const orderId = decodeURIComponent(subPath.slice("/orders/".length));
    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    const ord = await env.DB.prepare(
      "SELECT * FROM storefront_orders WHERE (id = ? OR order_number = ?) AND storefront_id = ? AND pharmacy_id = ? LIMIT 1"
    )
      .bind(orderId, orderId, sf.id, sf.pharmacy_id)
      .first<Record<string, any>>();

    if (!ord) {
      return new Response(JSON.stringify({ ok: false, error: "order_not_found" }), {
        status: 404,
        headers,
      });
    }

    const currentOutcome = ord.fulfillment_outcome ? String(ord.fulfillment_outcome).trim() : "";
    const currentDisplayStatus =
      currentOutcome === "delivered" || currentOutcome === "collected" || currentOutcome === "returned"
        ? currentOutcome
        : ord.status === "completed"
        ? ord.fulfillment_type === "pickup"
          ? "collected"
          : "delivered"
        : String(ord.status);

    const rawNextStatus = body.status ? String(body.status).trim() : currentDisplayStatus;
    const nextStatusNorm = rawNextStatus === "pending" ? "pending_confirmation" : rawNextStatus;

    const allowedTransitions: Record<string, string[]> = {
      pending_confirmation: ["confirmed", "preparing", "cancelled", "rejected"],
      confirmed: [
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
        "delivered",
        "collected",
        "completed",
        "cancelled",
      ],
      preparing: [
        "ready_for_pickup",
        "out_for_delivery",
        "delivered",
        "collected",
        "completed",
        "cancelled",
      ],
      ready_for_pickup: ["collected", "completed", "cancelled"],
      out_for_delivery: ["delivered", "completed", "cancelled"],
      delivered: ["returned"],
      collected: ["returned"],
      completed: ["returned"],
      cancelled: [],
      rejected: [],
      returned: [],
    };

    if (
      nextStatusNorm !== currentDisplayStatus &&
      !(allowedTransitions[currentDisplayStatus] || []).includes(nextStatusNorm)
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "invalid_status_transition",
          message: `Cannot transition order ${ord.order_number} from '${currentDisplayStatus}' to '${nextStatusNorm}'.`,
        }),
        { status: 400, headers }
      );
    }

    let dbStatus = nextStatusNorm;
    let fulfillmentOutcome: string | null = currentOutcome || null;
    if (nextStatusNorm === "delivered") {
      dbStatus = "completed";
      fulfillmentOutcome = "delivered";
    } else if (nextStatusNorm === "collected") {
      dbStatus = "completed";
      fulfillmentOutcome = "collected";
    } else if (nextStatusNorm === "returned") {
      dbStatus = "completed";
      fulfillmentOutcome = "returned";
    } else if (nextStatusNorm === "completed") {
      dbStatus = "completed";
      fulfillmentOutcome = ord.fulfillment_type === "pickup" ? "collected" : "delivered";
    } else {
      fulfillmentOutcome = null;
    }

    const nextPaymentStatus = body.payment_status
      ? String(body.payment_status).trim()
      : ord.payment_status || (ord.payment_method === "cod" ? "pending_cod" : "unpaid");

    const nextHandoff =
      dbStatus === "completed"
        ? "fulfilled_in_pos"
        : dbStatus === "cancelled" || dbStatus === "rejected"
        ? "cancelled"
        : dbStatus !== "pending_confirmation" &&
          (!ord.pos_handoff_status || ord.pos_handoff_status === "pending")
        ? "acknowledged"
        : ord.pos_handoff_status || "pending";

    const note = body.note
      ? String(body.note).trim()
      : `Updated order status to '${nextStatusNorm}' (payment: '${nextPaymentStatus}').`;

    await env.DB.prepare(
      `UPDATE storefront_orders
       SET status = ?,
           fulfillment_outcome = ?,
           payment_status = ?,
           pos_handoff_status = ?,
           pos_order_ref = COALESCE(?, pos_order_ref),
           updated_at = ?
       WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?`
    )
      .bind(
        dbStatus,
        fulfillmentOutcome,
        nextPaymentStatus,
        nextHandoff,
        body.pos_order_ref || body.pos_invoice_number || null,
        nowIso,
        ord.id,
        sf.id,
        sf.pharmacy_id
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO storefront_order_status_history (
         id, storefront_id, pharmacy_id, order_id, from_status, to_status,
         actor_type, actor_id, note, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        `sfosh_${crypto.randomUUID()}`,
        sf.id,
        sf.pharmacy_id,
        ord.id,
        currentDisplayStatus,
        nextStatusNorm,
        actor.actorType,
        actor.actorEmail || actor.actorId,
        note,
        nowIso
      )
      .run();

    await writeStorefrontAuditLog(env.DB, {
      storefrontId: sf.id,
      pharmacyId: sf.pharmacy_id,
      action: "order_status_updated",
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      entityType: "order",
      entityId: ord.id,
      summary: `Order ${ord.order_number} status changed from '${currentDisplayStatus}' to '${nextStatusNorm}' (payment: ${nextPaymentStatus}).`,
      metadata: {
        order_number: ord.order_number,
        from_status: currentDisplayStatus,
        to_status: nextStatusNorm,
        payment_status: nextPaymentStatus,
      },
    });

    const updatedOrd = await env.DB.prepare(
      "SELECT * FROM storefront_orders WHERE id = ? AND storefront_id = ? LIMIT 1"
    )
      .bind(ord.id, sf.id)
      .first<Record<string, any>>();

    return new Response(
      JSON.stringify({
        ok: true,
        order: updatedOrd
          ? {
              ...updatedOrd,
              status: fulfillmentOutcome || updatedOrd.status,
            }
          : null,
      }),
      {
        status: 200,
        headers,
      }
    );
  }

  // ── 14c. Promotions Management (`/promotions`, `/promotions/:id`) ──
  if (subPath.startsWith("/promotions/") && req.method === "DELETE") {
    const promoId = decodeURIComponent(subPath.slice("/promotions/".length));
    await env.DB.prepare(
      "DELETE FROM storefront_promotions WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
    )
      .bind(promoId, sf.id, sf.pharmacy_id)
      .run();
    return new Response(JSON.stringify({ ok: true, deleted_id: promoId }), { status: 200, headers });
  }

  if (subPath === "/promotions" && (req.method === "GET" || req.method === "PUT" || req.method === "DELETE")) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM storefront_promotions WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY created_at DESC"
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, promotions: results || [] }), {
        status: 200,
        headers,
      });
    }

    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    if (req.method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM storefront_promotions WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
      )
        .bind(String(body.id || ""), sf.id, sf.pharmacy_id)
        .run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const title = String(body.title || "").trim();
    if (!title) {
      return new Response(JSON.stringify({ ok: false, error: "missing_title" }), {
        status: 400,
        headers,
      });
    }
    const promoId = body.id || `sfpr_${crypto.randomUUID()}`;

    await env.DB.prepare(
      `INSERT INTO storefront_promotions (
         id, storefront_id, pharmacy_id, title, description, promo_type, discount_value,
         code, badge_text, banner_image_url, min_order_pkr, starts_at, ends_at, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         promo_type = excluded.promo_type,
         discount_value = excluded.discount_value,
         code = excluded.code,
         badge_text = excluded.badge_text,
         banner_image_url = excluded.banner_image_url,
         min_order_pkr = excluded.min_order_pkr,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    )
      .bind(
        promoId,
        sf.id,
        sf.pharmacy_id,
        title,
        body.description || null,
        body.promo_type || body.promotion_type || "percentage",
        Number(body.discount_value || 0),
        body.code ? String(body.code).trim().toUpperCase() : null,
        body.badge_text || null,
        body.banner_image_url || null,
        Number(body.min_order_pkr || 0),
        body.starts_at || null,
        body.ends_at || null,
        body.is_active !== false ? 1 : 0,
        nowIso,
        nowIso
      )
      .run();

    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_promotions WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY created_at DESC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    return new Response(JSON.stringify({ ok: true, promotions: results || [] }), {
      status: 200,
      headers,
    });
  }

  // ── 14d. Delivery Zones Management (`/delivery-zones`, `/delivery-zones/:id`) ──
  if (subPath.startsWith("/delivery-zones/") && req.method === "DELETE") {
    const zoneId = decodeURIComponent(subPath.slice("/delivery-zones/".length));
    await env.DB.prepare(
      "DELETE FROM storefront_delivery_zones WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
    )
      .bind(zoneId, sf.id, sf.pharmacy_id)
      .run();
    return new Response(JSON.stringify({ ok: true, deleted_id: zoneId }), { status: 200, headers });
  }

  if (subPath === "/delivery-zones" && (req.method === "GET" || req.method === "PUT" || req.method === "DELETE")) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM storefront_delivery_zones WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, zone_name ASC"
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, delivery_zones: results || [] }), {
        status: 200,
        headers,
      });
    }

    const body: any = await req.json();
    const nowIso = new Date().toISOString();

    if (req.method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM storefront_delivery_zones WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
      )
        .bind(String(body.id || ""), sf.id, sf.pharmacy_id)
        .run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const zoneName = String(body.zone_name || body.name || "").trim();
    if (!zoneName) {
      return new Response(JSON.stringify({ ok: false, error: "missing_zone_name" }), {
        status: 400,
        headers,
      });
    }
    const zoneId = body.id || `sfdz_${crypto.randomUUID()}`;
    const areasJson = Array.isArray(body.areas)
      ? JSON.stringify(body.areas)
      : body.areas_json || '["All Local Areas"]';
    const resolvedFee = Number(body.delivery_fee_pkr ?? body.fee_pkr ?? 150);
    const resolvedFreeAbove =
      body.free_delivery_above_pkr !== undefined && body.free_delivery_above_pkr !== null
        ? Number(body.free_delivery_above_pkr)
        : body.free_above_pkr !== undefined && body.free_above_pkr !== null
        ? Number(body.free_above_pkr)
        : null;

    await env.DB.prepare(
      `INSERT INTO storefront_delivery_zones (
         id, storefront_id, pharmacy_id, branch_id, zone_name, city, areas_json,
         delivery_fee_pkr, min_order_pkr, free_delivery_above_pkr, estimated_minutes,
         is_active, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         zone_name = excluded.zone_name,
         city = excluded.city,
         areas_json = excluded.areas_json,
         delivery_fee_pkr = excluded.delivery_fee_pkr,
         min_order_pkr = excluded.min_order_pkr,
         free_delivery_above_pkr = excluded.free_delivery_above_pkr,
         estimated_minutes = excluded.estimated_minutes,
         is_active = excluded.is_active,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at`
    )
      .bind(
        zoneId,
        sf.id,
        sf.pharmacy_id,
        body.branch_id || "main",
        zoneName,
        body.city || sf.city || "Lahore",
        areasJson,
        resolvedFee,
        Number(body.min_order_pkr ?? 300),
        resolvedFreeAbove,
        Number(body.estimated_minutes ?? 45),
        body.is_active !== false ? 1 : 0,
        Number(body.sort_order ?? 1),
        nowIso,
        nowIso
      )
      .run();

    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_delivery_zones WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, zone_name ASC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    return new Response(JSON.stringify({ ok: true, delivery_zones: results || [] }), {
      status: 200,
      headers,
    });
  }

  // ── 14e. Branches Management (`/branches`) ──
  if (subPath === "/branches" && (req.method === "GET" || req.method === "PUT")) {
    if (req.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM storefront_branches WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY is_main DESC, name ASC"
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, branches: results || [] }), {
        status: 200,
        headers,
      });
    }

    const body: any = await req.json();
    const nowIso = new Date().toISOString();
    const name = String(body.name || body.branch_name || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ ok: false, error: "missing_branch_name" }), {
        status: 400,
        headers,
      });
    }
    const posBranchId = String(body.pos_branch_id || body.branch_code || "main").trim();
    const branchId = body.id || `sfb_${crypto.randomUUID()}`;
    const hoursJson =
      body.opening_hours && typeof body.opening_hours === "object"
        ? JSON.stringify(body.opening_hours)
        : body.opening_hours_json || '{"mon_sat":"09:00 AM - 11:00 PM","sun":"10:00 AM - 10:00 PM"}';
    const resolvedPickup =
      body.pickup_enabled !== undefined ? body.pickup_enabled !== false : body.pickup_supported !== false;
    const resolvedDelivery =
      body.delivery_enabled !== undefined
        ? body.delivery_enabled !== false
        : body.delivery_supported !== false;

    await env.DB.prepare(
      `INSERT INTO storefront_branches (
         id, storefront_id, pharmacy_id, pos_branch_id, branch_code, name,
         is_main, status, phone, whatsapp_phone, address_line, city,
         pickup_enabled, delivery_enabled, opening_hours_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(storefront_id, pos_branch_id) DO UPDATE SET
         name = excluded.name,
         status = excluded.status,
         phone = excluded.phone,
         whatsapp_phone = excluded.whatsapp_phone,
         address_line = excluded.address_line,
         city = excluded.city,
         pickup_enabled = excluded.pickup_enabled,
         delivery_enabled = excluded.delivery_enabled,
         opening_hours_json = excluded.opening_hours_json,
         updated_at = excluded.updated_at`
    )
      .bind(
        branchId,
        sf.id,
        sf.pharmacy_id,
        posBranchId,
        body.branch_code || posBranchId.toUpperCase(),
        name,
        body.is_main ? 1 : 0,
        body.status || "active",
        body.phone || body.contact_phone || sf.contact_phone || null,
        body.whatsapp_phone || sf.whatsapp_phone || null,
        body.address_line || sf.address_line || null,
        body.city || sf.city || "Lahore",
        resolvedPickup ? 1 : 0,
        resolvedDelivery ? 1 : 0,
        hoursJson,
        nowIso,
        nowIso
      )
      .run();

    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_branches WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY is_main DESC, name ASC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    return new Response(JSON.stringify({ ok: true, branches: results || [] }), {
      status: 200,
      headers,
    });
  }

  // ── 14b. Customer Order Reviews Moderation (`/reviews`, `/reviews/publish-all`, `/reviews/:reviewId`) ──
  if (subPath === "/reviews" && req.method === "GET") {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM storefront_reviews
         WHERE storefront_id = ? AND pharmacy_id = ?
         ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 150`
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, reviews: results || [] }), {
        status: 200,
        headers,
      });
    } catch {
      return new Response(JSON.stringify({ ok: true, reviews: [] }), { status: 200, headers });
    }
  }

  if (subPath === "/reviews/publish-all" && req.method === "POST") {
    const nowIso = new Date().toISOString();
    const upd = await env.DB.prepare(
      `UPDATE storefront_reviews
       SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?
       WHERE storefront_id = ? AND pharmacy_id = ? AND status = 'pending'`
    )
      .bind(nowIso, nowIso, sf.id, sf.pharmacy_id)
      .run();

    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();

    return new Response(
      JSON.stringify({
        ok: true,
        published_count: Number((upd as any)?.meta?.changes || 0),
      }),
      { status: 200, headers }
    );
  }

  if (subPath.startsWith("/reviews/") && req.method === "PATCH") {
    const reviewId = decodeURIComponent(subPath.slice("/reviews/".length));
    const body: any = await req.json();
    const nowIso = new Date().toISOString();
    const nextStatus =
      body.status === "published" || body.status === "hidden" || body.status === "pending"
        ? body.status
        : "published";
    const ownerReply =
      body.owner_reply !== undefined ? String(body.owner_reply || "").trim().slice(0, 600) || null : undefined;

    if (ownerReply !== undefined) {
      await env.DB.prepare(
        `UPDATE storefront_reviews
         SET status = ?, owner_reply = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ?
         WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?`
      )
        .bind(nextStatus, ownerReply, nextStatus, nowIso, nowIso, reviewId, sf.id, sf.pharmacy_id)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE storefront_reviews
         SET status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ?
         WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?`
      )
        .bind(nextStatus, nextStatus, nowIso, nowIso, reviewId, sf.id, sf.pharmacy_id)
        .run();
    }

    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();

    return new Response(JSON.stringify({ ok: true, id: reviewId, status: nextStatus }), {
      status: 200,
      headers,
    });
  }

  if (subPath.startsWith("/reviews/") && req.method === "DELETE") {
    const reviewId = decodeURIComponent(subPath.slice("/reviews/".length));
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      "DELETE FROM storefront_reviews WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
    )
      .bind(reviewId, sf.id, sf.pharmacy_id)
      .run();
    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();
    return new Response(JSON.stringify({ ok: true, deleted_id: reviewId }), {
      status: 200,
      headers,
    });
  }

  // ── 14c. Optional In-House Doctors (`/doctors`, `/doctors/:doctorId`) ──
  if (subPath === "/doctors" && req.method === "GET") {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM storefront_doctors
         WHERE storefront_id = ? AND pharmacy_id = ?
         ORDER BY sort_order ASC, name ASC`
      )
        .bind(sf.id, sf.pharmacy_id)
        .all();
      return new Response(JSON.stringify({ ok: true, doctors: results || [] }), {
        status: 200,
        headers,
      });
    } catch {
      return new Response(JSON.stringify({ ok: true, doctors: [] }), { status: 200, headers });
    }
  }

  if (subPath === "/doctors" && req.method === "PUT") {
    const body: any = await req.json();
    const nowIso = new Date().toISOString();
    const docId = body.id ? String(body.id).trim() : `sfdoc_${crypto.randomUUID()}`;
    const name = String(body.name || "").trim();
    if (!name) {
      return new Response(
        JSON.stringify({ ok: false, message: "Doctor name is required." }),
        { status: 400, headers }
      );
    }

    await env.DB.prepare(
      `INSERT INTO storefront_doctors (
         id, storefront_id, pharmacy_id, name, qualification, specialization, timings,
         days_available, consultation_fee_pkr, experience_years, room_or_clinic_note,
         bio, booking_phone, photo_url, media_id, sort_order, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         qualification = excluded.qualification,
         specialization = excluded.specialization,
         timings = excluded.timings,
         days_available = excluded.days_available,
         consultation_fee_pkr = excluded.consultation_fee_pkr,
         experience_years = excluded.experience_years,
         room_or_clinic_note = excluded.room_or_clinic_note,
         bio = excluded.bio,
         booking_phone = excluded.booking_phone,
         photo_url = excluded.photo_url,
         media_id = excluded.media_id,
         sort_order = excluded.sort_order,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    )
      .bind(
        docId,
        sf.id,
        sf.pharmacy_id,
        name,
        body.qualification ? String(body.qualification).trim() : null,
        body.specialization ? String(body.specialization).trim() : null,
        body.timings ? String(body.timings).trim() : null,
        body.days_available ? String(body.days_available).trim() : null,
        Math.max(0, Number(body.consultation_fee_pkr || 0)),
        body.experience_years !== undefined && body.experience_years !== "" && body.experience_years !== null
          ? Math.max(0, Math.floor(Number(body.experience_years)))
          : null,
        body.room_or_clinic_note ? String(body.room_or_clinic_note).trim() : null,
        body.bio ? String(body.bio).trim() : null,
        body.booking_phone ? String(body.booking_phone).trim() : null,
        body.photo_url ? String(body.photo_url).trim() : null,
        body.media_id ? String(body.media_id).trim() : null,
        Number(body.sort_order || 0),
        body.is_active === false || body.is_active === 0 ? 0 : 1,
        nowIso,
        nowIso
      )
      .run();

    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();

    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_doctors WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, name ASC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all();

    return new Response(JSON.stringify({ ok: true, id: docId, doctors: results || [] }), {
      status: 200,
      headers,
    });
  }

  if (subPath.startsWith("/doctors/") && req.method === "DELETE") {
    const docId = decodeURIComponent(subPath.slice("/doctors/".length));
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      "DELETE FROM storefront_doctors WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
    )
      .bind(docId, sf.id, sf.pharmacy_id)
      .run();
    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();
    return new Response(JSON.stringify({ ok: true, deleted_id: docId }), { status: 200, headers });
  }

  // ── 14d. Custom Pharmacy Services & Diagnostic Lab Tests (`/services`, `/services/:serviceId`) ──
  if (subPath === "/services" && req.method === "GET") {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM storefront_custom_services
         WHERE storefront_id = ? AND pharmacy_id = ?
         ORDER BY sort_order ASC, title ASC`
      )
        .bind(sf.id, sf.pharmacy_id)
        .all<Record<string, unknown>>();
      const services = (results || []).map((row) => {
        let items: any[] = [];
        try {
          const parsed = JSON.parse(String(row.items_json || "[]"));
          if (Array.isArray(parsed)) items = parsed;
        } catch {
          items = [];
        }
        return { ...row, home_service_available: Number(row.home_service_available || 0) === 1, items };
      });
      return new Response(JSON.stringify({ ok: true, services }), { status: 200, headers });
    } catch {
      return new Response(JSON.stringify({ ok: true, services: [] }), { status: 200, headers });
    }
  }

  if (subPath === "/services" && req.method === "PUT") {
    const body: any = await req.json();
    const nowIso = new Date().toISOString();
    const serviceId = body.id ? String(body.id).trim() : `sfsvc_${crypto.randomUUID()}`;
    const title = String(body.title || "").trim();
    if (!title) {
      return new Response(
        JSON.stringify({ ok: false, message: "Service title is required." }),
        { status: 400, headers }
      );
    }

    const sanitizedItems = Array.isArray(body.items)
      ? body.items
          .filter((it: any) => it && String(it.name || "").trim())
          .map((it: any) => ({
            name: String(it.name).trim(),
            price_pkr: Math.max(0, Number(it.price_pkr || 0)),
            sample_type: it.sample_type ? String(it.sample_type).trim() : undefined,
            report_time: it.report_time ? String(it.report_time).trim() : undefined,
            note: it.note ? String(it.note).trim() : undefined,
          }))
      : [];

    const startingPrice =
      body.starting_price_pkr !== undefined && body.starting_price_pkr !== "" && body.starting_price_pkr !== null
        ? Math.max(0, Number(body.starting_price_pkr))
        : sanitizedItems.length > 0
        ? Math.min(...sanitizedItems.map((i: any) => Number(i.price_pkr || 0)))
        : null;

    await env.DB.prepare(
      `INSERT INTO storefront_custom_services (
         id, storefront_id, pharmacy_id, title, service_type, subtitle, description,
         image_url, media_id, timings, home_service_available, starting_price_pkr,
         booking_phone, items_json, sort_order, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         service_type = excluded.service_type,
         subtitle = excluded.subtitle,
         description = excluded.description,
         image_url = excluded.image_url,
         media_id = excluded.media_id,
         timings = excluded.timings,
         home_service_available = excluded.home_service_available,
         starting_price_pkr = excluded.starting_price_pkr,
         booking_phone = excluded.booking_phone,
         items_json = excluded.items_json,
         sort_order = excluded.sort_order,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    )
      .bind(
        serviceId,
        sf.id,
        sf.pharmacy_id,
        title,
        String(body.service_type || "lab_tests").trim(),
        body.subtitle ? String(body.subtitle).trim() : null,
        body.description ? String(body.description).trim() : null,
        body.image_url ? String(body.image_url).trim() : null,
        body.media_id ? String(body.media_id).trim() : null,
        body.timings ? String(body.timings).trim() : null,
        body.home_service_available ? 1 : 0,
        startingPrice,
        body.booking_phone ? String(body.booking_phone).trim() : null,
        JSON.stringify(sanitizedItems),
        Number(body.sort_order || 0),
        body.is_active === false || body.is_active === 0 ? 0 : 1,
        nowIso,
        nowIso
      )
      .run();

    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();

    const { results } = await env.DB.prepare(
      "SELECT * FROM storefront_custom_services WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY sort_order ASC, title ASC"
    )
      .bind(sf.id, sf.pharmacy_id)
      .all<Record<string, unknown>>();

    const services = (results || []).map((row) => {
      let items: any[] = [];
      try {
        const parsed = JSON.parse(String(row.items_json || "[]"));
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
      return { ...row, home_service_available: Number(row.home_service_available || 0) === 1, items };
    });

    return new Response(JSON.stringify({ ok: true, id: serviceId, services }), {
      status: 200,
      headers,
    });
  }

  if (subPath.startsWith("/services/") && req.method === "DELETE") {
    const serviceId = decodeURIComponent(subPath.slice("/services/".length));
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      "DELETE FROM storefront_custom_services WHERE id = ? AND storefront_id = ? AND pharmacy_id = ?"
    )
      .bind(serviceId, sf.id, sf.pharmacy_id)
      .run();
    await env.DB.prepare(
      `UPDATE storefronts SET config_version = COALESCE(config_version, 1) + 1, updated_at = ? WHERE id = ? AND pharmacy_id = ?`
    )
      .bind(nowIso, sf.id, sf.pharmacy_id)
      .run();
    return new Response(JSON.stringify({ ok: true, deleted_id: serviceId }), { status: 200, headers });
  }

  // ── 15. Usage Summary (`/usage`) ──
  if (subPath === "/usage" && req.method === "GET") {
    const [dailyRes, mediaRow] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM storefront_usage_daily WHERE storefront_id = ? AND pharmacy_id = ? ORDER BY usage_date DESC LIMIT 30"
      )
        .bind(sf.id, sf.pharmacy_id)
        .all(),
      env.DB.prepare(
        "SELECT COUNT(*) AS media_count, COALESCE(SUM(byte_size), 0) AS media_bytes FROM storefront_media WHERE storefront_id = ? AND pharmacy_id = ?"
      )
        .bind(sf.id, sf.pharmacy_id)
        .first<{ media_count: number; media_bytes: number }>(),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        media_count: Number(mediaRow?.media_count || 0),
        media_bytes: Number(mediaRow?.media_bytes || 0),
        daily_usage: dailyRes.results || [],
        free_tier_limits: CLOUDFLARE_FREE_TIER_LIMITS,
      }),
      { status: 200, headers }
    );
  }

  // ── 16. Audit Logs (`/audit-logs`) ──
  if (subPath === "/audit-logs" && req.method === "GET") {
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));

    let sql = `
      SELECT id, storefront_id, pharmacy_id, action, actor_type, actor_id, actor_email,
             entity_type, entity_id, summary, metadata_json, ip_address, created_at
      FROM storefront_audit_logs
      WHERE storefront_id = ? AND pharmacy_id = ?
    `;
    const params: unknown[] = [sf.id, sf.pharmacy_id];

    if (cursor) {
      sql += ` AND (created_at < ? OR (created_at = ? AND id < ?))`;
      params.push(cursor.sortValue, cursor.sortValue, cursor.id);
    }

    sql += ` ORDER BY created_at DESC, id DESC LIMIT ?`;
    params.push(limit + 1);

    const { results } = await env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
    const hasMore = results.length > limit;
    const pageRows = hasMore ? results.slice(0, limit) : results;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(String(last.created_at), String(last.id)) : null;

    return new Response(
      JSON.stringify({
        ok: true,
        storefront_id: sf.id,
        items: pageRows.map((r) => ({
          ...r,
          metadata: (() => {
            try {
              return JSON.parse(String(r.metadata_json || "{}"));
            } catch {
              return {};
            }
          })(),
        })),
        next_cursor: nextCursor,
        has_more: hasMore,
      }),
      { status: 200, headers }
    );
  }

  return new Response(
    JSON.stringify({ ok: false, error: "not_found", message: "Unknown management sub-route" }),
    { status: 404, headers }
  );
}

