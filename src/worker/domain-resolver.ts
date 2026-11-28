/**
 * Multi-Tenant Hostname & Domain Resolution Engine (Section 5)
 *
 * Security Invariant:
 * - Public requests NEVER resolve a tenant from a client-supplied `pharmacy_id` or `storefront_id`.
 * - Tenant identity for public endpoints comes strictly from verified hostname resolution.
 * - Unverified custom domains NEVER resolve to a tenant.
 * - Renamed slugs stored as `redirect_alias` resolve to a safe 301 redirect target.
 */

import {
  PLATFORM_PRIMARY_BASE_DOMAIN,
  RESERVED_STOREFRONT_SLUGS,
} from "../shared/constants";
import type {
  DomainResolutionResponse,
  StorefrontBranchRecord,
  StorefrontBrandingRecord,
  StorefrontDomainRecord,
  StorefrontRecord,
  StorefrontSettingsRecord,
} from "../shared/types";
import { extractSubdomainSlug, normalizeHostname } from "../shared/validation";
import type { D1Database, StorefrontWorkerEnv } from "./env";

export interface ResolvedTenantContext {
  ok: boolean;
  resolutionStatus: "active" | "inactive" | "suspended" | "redirect" | "not_found";
  httpStatus: 200 | 301 | 403 | 404 | 423;
  requestedHostname: string;
  normalizedHostname: string;
  storefront: StorefrontRecord | null;
  redirectToHostname?: string;
  redirectUrl?: string;
  message?: string;
}

const SLUG_PATH_RE = /^\/s\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(?:\/|$)/i;
const VALID_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/i;

function extractSlugFromUrlOrHeaders(req: Request, url: URL): string | null {
  const pathMatch = url.pathname.match(SLUG_PATH_RE);
  if (pathMatch?.[1]) return pathMatch[1].toLowerCase();

  const headerSlug = req.headers.get("x-storefront-slug")?.trim();
  if (headerSlug && VALID_SLUG_RE.test(headerSlug)) return headerSlug.toLowerCase();

  const querySlug = url.searchParams.get("store")?.trim();
  if (querySlug && VALID_SLUG_RE.test(querySlug)) return querySlug.toLowerCase();

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refPathMatch = refUrl.pathname.match(SLUG_PATH_RE);
      if (refPathMatch?.[1]) return refPathMatch[1].toLowerCase();
      const refQuerySlug = refUrl.searchParams.get("store")?.trim();
      if (refQuerySlug && VALID_SLUG_RE.test(refQuerySlug)) return refQuerySlug.toLowerCase();
    } catch {
      // Ignore malformed referer
    }
  }
  return null;
}

/**
 * Extracts the effective hostname (or `workers-slug:<slug>` token on `*.workers.dev`) for resolution.
 * - On custom domains: uses the request `Host` header exclusively.
 * - On Cloudflare `*.workers.dev` staging/shared URLs: supports `/s/<slug>` and `?store=<slug>`
 *   so pharmacies get real HTTPS URLs immediately without requiring a paid custom domain.
 * - In local development (`ALLOW_DEV_HOST_OVERRIDE === "true"` or localhost origin):
 *   also allows `X-Storefront-Host` or `?hostname=` / `?__host=`.
 */
