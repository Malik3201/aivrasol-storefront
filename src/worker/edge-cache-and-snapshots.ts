/**
 * Multi-Pharmacy Free-Tier Scaling Engine:
 * 1. Tenant-Isolated Cloudflare Edge Cache (`caches.default`) wrapper
 * 2. Static R2 JSON Catalog Snapshots (`snapshots/{storefront_id}/catalog-v{ver}.json`)
 * 3. Direct R2 CDN Public Media URL resolution + Edge-Cached shared media serving
 *
 * Guarantees ZERO cross-tenant leakage (every cache key includes hostname + storefrontId + configVersion)
 * and keeps 100+ live pharmacies well inside Cloudflare's $0/month Free Tier!
 */

import type { D1Database, StorefrontWorkerEnv, WorkerExecutionContext } from "./env";
import type { PublicStorefrontProduct, StorefrontCategoryRecord, StorefrontRecord } from "../shared/types";
import { invalidateTenantBundleCache } from "./domain-resolver";
import {
  buildPublicSnapshotViewFromCatalogDoc,
  invalidateCatalogMemCache,
  loadStorefrontCatalogDoc,
} from "./r2-catalog-store";

export interface StorefrontCatalogSnapshot {
  version: number;
  central_index_version?: number;
  storefront_id: string;
  pharmacy_id: string;
  generated_at: string;
  last_sync_at: string | null;
  categories: StorefrontCategoryRecord[];
  products: Array<Record<string, unknown>>;
}

// Per-isolate tiny in-memory category metadata cache (avoids querying storefront_categories on every visit)
const CATEGORY_META_TTL_MS = 60_000;
const categoryMetaCache = new Map<
  string,
  { expiresAt: number; categories: StorefrontCategoryRecord[] }
>();

export function invalidateCategoryMetaCache(storefrontId: string): void {
  categoryMetaCache.delete(storefrontId);
}

async function getCategoryMetaCached(
  db: D1Database,
  storefrontId: string,
  pharmacyId: string
): Promise<StorefrontCategoryRecord[]> {
  const now = Date.now();
  const hit = categoryMetaCache.get(storefrontId);
  if (hit && hit.expiresAt > now) {
    return hit.categories;
  }
  const res = await db
    .prepare(
      `SELECT id, storefront_id, pharmacy_id, slug, name, description, icon_name,
              image_url, sort_order, is_visible, published_product_count
       FROM storefront_categories
       WHERE storefront_id = ? AND pharmacy_id = ?
       ORDER BY sort_order ASC, name ASC`
    )
    .bind(storefrontId, pharmacyId)
    .all<StorefrontCategoryRecord>()
    .catch(() => ({ results: [] as StorefrontCategoryRecord[] }));

  const categories = res.results || [];
  if (categoryMetaCache.size > 60 && !categoryMetaCache.has(storefrontId)) {
    const firstKey = categoryMetaCache.keys().next().value;
    if (firstKey) categoryMetaCache.delete(firstKey);
  }
  categoryMetaCache.set(storefrontId, {
    expiresAt: now + CATEGORY_META_TTL_MS,
    categories,
  });
  return categories;
}

function getDefaultEdgeCache(): Cache | null {
  try {
    const c = (globalThis as any).caches?.default;
    return c && typeof c.match === "function" && typeof c.put === "function" ? (c as Cache) : null;
  } catch {
    return null;
  }
}

/**
 * Builds a strict tenant-scoped synthetic cache key Request so Cloudflare Edge Cache
 * can NEVER collide responses across pharmacy hostnames or stale config versions.
 *
 * NOTE: the global central image index version is intentionally NOT part of the key any more —
 * it changed for every pharmacy whenever any central image was uploaded, wiping every tenant's
 * edge cache at once. Central image changes that affect a pharmacy bump that pharmacy's
 * `config_version` (see central-image-service), which rotates its keys precisely.
 * `centralIndexVersion` is still accepted for backward compatibility but ignored.
 */