export function extractRequestHostname(req: Request, env: StorefrontWorkerEnv): string {
  const url = new URL(req.url);
  const rawHostHeader = req.headers.get("host") || url.host || "";
  const isWorkersDevHost =
    url.hostname.endsWith(".workers.dev") || rawHostHeader.split(":")[0].endsWith(".workers.dev");
  const isLocalHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".localhost") ||
    env.ALLOW_DEV_HOST_OVERRIDE === "true";

  if (isWorkersDevHost || isLocalHost) {
    const workersSlug = extractSlugFromUrlOrHeaders(req, url);
    if (workersSlug) {
      return `workers-slug:${workersSlug}`;
    }
  }

  if (isLocalHost) {
    const devHeaderHost = req.headers.get("x-storefront-host");
    if (devHeaderHost && devHeaderHost.trim()) {
      return devHeaderHost.trim();
    }
    const queryHost = url.searchParams.get("hostname") || url.searchParams.get("__host");
    if (queryHost && queryHost.trim()) {
      return queryHost.trim();
    }
    const referer = req.headers.get("referer");
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const refHost = refUrl.searchParams.get("hostname") || refUrl.searchParams.get("__host");
        if (refHost && refHost.trim()) {
          return refHost.trim();
        }
      } catch {
        // Ignore malformed referer
      }
    }
  }

  return rawHostHeader;
}

/**
 * Resolves a hostname (or `workers-slug:<slug>`) against `storefront_domains` and `storefronts`.
 */
export async function resolveTenantByHostname(
  db: D1Database,
  rawHostname: string,
  baseDomain: string = PLATFORM_PRIMARY_BASE_DOMAIN
): Promise<ResolvedTenantContext> {
  if (rawHostname.startsWith("workers-slug:")) {
    const slug = rawHostname.slice("workers-slug:".length).trim().toLowerCase();
    if (!slug || RESERVED_STOREFRONT_SLUGS.has(slug)) {
      return {
        ok: false,
        resolutionStatus: "not_found",
        httpStatus: 404,
        requestedHostname: rawHostname,
        normalizedHostname: slug,
        storefront: null,
        message: "Invalid or reserved pharmacy website slug.",
      };
    }

    const storefront = await db
      .prepare("SELECT * FROM storefronts WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first<StorefrontRecord>();

    if (!storefront) {
      return {
        ok: false,
        resolutionStatus: "not_found",
        httpStatus: 404,
        requestedHostname: rawHostname,
        normalizedHostname: slug,
        storefront: null,
        message: "No pharmacy website is registered for this slug.",
      };
    }

    return evaluateStorefrontLifecycle(storefront, rawHostname, storefront.primary_domain || slug);
  }

  const normalized = normalizeHostname(rawHostname);
  if (!normalized) {
    return {
      ok: false,
      resolutionStatus: "not_found",
      httpStatus: 404,
      requestedHostname: rawHostname,
      normalizedHostname: "",
      storefront: null,
      message: "Invalid or malformed hostname.",
    };
  }

  // Strip optional leading 'www.' for custom domains if needed, but check exact match first
  const candidates = [normalized];
  if (normalized.startsWith("www.")) {
    candidates.push(normalized.slice(4));
  }

  // 1. Check `storefront_domains` table first (handles primary subdomains, verified custom domains, and slug rename redirects)
  for (const hostCandidate of candidates) {
    const domainRow = await db
      .prepare(
        `SELECT id, storefront_id, pharmacy_id, hostname, domain_type, is_primary,
                verification_status, verification_token, verification_method,
                redirect_to_hostname, ssl_status, verified_at, created_at, updated_at
         FROM storefront_domains
         WHERE hostname = ?
         LIMIT 1`
      )
      .bind(hostCandidate)
      .first<StorefrontDomainRecord>();

    if (domainRow) {
      // Unverified custom domains must NEVER resolve to a pharmacy
      if (domainRow.verification_status !== "verified") {
        return {
          ok: false,
          resolutionStatus: "not_found",
          httpStatus: 404,
          requestedHostname: rawHostname,
          normalizedHostname: normalized,
          storefront: null,
          message: "Domain ownership is not verified.",
        };
      }

      // Safe redirect for renamed slugs or alias domains
      if (domainRow.domain_type === "redirect_alias" && domainRow.redirect_to_hostname) {
        return {
          ok: true,
          resolutionStatus: "redirect",
          httpStatus: 301,
          requestedHostname: rawHostname,
          normalizedHostname: normalized,
          storefront: null,
          redirectToHostname: domainRow.redirect_to_hostname,
          redirectUrl: `https://${domainRow.redirect_to_hostname}`,
          message: `Storefront has moved to ${domainRow.redirect_to_hostname}`,
        };
      }

      const storefront = await db
        .prepare("SELECT * FROM storefronts WHERE id = ? AND pharmacy_id = ? LIMIT 1")
        .bind(domainRow.storefront_id, domainRow.pharmacy_id)
        .first<StorefrontRecord>();

      if (!storefront) {
        return {
          ok: false,
          resolutionStatus: "not_found",
          httpStatus: 404,
          requestedHostname: rawHostname,
          normalizedHostname: normalized,
          storefront: null,
          message: "Storefront record not found.",
        };
      }

      return evaluateStorefrontLifecycle(storefront, rawHostname, normalized);
    }
  }

  // 2. Fallback: Check platform subdomain pattern `<slug>.aivrasol.pk` or `<slug>.localhost`
  const subInfo = extractSubdomainSlug(normalized, baseDomain);
  if (subInfo.isPlatformSubdomain && subInfo.slug) {
    if (RESERVED_STOREFRONT_SLUGS.has(subInfo.slug)) {
      return {
        ok: false,
        resolutionStatus: "not_found",
        httpStatus: 404,
        requestedHostname: rawHostname,
        normalizedHostname: normalized,
        storefront: null,
        message: "Reserved platform subdomain.",
      };
    }

    const storefront = await db
      .prepare("SELECT * FROM storefronts WHERE slug = ? LIMIT 1")
      .bind(subInfo.slug)
      .first<StorefrontRecord>();

    if (storefront) {
      return evaluateStorefrontLifecycle(storefront, rawHostname, normalized);
    }
  }

  return {
    ok: false,
    resolutionStatus: "not_found",
    httpStatus: 404,
    requestedHostname: rawHostname,
    normalizedHostname: normalized,
    storefront: null,
    message: "No pharmacy website is registered at this address.",
  };
}

function evaluateStorefrontLifecycle(
  storefront: StorefrontRecord,
  rawHostname: string,
  normalizedHostname: string
): ResolvedTenantContext {
  // Check suspended pharmacy or suspended/expired entitlement first
  if (
    storefront.status === "suspended" ||
    storefront.entitlement_status === "suspended" ||
    storefront.entitlement_status === "expired"
  ) {
    return {
      ok: false,
      resolutionStatus: "suspended",
      httpStatus: 403,
      requestedHostname: rawHostname,
      normalizedHostname,
      storefront,
      message:
        storefront.suspended_reason ||
        "This pharmacy website is currently suspended. Please contact the pharmacy directly.",
    };
  }

  // Check disabled or pending_setup state
  if (
    storefront.status !== "active" ||
    Number(storefront.website_enabled) !== 1 ||
    storefront.entitlement_status === "none"
  ) {
    return {
      ok: false,
      resolutionStatus: "inactive",
      httpStatus: 423,
      requestedHostname: rawHostname,
      normalizedHostname,
      storefront,
      message:
        storefront.disabled_reason ||
        "This pharmacy website is currently offline or undergoing setup.",
    };
  }

  return {
    ok: true,
    resolutionStatus: "active",
    httpStatus: 200,
    requestedHostname: rawHostname,
    normalizedHostname,
    storefront,
  };
}

export interface ResolvedTenantBundle {
  ctx: ResolvedTenantContext;
  settings: StorefrontSettingsRecord | null;
  branding: StorefrontBrandingRecord | null;
  branches: StorefrontBranchRecord[];
  reviewSummary: { count: number; avg: number } | null;
}

// Isolate-level cache (0ms) backed by the colo-wide Cloudflare Cache API (~1ms, 0 D1 reads),
// so a cold isolate does not re-run 4-6 D1 queries per pharmacy hostname.
// Setting/branding edits become visible within TENANT_BUNDLE_CACHE_TTL_MS (5 min) on other
// isolates/colos; edits made through this Worker evict the local isolate + colo entries instantly.
const TENANT_BUNDLE_CACHE_TTL_MS = 5 * 60_000;
const TENANT_BUNDLE_NEGATIVE_TTL_MS = 60_000;
const TENANT_BUNDLE_CACHE_MAX = 1000;
const TENANT_BUNDLE_EDGE_TTL_SEC = 300;
const TENANT_BUNDLE_EDGE_NEGATIVE_TTL_SEC = 60;
const TENANT_BUNDLE_EDGE_PREFIX = "https://cache.internal/tenant-bundle/";
const tenantBundleCache = new Map<
  string,
  { expiresAt: number; bundle: ResolvedTenantBundle }
>();
const tenantBundleInflight = new Map<string, Promise<ResolvedTenantBundle>>();

function getEdgeCacheOrNull(): Cache | null {
  try {
    if (typeof caches === "undefined") return null;
    const c = (caches as unknown as { default?: Cache }).default;
    return c && typeof c.match === "function" && typeof c.put === "function" ? c : null;
  } catch {
    return null;
  }
}

function tenantBundleEdgeKey(cacheKey: string): Request {
  return new Request(`${TENANT_BUNDLE_EDGE_PREFIX}${encodeURIComponent(cacheKey)}`, {
    method: "GET",
  });
}

/**
 * Evicts cached tenant metadata from this Worker isolate (and this colo's Cache API copy)
 * immediately whenever branding, settings, status, sync version, or reviews change.
 */
export function invalidateTenantBundleCache(storefrontId?: string): void {
  const edge = getEdgeCacheOrNull();
  const evictEdge = (key: string) => {
    if (!edge) return;
    try {
      void edge.delete(tenantBundleEdgeKey(key)).catch(() => false);
    } catch {
      // ignore
    }
  };
  if (!storefrontId) {
    for (const k of tenantBundleCache.keys()) evictEdge(k);
    tenantBundleCache.clear();
    return;
  }
  for (const [k, entry] of tenantBundleCache.entries()) {
    if (entry.bundle.ctx.storefront?.id === storefrontId) {
      tenantBundleCache.delete(k);
      evictEdge(k);
    }
  }
}

function putTenantBundleIsolate(cacheKey: string, bundle: ResolvedTenantBundle, ttlMs: number): void {
  if (tenantBundleCache.size >= TENANT_BUNDLE_CACHE_MAX && !tenantBundleCache.has(cacheKey)) {
    const firstKey = tenantBundleCache.keys().next().value;
    if (firstKey) tenantBundleCache.delete(firstKey);
  }
  tenantBundleCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, bundle });
}