export function buildTenantEdgeCacheKey(
  req: Request,
  tenantScope: {
    storefrontId: string;
    configVersion: number;
    hostname: string;
    centralIndexVersion?: number;
  }
): Request {
  const url = new URL(req.url);
  url.searchParams.set("__sf", tenantScope.storefrontId);
  url.searchParams.set("__v", String(tenantScope.configVersion || 1));
  url.searchParams.set("__h", tenantScope.hostname || "default");
  url.searchParams.set("__rk", "img2");
  return new Request(url.toString(), { method: "GET" });
}

export async function getEdgeCachedResponse(cacheKey: Request): Promise<Response | null> {
  const cache = getDefaultEdgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheKey);
    if (!hit) return null;
    const clonedHeaders = new Headers(hit.headers);
    clonedHeaders.set("X-Storefront-Edge-Cache", "HIT");
    return new Response(hit.body, { status: hit.status, headers: clonedHeaders });
  } catch {
    return null;
  }
}

export function putEdgeCachedResponse(
  cacheKey: Request,
  response: Response,
  execCtx?: WorkerExecutionContext,
  edgeTtlSec?: number
): void {
  const cache = getDefaultEdgeCache();
  if (!cache || response.status !== 200) return;
  try {
    let toStore = response.clone();
    if (edgeTtlSec && edgeTtlSec > 0) {
      // Store with an explicit edge TTL (Cache API honours Cache-Control on the stored copy),
      // independent of the browser-facing Cache-Control on the live response.
      const storeHeaders = new Headers(toStore.headers);
      storeHeaders.set("Cache-Control", `public, max-age=${Math.round(edgeTtlSec)}`);
      toStore = new Response(toStore.body, { status: toStore.status, headers: storeHeaders });
    }
    const putPromise = cache.put(cacheKey, toStore).catch(() => {});
    if (execCtx && typeof execCtx.waitUntil === "function") {
      execCtx.waitUntil(putPromise);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Resolves the optimal public URL for a shared verified media object.
 * If `PUBLIC_MEDIA_BASE_URL` (R2 Custom Domain) is configured, serves straight from R2 CDN (0 Worker/D1 hits).
 * Otherwise returns the Worker Edge-Cached media endpoint `/api/v1/public/media/{mediaId}`.
 */
export function resolveSharedMediaPublicUrl(
  env: StorefrontWorkerEnv,
  mediaId: string,
  r2Key: string
): string {
  const customBase = (env.PUBLIC_MEDIA_BASE_URL || "").trim().replace(/\/+$/, "");
  if (customBase && r2Key) {
    return `${customBase}/${r2Key.replace(/^\/+/, "")}`;
  }
  return `/api/v1/public/media/${mediaId}`;
}

/**
 * Atomically bumps `storefronts.config_version` so Edge Cache & R2 Snapshot keys rotate immediately.
 */
export async function bumpStorefrontConfigVersion(
  db: D1Database,
  storefrontId: string
): Promise<number> {
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `UPDATE storefronts
       SET config_version = COALESCE(config_version, 1) + 1, updated_at = ?
       WHERE id = ?`
    )
    .bind(nowIso, storefrontId)
    .run();

  const row = await db
    .prepare(`SELECT config_version FROM storefronts WHERE id = ? LIMIT 1`)
    .bind(storefrontId)
    .first<{ config_version: number }>();

  const nextVersion = Number(row?.config_version || 1);
  // Evict stale isolate caches for this storefront immediately
  invalidateCatalogMemCache(storefrontId);
  invalidateCategoryMetaCache(storefrontId);
  invalidateTenantBundleCache(storefrontId);
  return nextVersion;
}

export function getCatalogSnapshotR2Key(storefrontId: string, configVersion: number): string {
  return `snapshots/${storefrontId}/catalog-v${configVersion || 1}.json`;
}

/**
 * Refreshes the in-memory & R2-First catalog snapshot for a storefront (ZERO D1 product scans!).
 */
export async function buildAndSaveCatalogSnapshot(
  env: StorefrontWorkerEnv,
  sf: Pick<StorefrontRecord, "id" | "pharmacy_id" | "config_version" | "last_sync_at">
): Promise<StorefrontCatalogSnapshot> {
  const { doc, centralIndexVersion } = await loadStorefrontCatalogDoc(env, sf.id, sf.pharmacy_id, {
    freshFromR2: true,
    hydrateCentralImages: true,
  });
  const catMeta = await getCategoryMetaCached(env.DB, sf.id, sf.pharmacy_id);
  const view = buildPublicSnapshotViewFromCatalogDoc(doc, sf, catMeta);
  return {
    ...view,
    central_index_version: centralIndexVersion,
  };
}

/**
 * Loads the tenant's public catalog snapshot directly from the R2-First authoritative catalog:
 * 1. Isolate Memory Cache (0ms, 0 D1, 0 R2)
 * 2. Cloudflare R2 `storefront-catalogs/{sfId}/live.json` (~12ms, 0 D1)
 * 3. Seamless 1-time D1 migration on very first access for legacy storefronts!
 */
export async function getCatalogSnapshotForTenant(
  env: StorefrontWorkerEnv,
  sf: Pick<StorefrontRecord, "id" | "pharmacy_id" | "config_version" | "last_sync_at">,
  execCtx?: WorkerExecutionContext
): Promise<{
  snapshot: StorefrontCatalogSnapshot;
  source: "isolate" | "r2" | "d1_built";
  centralIndexVersion: number;
}> {
  const [{ doc, source, centralIndexVersion }, catMeta] = await Promise.all([
    loadStorefrontCatalogDoc(env, sf.id, sf.pharmacy_id, {
      hydrateCentralImages: true,
      execCtx,
      expectedConfigVersion: Number(sf.config_version || 0),
    }),
    getCategoryMetaCached(env.DB, sf.id, sf.pharmacy_id),
  ]);

  const view = buildPublicSnapshotViewFromCatalogDoc(doc, sf, catMeta);
  const mappedSource: "isolate" | "r2" | "d1_built" =
    source === "isolate" ? "isolate" : source === "r2" || source === "empty" ? "r2" : "d1_built";

  return {
    snapshot: {
      ...view,
      central_index_version: centralIndexVersion,
    },
    source: mappedSource,
    centralIndexVersion,
  };
}

function hasRealProductImage(r: Record<string, unknown>): boolean {
  const url = typeof r.primary_image_url === "string" ? r.primary_image_url.trim() : "";
  return url.length > 0 && !/placeholder/i.test(url);
}

function startsWithLetter(name: unknown): boolean {
  return /^[A-Za-z]/.test(String(name || "").trim());
}

// ============================================================================
// Per-catalog-version memoized indexes (sorted orders + id/slug maps)
// Keyed by the memoized published-products array identity, which is stable for a catalog doc
// version (see getMemoizedPublishedProducts) — so sorts run once per version, not per request.
// ============================================================================

type SnapshotRow = Record<string, unknown>;

interface SnapshotIndexes {
  featured?: SnapshotRow[];
  nameAscImagesFirst?: SnapshotRow[];
  priceAsc?: SnapshotRow[];
  priceDesc?: SnapshotRow[];
  byId?: Map<string, SnapshotRow>;
  bySlug?: Map<string, SnapshotRow>;
  byPosId?: Map<string, SnapshotRow>;
}

const snapshotIndexMemo = new WeakMap<SnapshotRow[], SnapshotIndexes>();

function getSnapshotIndexes(products: SnapshotRow[]): SnapshotIndexes {
  let idx = snapshotIndexMemo.get(products);
  if (!idx) {
    idx = {};
    snapshotIndexMemo.set(products, idx);
  }
  return idx;
}

function rowPrice(r: SnapshotRow): number {
  return Number(r.override_price_pkr ?? r.public_selling_price_pkr ?? 0);
}

function getSortedRows(products: SnapshotRow[], sortBy: string, hasQuery: boolean): SnapshotRow[] {
  const idx = getSnapshotIndexes(products);
  if (sortBy === "price_asc") {
    if (!idx.priceAsc) {
      idx.priceAsc = [...products].sort(
        (a, b) => rowPrice(a) - rowPrice(b) || String(a.name || "").localeCompare(String(b.name || ""))
      );
    }
    return idx.priceAsc;
  }
  if (sortBy === "price_desc") {
    if (!idx.priceDesc) {
      idx.priceDesc = [...products].sort(
        (a, b) => rowPrice(b) - rowPrice(a) || String(a.name || "").localeCompare(String(b.name || ""))
      );
    }
    return idx.priceDesc;
  }
  if (sortBy === "name_asc") {
    // Strict alphabetical (catalog doc order) when searching; otherwise real-photo items first.
    if (hasQuery) return products;
    if (!idx.nameAscImagesFirst) {
      idx.nameAscImagesFirst = [...products].sort((a, b) => {
        const imgDiff = Number(hasRealProductImage(b)) - Number(hasRealProductImage(a));
        if (imgDiff !== 0) return imgDiff;
        const alphaDiff = Number(startsWithLetter(b.name)) - Number(startsWithLetter(a.name));
        if (alphaDiff !== 0) return alphaDiff;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
    }
    return idx.nameAscImagesFirst;
  }
  // Default "featured" merchandising order:
  // 1. Products WITH real verified/uploaded photos ALWAYS come first (never generic placeholder visuals!)
  // 2. In-stock products ahead of out-of-stock
  // 3. Explicitly featured / popular items
  // 4. Clean alphabetic medicine names ahead of numeric shorthand entries (e.g., 10 LAKH, 1CC, 3CC)
  // 5. Alphabetical A-Z
  if (!idx.featured) {
    idx.featured = [...products].sort((a, b) => {
      const imgDiff = Number(hasRealProductImage(b)) - Number(hasRealProductImage(a));
      if (imgDiff !== 0) return imgDiff;
      const stockDiff = Number(isRowInStock(b)) - Number(isRowInStock(a));
      if (stockDiff !== 0) return stockDiff;
      const fa = Number(b.is_featured || 0) - Number(a.is_featured || 0);
      if (fa !== 0) return fa;
      const pp = Number(b.is_popular || 0) - Number(a.is_popular || 0);
      if (pp !== 0) return pp;
      const alphaDiff = Number(startsWithLetter(b.name)) - Number(startsWithLetter(a.name));
      if (alphaDiff !== 0) return alphaDiff;
      return (
        String(a.name || "").localeCompare(String(b.name || "")) ||
        String(a.id || "").localeCompare(String(b.id || ""))
      );
    });
  }
  return idx.featured;
}

/**
 * O(1) product lookup by id, slug, or POS product id using memoized per-version maps.
 */
export function findProductInSnapshot(
  snapshot: Pick<StorefrontCatalogSnapshot, "products">,
  idOrSlug: string,
  options?: { includePosId?: boolean }
): SnapshotRow | undefined {
  const products = snapshot.products;
  const idx = getSnapshotIndexes(products);
  if (!idx.byId || !idx.bySlug || !idx.byPosId) {
    const byId = new Map<string, SnapshotRow>();
    const bySlug = new Map<string, SnapshotRow>();
    const byPosId = new Map<string, SnapshotRow>();
    for (const p of products) {
      const id = String(p.id || "");
      const slug = String(p.slug || "");
      const posId = String(p.pos_product_id || "");
      if (id && !byId.has(id)) byId.set(id, p);
      if (slug && !bySlug.has(slug)) bySlug.set(slug, p);
      if (posId && !byPosId.has(posId)) byPosId.set(posId, p);
    }
    idx.byId = byId;
    idx.bySlug = bySlug;
    idx.byPosId = byPosId;
  }
  const key = String(idOrSlug || "");
  if (!key) return undefined;
  // Preserve legacy precedence of `Array.find` over the doc order as closely as possible:
  // exact id first, then slug, then (optionally) POS product id.
  return (
    idx.byId.get(key) ||
    idx.bySlug.get(key) ||
    (options?.includePosId ? idx.byPosId.get(key) : undefined)
  );
}

/**
 * Helper to filter, sort, and cursor-paginate products directly from an R2 snapshot in memory.
 * Zero D1 reads per search/browse/category/pagination request! Sort orders are precomputed once
 * per catalog version; per-request work is a single linear filter pass that stops early once the
 * requested page (+1 look-ahead) is filled.
 */
export function queryProductsFromSnapshot(
  snapshot: StorefrontCatalogSnapshot,
  options: {
    q?: string;
    category?: string;
    featuredOnly?: boolean;
    popularOnly?: boolean;
    inStockOnly?: boolean;
    hasImageOnly?: boolean;
    hideOutOfStock?: boolean;
    sortBy?: string;
    cursor?: { sortValue: string; id: string } | null;
    limit: number;
  }
): { pageRows: Array<Record<string, unknown>>; hasMore: boolean; nextOffset: number | null } {
  const qLower = (options.q || "").trim().toLowerCase();
  const catLower = (options.category || "").trim().toLowerCase();
  const sortBy = options.sortBy || "featured";

  const matches = (r: SnapshotRow): boolean => {
    const avail = String(r.availability_status || "in_stock");
    if (options.hideOutOfStock || options.inStockOnly) {
      if (avail !== "in_stock" && avail !== "low_stock") return false;
    }
    if (options.hasImageOnly && !hasRealProductImage(r)) {
      return false;
    }
    if (catLower && String(r.category_name || "General Medicines").trim().toLowerCase() !== catLower) {
      return false;
    }
    if (options.featuredOnly && Number(r.is_featured || 0) !== 1) return false;
    if (options.popularOnly && Number(r.is_popular || 0) !== 1 && Number(r.is_featured || 0) !== 1) {
      return false;
    }
    if (qLower) {
      const hay =
        String(r.search_keywords || "") ||
        `${r.name || ""} ${r.generic_name || ""} ${r.brand_name || ""}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  };

  const sorted = getSortedRows(snapshot.products, sortBy, Boolean(qLower));

  // Offset cursor: skip `startIdx` matches; id cursor: start after the matching id.
  let offsetToSkip = 0;
  let afterId: string | null = null;
  if (options.cursor) {
    if (options.cursor.sortValue === "__offset__") {
      const parsed = parseInt(options.cursor.id, 10);
      if (Number.isFinite(parsed) && parsed > 0) offsetToSkip = parsed;
    } else {
      afterId = options.cursor.id;
    }
  }

  const limit = Math.max(0, options.limit);
  const pageRows: SnapshotRow[] = [];
  let matchIndex = 0; // index among filtered rows
  let startIdx = offsetToSkip;
  let foundAfterId = afterId === null;
  let hasMore = false;

  if (afterId !== null) {
    // Legacy id-cursor semantics: if the id is not present in the filtered list, start from 0.
    let idPos = -1;
    let i = 0;
    for (const r of sorted) {
      if (!matches(r)) continue;
      if (String(r.id || "") === afterId) {
        idPos = i;
        break;
      }
      i++;
    }
    startIdx = idPos >= 0 ? idPos + 1 : 0;
    foundAfterId = true;
  }

  if (foundAfterId) {
    for (const r of sorted) {
      if (!matches(r)) continue;
      if (matchIndex < startIdx) {
        matchIndex++;
        continue;
      }
      if (pageRows.length < limit) {
        pageRows.push(r);
        matchIndex++;
        continue;
      }
      hasMore = true;
      break;
    }
  }

  const nextOffset = hasMore ? startIdx + pageRows.length : null;
  return { pageRows, hasMore, nextOffset };
}

const GENERIC_PLACEHOLDERS = new Set([
  "",
  "0",
  "00",
  "000",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "null",
  "nil",
  "general",
  "other",
]);

export function cleanGenericSaltText(raw: unknown): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (GENERIC_PLACEHOLDERS.has(lower) || /^0+$/.test(lower)) return null;
  return trimmed;
}

export function extractGenericSaltTokens(genericText: string | null): string[] {
  if (!genericText) return [];
  const parts = genericText
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|iu|%|w\/v|w\/w)\b/g, " ")
    .split(/[+/,;|()]+/)
    .map((s) => s.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 4 && !GENERIC_PLACEHOLDERS.has(s));
  return Array.from(new Set(parts));
}

function isRowInStock(r: Record<string, unknown>): boolean {
  const avail = String(r.availability_status || "in_stock");
  return avail === "in_stock" || avail === "low_stock";
}

/**
 * Finds in-stock same-generic (same salt/composition) alternatives inside the tenant snapshot.
 * Zero D1 reads — runs in <2ms in Worker memory!
 */
export function findGenericAlternativesInSnapshot(
  snapshot: StorefrontCatalogSnapshot,
  genericSaltText: string | null,
  excludeIds: Set<string>,
  limit = 6
): Array<Record<string, unknown>> {
  const tokens = extractGenericSaltTokens(genericSaltText);
  if (tokens.length === 0) return [];

  const scored: Array<{ row: Record<string, unknown>; score: number }> = [];
  for (const r of snapshot.products) {
    const rid = String(r.id || "");
    if (excludeIds.has(rid)) continue;
    if (!isRowInStock(r)) continue;
    const rowGeneric = cleanGenericSaltText(r.generic_name);
    if (!rowGeneric) continue;
    const rowLower = rowGeneric.toLowerCase();

    let hits = 0;
    for (const tok of tokens) {
      if (rowLower.includes(tok)) hits++;
    }
    if (hits === 0) continue;

    // Prefer exact full-formula overlap first, then featured/popular, then lower price
    const score = hits * 100 + (Number(r.is_featured || 0) ? 10 : 0) + (Number(r.is_popular || 0) ? 5 : 0);
    scored.push({ row: r, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = Number(a.row.override_price_pkr ?? a.row.public_selling_price_pkr ?? 0);
    const pb = Number(b.row.override_price_pkr ?? b.row.public_selling_price_pkr ?? 0);
    return pa - pb || String(a.row.name || "").localeCompare(String(b.row.name || ""));
  });

  return scored.slice(0, limit).map((s) => s.row);
}

/**
 * High-speed ranked autocomplete suggestions + automatic generic-salt alternatives
 * when a searched medicine is out of stock or unavailable.
 */
export function suggestProductsFromSnapshot(
  snapshot: StorefrontCatalogSnapshot,
  options: {
    q: string;
    limit?: number;
    altLimit?: number;
    hideOutOfStock?: boolean;
  }
): {
  suggestions: Array<Record<string, unknown>>;
  alternatives: Array<Record<string, unknown>>;
  matchedGeneric: string | null;
  matchedUnavailableName: string | null;
  alternativeReason: "out_of_stock_match" | "same_generic" | null;
  totalMatches: number;
} {
  const qLower = (options.q || "").trim().toLowerCase();
  const limit = Math.min(12, Math.max(1, options.limit || 6));
  const altLimit = Math.min(8, Math.max(1, options.altLimit || 4));
  if (qLower.length < 2) {
    return {
      suggestions: [],
      alternatives: [],
      matchedGeneric: null,
      matchedUnavailableName: null,
      alternativeReason: null,
      totalMatches: 0,
    };
  }

  const qTokens = qLower.split(/\s+/).filter((t) => t.length >= 2);
  const scored: Array<{ row: Record<string, unknown>; score: number }> = [];
  const outOfStockMatches: Array<Record<string, unknown>> = [];

  for (const r of snapshot.products) {
    const name = String(r.name || "").toLowerCase();
    const generic = String(r.generic_name || "").toLowerCase();
    const brand = String(r.brand_name || "").toLowerCase();
    const strength = String(r.strength || "").toLowerCase();
    const sku = String(r.sku_code || "").toLowerCase();
    const hay = String(r.search_keywords || "").toLowerCase() || `${name} ${generic} ${brand} ${strength} ${sku}`;

    let score = 0;
    if (name === qLower) score = 120;
    else if (name.startsWith(qLower)) score = 100;
    else if (name.includes(` ${qLower}`)) score = 85;
    else if (name.includes(qLower)) score = 70;
    else if (generic.startsWith(qLower)) score = 65;
    else if (generic.includes(qLower)) score = 55;
    else if (brand.includes(qLower) || sku.includes(qLower)) score = 40;
    else if (qTokens.length > 1 && qTokens.every((t) => hay.includes(t))) score = 45;

    if (score === 0) continue;

    const inStock = isRowInStock(r);
    if (!inStock) {
      outOfStockMatches.push(r);
      if (options.hideOutOfStock) continue;
    } else {
      score += 8;
    }
    if (Number(r.is_featured || 0) === 1) score += 3;

    scored.push({ row: r, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.row.name || "").localeCompare(String(b.row.name || ""))
  );

  const suggestions = scored.slice(0, limit).map((s) => s.row);
  const inStockSuggestionCount = suggestions.filter(isRowInStock).length;

  let alternatives: Array<Record<string, unknown>> = [];
  let matchedGeneric: string | null = null;
  let matchedUnavailableName: string | null = null;
  let alternativeReason: "out_of_stock_match" | "same_generic" | null = null;

  // Priority 1: Top matched medicine is out-of-stock -> suggest in-stock generic alternatives!
  const firstOutMatch =
    suggestions.find((r) => !isRowInStock(r) && cleanGenericSaltText(r.generic_name)) ||
    outOfStockMatches.find((r) => cleanGenericSaltText(r.generic_name));

  if (firstOutMatch) {
    const salt = cleanGenericSaltText(firstOutMatch.generic_name);
    if (salt) {
      const excludeIds = new Set<string>(suggestions.map((s) => String(s.id || "")));
      const found = findGenericAlternativesInSnapshot(snapshot, salt, excludeIds, altLimit);
      if (found.length > 0) {
        alternatives = found;
        matchedGeneric = salt;
        matchedUnavailableName = String(firstOutMatch.name || "");
        alternativeReason = "out_of_stock_match";
      }
    }
  } else if (inStockSuggestionCount <= 2 && suggestions.length > 0) {
    // Priority 2: Few results — offer helpful same-generic options
    const firstWithSalt = suggestions.find((r) => cleanGenericSaltText(r.generic_name));
    const salt = firstWithSalt ? cleanGenericSaltText(firstWithSalt.generic_name) : null;
    if (salt) {
      const excludeIds = new Set<string>(suggestions.map((s) => String(s.id || "")));
      const found = findGenericAlternativesInSnapshot(snapshot, salt, excludeIds, altLimit);
      if (found.length > 0) {
        alternatives = found;
        matchedGeneric = salt;
        alternativeReason = "same_generic";
      }
    }
  }

  return {
    suggestions,
    alternatives,
    matchedGeneric,
    matchedUnavailableName,
    alternativeReason,
    totalMatches: scored.length,
  };
}

export type _UnusedPublicProductImport = PublicStorefrontProduct;