async function loadTenantBundleFromD1(
  db: D1Database,
  rawHostname: string,
  baseDomain: string
): Promise<ResolvedTenantBundle> {
  const ctx = await resolveTenantByHostname(db, rawHostname, baseDomain);
  let settings: StorefrontSettingsRecord | null = null;
  let branding: StorefrontBrandingRecord | null = null;
  let branches: StorefrontBranchRecord[] = [];
  let reviewSummary: { count: number; avg: number } | null = null;

  if (ctx.storefront) {
    const sf = ctx.storefront;
    if (ctx.ok) {
      const [sRow, bRow, brRes, rvRow] = await Promise.all([
        db
          .prepare("SELECT * FROM storefront_settings WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1")
          .bind(sf.id, sf.pharmacy_id)
          .first<StorefrontSettingsRecord>(),
        db
          .prepare("SELECT * FROM storefront_branding WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1")
          .bind(sf.id, sf.pharmacy_id)
          .first<StorefrontBrandingRecord>(),
        db
          .prepare(
            "SELECT * FROM storefront_branches WHERE storefront_id = ? AND pharmacy_id = ? AND status = 'active' ORDER BY is_main DESC, name ASC"
          )
          .bind(sf.id, sf.pharmacy_id)
          .all<StorefrontBranchRecord>(),
        // Review aggregate is computed once per bundle miss (5-min colo cache) and reused by
        // SEO JSON-LD, /reviews and /bootstrap — no per-request COUNT/AVG scans.
        db
          .prepare(
            `SELECT COUNT(*) AS cnt, AVG(rating) AS avg_r FROM storefront_reviews
             WHERE storefront_id = ? AND pharmacy_id = ? AND status = 'published'`
          )
          .bind(sf.id, sf.pharmacy_id)
          .first<{ cnt: number; avg_r: number | null }>()
          .catch(() => null),
      ]);
      settings = sRow || null;
      branding = bRow || null;
      branches = brRes.results || [];
      if (rvRow && Number(rvRow.cnt || 0) > 0 && rvRow.avg_r) {
        reviewSummary = {
          count: Number(rvRow.cnt),
          avg: Number(Number(rvRow.avg_r).toFixed(1)),
        };
      }
    } else {
      branding =
        (await db
          .prepare("SELECT * FROM storefront_branding WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1")
          .bind(sf.id, sf.pharmacy_id)
          .first<StorefrontBrandingRecord>()) || null;
    }
  }

  return { ctx, settings, branding, branches, reviewSummary };
}

/**
 * Blazing-fast cached tenant resolver + settings/branding/branches/review bundle.
 * - Isolate warm hit: 0ms latency, 0 D1 reads!
 * - Colo Cache API hit: ~1ms, 0 D1 reads (shared by every isolate in the data center).
 * - Cold miss: single parallel D1 read, deduped across concurrent requests (single-flight).
 */
export async function resolveTenantBundleCached(
  db: D1Database,
  rawHostname: string,
  baseDomain: string = PLATFORM_PRIMARY_BASE_DOMAIN,
  execCtx?: { waitUntil(promise: Promise<unknown>): void }
): Promise<ResolvedTenantBundle> {
  const cacheKey = `${rawHostname.toLowerCase()}|${baseDomain.toLowerCase()}`;
  const cached = tenantBundleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bundle;
  }

  const inflight = tenantBundleInflight.get(cacheKey);
  if (inflight) return inflight;

  const p = (async (): Promise<ResolvedTenantBundle> => {
    const edge = getEdgeCacheOrNull();
    const edgeKey = edge ? tenantBundleEdgeKey(cacheKey) : null;

    if (edge && edgeKey) {
      try {
        const hit = await edge.match(edgeKey);
        if (hit) {
          const bundle = (await hit.json()) as ResolvedTenantBundle;
          if (bundle && bundle.ctx) {
            putTenantBundleIsolate(
              cacheKey,
              bundle,
              bundle.ctx.storefront ? TENANT_BUNDLE_CACHE_TTL_MS : TENANT_BUNDLE_NEGATIVE_TTL_MS
            );
            return bundle;
          }
        }
      } catch {
        // Fall through to D1
      }
    }

    const bundle = await loadTenantBundleFromD1(db, rawHostname, baseDomain);
    const positive = Boolean(bundle.ctx.storefront) || bundle.ctx.resolutionStatus === "redirect";
    putTenantBundleIsolate(
      cacheKey,
      bundle,
      positive ? TENANT_BUNDLE_CACHE_TTL_MS : TENANT_BUNDLE_NEGATIVE_TTL_MS
    );

    if (edge && edgeKey) {
      try {
        const ttl = positive ? TENANT_BUNDLE_EDGE_TTL_SEC : TENANT_BUNDLE_EDGE_NEGATIVE_TTL_SEC;
        const putPromise = edge
          .put(
            edgeKey,
            new Response(JSON.stringify(bundle), {
              status: 200,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": `public, max-age=${ttl}`,
              },
            })
          )
          .catch(() => {});
        if (execCtx && typeof execCtx.waitUntil === "function") execCtx.waitUntil(putPromise);
      } catch {
        // Non-fatal
      }
    }
    return bundle;
  })();

  tenantBundleInflight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    if (tenantBundleInflight.get(cacheKey) === p) tenantBundleInflight.delete(cacheKey);
  }
}

/**
 * Builds the `/api/v1/public/resolve` JSON payload directly from an already-loaded `ResolvedTenantBundle`
 * (0 extra D1 queries!).
 */
export function buildPublicResolutionPayloadFromBundle(
  bundle: ResolvedTenantBundle
): DomainResolutionResponse {
  const { ctx, branding, settings, branches } = bundle;
  if (ctx.resolutionStatus === "redirect") {
    return {
      ok: true,
      resolution_status: "redirect",
      requested_hostname: ctx.requestedHostname,
      normalized_hostname: ctx.normalizedHostname,
      redirect_to_hostname: ctx.redirectToHostname,
      redirect_url: ctx.redirectUrl,
      message: ctx.message,
    };
  }
  if (ctx.resolutionStatus === "not_found" || !ctx.storefront) {
    return {
      ok: false,
      resolution_status: "not_found",
      requested_hostname: ctx.requestedHostname,
      normalized_hostname: ctx.normalizedHostname,
      message: ctx.message || "Pharmacy website not found.",
    };
  }

  const sf = ctx.storefront;
  if (ctx.resolutionStatus === "suspended" || ctx.resolutionStatus === "inactive") {
    return {
      ok: false,
      resolution_status: ctx.resolutionStatus,
      requested_hostname: ctx.requestedHostname,
      normalized_hostname: ctx.normalizedHostname,
      message: ctx.message,
      storefront: {
        id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        slug: sf.slug,
        pharmacy_name: sf.pharmacy_name,
        primary_domain: sf.primary_domain,
        status: sf.status,
        website_enabled: Number(sf.website_enabled) === 1,
        entitlement_status: sf.entitlement_status,
        city: sf.city,
        address_line: sf.address_line,
        contact_phone: sf.contact_phone,
        whatsapp_phone: sf.whatsapp_phone,
        contact_email: sf.contact_email,
        drug_sale_license_no: sf.drug_sale_license_no,
        pharmacist_name: sf.pharmacist_name,
        published_products_count: 0,
        config_version: sf.config_version,
      },
      branding: branding || undefined,
    };
  }

  let openingHours: Record<string, unknown> = {};
  if (settings?.opening_hours_json) {
    try {
      openingHours = JSON.parse(settings.opening_hours_json);
    } catch {
      openingHours = {};
    }
  }

  return {
    ok: true,
    resolution_status: "active",
    requested_hostname: ctx.requestedHostname,
    normalized_hostname: ctx.normalizedHostname,
    storefront: {
      id: sf.id,
      pharmacy_id: sf.pharmacy_id,
      slug: sf.slug,
      pharmacy_name: sf.pharmacy_name,
      primary_domain: sf.primary_domain,
      status: sf.status,
      website_enabled: Number(sf.website_enabled) === 1,
      entitlement_status: sf.entitlement_status,
      city: sf.city,
      region: sf.region ?? null,
      country: sf.country || "PK",
      postal_code: sf.postal_code ?? null,
      latitude: sf.latitude !== null && sf.latitude !== undefined ? Number(sf.latitude) : null,
      longitude: sf.longitude !== null && sf.longitude !== undefined ? Number(sf.longitude) : null,
      address_line: sf.address_line,
      contact_phone: sf.contact_phone,
      whatsapp_phone: sf.whatsapp_phone,
      contact_email: sf.contact_email,
      drug_sale_license_no: sf.drug_sale_license_no,
      pharmacist_name: sf.pharmacist_name,
      published_products_count: Number(sf.published_products_count || 0),
      config_version: Number(sf.config_version || 1),
    },
    branding: branding || undefined,
    settings: settings
      ? {
          delivery_enabled: settings.delivery_enabled,
          pickup_enabled: settings.pickup_enabled,
          min_order_amount_pkr: settings.min_order_amount_pkr,
          standard_delivery_fee_pkr: settings.standard_delivery_fee_pkr,
          free_delivery_threshold_pkr: settings.free_delivery_threshold_pkr,
          estimated_delivery_minutes: settings.estimated_delivery_minutes,
          estimated_pickup_minutes: settings.estimated_pickup_minutes,
          delivery_radius_km: settings.delivery_radius_km,
          cod_enabled: settings.cod_enabled,
          bank_transfer_enabled: settings.bank_transfer_enabled,
          prescription_upload_enabled: settings.prescription_upload_enabled,
          whatsapp_order_assist_enabled: settings.whatsapp_order_assist_enabled,
          announcement_bar_enabled: settings.announcement_bar_enabled,
          announcement_bar_text: settings.announcement_bar_text,
          featured_categories_enabled: settings.featured_categories_enabled,
          require_rx_for_prescription_items: settings.require_rx_for_prescription_items,
          show_exact_stock_qty: settings.show_exact_stock_qty,
          hide_out_of_stock: settings.hide_out_of_stock,
          seo_title: settings.seo_title,
          seo_description: settings.seo_description,
          legal_disclaimer_text: settings.legal_disclaimer_text,
          pharmacist_supervision_note: settings.pharmacist_supervision_note,
          emergency_notice_text: settings.emergency_notice_text,
          opening_hours: openingHours,
        }
      : undefined,
    branches,
  };
}

/**
 * Loads full public resolution payload (Storefront + Branding + Public Settings + Active Branches)
 * for `/api/v1/public/resolve`.
 */
export async function buildPublicResolutionPayload(
  db: D1Database,
  ctx: ResolvedTenantContext
): Promise<DomainResolutionResponse> {
  if (ctx.resolutionStatus === "redirect") {
    return {
      ok: true,
      resolution_status: "redirect",
      requested_hostname: ctx.requestedHostname,
      normalized_hostname: ctx.normalizedHostname,
      redirect_to_hostname: ctx.redirectToHostname,
      redirect_url: ctx.redirectUrl,
      message: ctx.message,
    };
  }

  if (ctx.resolutionStatus === "not_found" || !ctx.storefront) {
    return {
      ok: false,
      resolution_status: "not_found",
      requested_hostname: ctx.requestedHostname,
      normalized_hostname: ctx.normalizedHostname,
      message: ctx.message || "Pharmacy website not found.",
    };
  }

  const sf = ctx.storefront;

  // For suspended or inactive websites, return only basic identity + branding so the UI shell
  // can display a branded status screen without exposing catalog or internal settings.
  const branding = await db
    .prepare("SELECT * FROM storefront_branding WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1")
    .bind(sf.id, sf.pharmacy_id)
    .first<StorefrontBrandingRecord>();

  if (ctx.resolutionStatus === "suspended" || ctx.resolutionStatus === "inactive") {
    return {
      ok: false,
      resolution_status: ctx.resolutionStatus,
      requested_hostname: ctx.requestedHostname,
      normalized_hostname: ctx.normalizedHostname,
      message: ctx.message,
      storefront: {
        id: sf.id,
        pharmacy_id: sf.pharmacy_id,
        slug: sf.slug,
        pharmacy_name: sf.pharmacy_name,
        primary_domain: sf.primary_domain,
        status: sf.status,
        website_enabled: Number(sf.website_enabled) === 1,
        entitlement_status: sf.entitlement_status,
        city: sf.city,
        address_line: sf.address_line,
        contact_phone: sf.contact_phone,
        whatsapp_phone: sf.whatsapp_phone,
        contact_email: sf.contact_email,
        drug_sale_license_no: sf.drug_sale_license_no,
        pharmacist_name: sf.pharmacist_name,
        published_products_count: 0,
        config_version: sf.config_version,
      },
      branding: branding || undefined,
    };
  }

  const [settings, branchesRes] = await Promise.all([
    db
      .prepare("SELECT * FROM storefront_settings WHERE storefront_id = ? AND pharmacy_id = ? LIMIT 1")
      .bind(sf.id, sf.pharmacy_id)
      .first<StorefrontSettingsRecord>(),
    db
      .prepare(
        "SELECT * FROM storefront_branches WHERE storefront_id = ? AND pharmacy_id = ? AND status = 'active' ORDER BY is_main DESC, name ASC"
      )
      .bind(sf.id, sf.pharmacy_id)
      .all<StorefrontBranchRecord>(),
  ]);

  let openingHours: Record<string, unknown> = {};
  if (settings?.opening_hours_json) {
    try {
      openingHours = JSON.parse(settings.opening_hours_json);
    } catch {
      openingHours = {};
    }
  }

  return {
    ok: true,
    resolution_status: "active",
    requested_hostname: ctx.requestedHostname,
    normalized_hostname: ctx.normalizedHostname,
    storefront: {
      id: sf.id,
      pharmacy_id: sf.pharmacy_id,
      slug: sf.slug,
      pharmacy_name: sf.pharmacy_name,
      primary_domain: sf.primary_domain,
      status: sf.status,
      website_enabled: Number(sf.website_enabled) === 1,
      entitlement_status: sf.entitlement_status,
      city: sf.city,
      region: sf.region ?? null,
      country: sf.country || "PK",
      postal_code: sf.postal_code ?? null,
      latitude: sf.latitude !== null && sf.latitude !== undefined ? Number(sf.latitude) : null,
      longitude: sf.longitude !== null && sf.longitude !== undefined ? Number(sf.longitude) : null,
      address_line: sf.address_line,
      contact_phone: sf.contact_phone,
      whatsapp_phone: sf.whatsapp_phone,
      contact_email: sf.contact_email,
      drug_sale_license_no: sf.drug_sale_license_no,
      pharmacist_name: sf.pharmacist_name,
      published_products_count: Number(sf.published_products_count || 0),
      config_version: Number(sf.config_version || 1),
    },
    branding: branding || undefined,
    settings: settings
      ? {
          delivery_enabled: settings.delivery_enabled,
          pickup_enabled: settings.pickup_enabled,
          min_order_amount_pkr: settings.min_order_amount_pkr,
          standard_delivery_fee_pkr: settings.standard_delivery_fee_pkr,
          free_delivery_threshold_pkr: settings.free_delivery_threshold_pkr,
          estimated_delivery_minutes: settings.estimated_delivery_minutes,
          estimated_pickup_minutes: settings.estimated_pickup_minutes,
          delivery_radius_km: settings.delivery_radius_km,
          cod_enabled: settings.cod_enabled,
          bank_transfer_enabled: settings.bank_transfer_enabled,
          prescription_upload_enabled: settings.prescription_upload_enabled,
          whatsapp_order_assist_enabled: settings.whatsapp_order_assist_enabled,
          announcement_bar_enabled: settings.announcement_bar_enabled,
          announcement_bar_text: settings.announcement_bar_text,
          featured_categories_enabled: settings.featured_categories_enabled,
          require_rx_for_prescription_items: settings.require_rx_for_prescription_items,
          show_exact_stock_qty: settings.show_exact_stock_qty,
          hide_out_of_stock: settings.hide_out_of_stock,
          seo_title: settings.seo_title,
          seo_description: settings.seo_description,
          legal_disclaimer_text: settings.legal_disclaimer_text,
          pharmacist_supervision_note: settings.pharmacist_supervision_note,
          emergency_notice_text: settings.emergency_notice_text,
          opening_hours: openingHours,
        }
      : undefined,
    branches: branchesRes.results || [],
  };
}

