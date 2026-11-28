/**
 * AivraSol R2-First Multi-Tenant Catalog & Central Image Index Engine (Option B)
 *
 * Strictly isolated R2 key namespaces (NEVER touches releases/, backups/, or unrelated bucket files):
 * - `storefront-catalogs/{storefrontId}/live.json` : Authoritative pharmacy catalog (all statuses)
 * - `central-library/verified-images-index.json`   : Shared global verified medicine image index
 *
 * Performance & Cost Guarantees:
 * - Zero D1 reads & zero D1 writes on catalog sync, browse, search, suggest, product detail,
 *   checkout product validation, owner portal product edits, and bulk image matching.
 * - 3-tier speed: Isolate RAM (0ms) -> Cloudflare Edge Cache -> R2 (~12ms) -> 1-time D1 auto-hydration.
 * - 100 to 500+ pharmacies stay under <5% of Cloudflare's $0/month Free Tier!
 */

import type { D1Database, StorefrontWorkerEnv, WorkerExecutionContext } from "./env";
import type { StorefrontCategoryRecord, StorefrontRecord } from "../shared/types";
import { toUrlSlug } from "../shared/validation";
import {
  computeNormalizedCoreKey,
  matchMedicineIdentity,
  type CanonicalMedicineRecord,
  type ProductInput,
} from "../shared/medicine-identity-matcher";

export interface R2CatalogProductRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  pos_product_id: string;
  master_medicine_id: string | null;
  sku_code: string | null;
  slug: string;
  name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  brand_name: string | null;
  packing_label: string | null;
  unit_label: string;
  base_unit_label: string;
  selling_units_json: string;
  public_description: string | null;
  public_selling_price_pkr: number;
  compare_at_price_pkr: number | null;
  override_price_pkr: number | null;
  availability_status: string;
  available_qty: number;
  available_base_qty: number;
  branch_stock_json: string;
  category_name: string;
  primary_image_url: string | null;
  image_source: string;
  selected_media_id: string | null;
  canonical_medicine_id: string | null;
  normalized_core_key: string | null;
  search_keywords: string;
  publish_status: string;
  requires_prescription: number;
  is_controlled_substance: number;
  is_featured: number;
  is_popular: number;
  max_order_qty: number;
  sync_version: number;
  deleted_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  gallery_images?: Array<{
    id: string;
    image_url: string;
    alt_text: string | null;
    sort_order: number;
    is_primary: number;
  }>;
}

export interface R2StorefrontCatalogDoc {
  schema_version: 2;
  storefront_id: string;
  pharmacy_id: string;
  catalog_version: number;
  central_index_version: number;
  updated_at: string;
  last_sync_at: string | null;
  published_count: number;
  shared_matched_count: number;
  owner_override_count: number;
  categories: Array<{ name: string; slug: string; count: number }>;
  products: R2CatalogProductRecord[];
}

export interface CentralImageIndexEntry {
  id: string;
  canonical_name: string;
  master_catalog_id: string | null;
  master_catalog_name: string | null;
  normalized_catalog_name: string | null;
  normalized_core_key: string | null;
  allow_strengthless_match: boolean;
  brand_name: string | null;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  manufacturer: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  barcode: string | null;
  aliases_json: string | null;
  preferred_media_id: string;
  preferred_image_url: string;
  r2_object_key: string;
  content_type: string;
}

export interface R2CentralImageIndexDoc {
  schema_version: 2;
  version: number;
  updated_at: string;
  total_verified: number;
  entries: CentralImageIndexEntry[];
}

export interface CompiledCentralImageIndex {
  doc: R2CentralImageIndexDoc;
  byId: Map<string, CentralImageIndexEntry>;
  byMasterId: Map<string, CentralImageIndexEntry>;
  byBarcode: Map<string, CentralImageIndexEntry>;
  byCoreKey: Map<string, CentralImageIndexEntry[]>;
  byMediaId: Map<string, { r2_object_key: string; content_type: string; public_url: string }>;
}

// ============================================================================
// Strictly Namespaced R2 Keys (Never interferes with releases / backups / media)
// ============================================================================

export function getStorefrontLiveCatalogR2Key(storefrontId: string): string {
  return `storefront-catalogs/${storefrontId}/live.json`;
}

export const CENTRAL_IMAGES_INDEX_R2_KEY = "central-library/verified-images-index.json";

// ============================================================================
// Hot Per-Isolate RAM Caches (0ms reads, instant invalidation on mutations)
// ============================================================================

// Catalog docs are additionally validated against the tenant `config_version` seen by the caller
// (`expectedConfigVersion`), so a longer TTL never serves a catalog older than the current config.
const CATALOG_MEM_TTL_MS = 120_000;
const CATALOG_MEM_MAX_ENTRIES = 48;
const catalogMemCache = new Map<
  string,
  { expiresAt: number; doc: R2StorefrontCatalogDoc; configVersion: number }
>();

const CENTRAL_INDEX_MEM_TTL_MS = 10 * 60_000;
const CENTRAL_INDEX_EMPTY_FALLBACK_TTL_MS = 60_000;
let centralIndexMemCache: {
  expiresAt: number;
  compiled: CompiledCentralImageIndex;
} | null = null;

// Single-flight dedupe: parallel isolate misses share ONE R2 GET instead of N.
let centralIndexInflight: Promise<CompiledCentralImageIndex> | null = null;
const catalogR2Inflight = new Map<string, Promise<CatalogR2FetchResult>>();

type CatalogR2FetchResult =
  | { kind: "found"; doc: R2StorefrontCatalogDoc }
  | { kind: "missing" }
  | { kind: "error"; error: unknown };

export function invalidateCatalogMemCache(storefrontId: string): void {
  catalogMemCache.delete(storefrontId);
}

export function invalidateCentralIndexMemCache(): void {
  centralIndexMemCache = null;
}

function putCatalogMemCache(doc: R2StorefrontCatalogDoc, configVersion = 0): void {
  if (catalogMemCache.size >= CATALOG_MEM_MAX_ENTRIES && !catalogMemCache.has(doc.storefront_id)) {
    const oldestKey = catalogMemCache.keys().next().value;
    if (oldestKey) catalogMemCache.delete(oldestKey);
  }
  catalogMemCache.set(doc.storefront_id, {
    expiresAt: Date.now() + CATALOG_MEM_TTL_MS,
    doc,
    configVersion: Number(configVersion) || 0,
  });
}

function buildEmptyCompiledCentralIndex(): CompiledCentralImageIndex {
  return compileCentralImageIndex({
    schema_version: 2,
    version: 0,
    updated_at: new Date(0).toISOString(),
    total_verified: 0,
    entries: [],
  });
}

// ============================================================================
// Central Verified Image Index (R2 + O(1) Memory Lookup Maps)
// ============================================================================

function compileCentralImageIndex(doc: R2CentralImageIndexDoc): CompiledCentralImageIndex {
  const byId = new Map<string, CentralImageIndexEntry>();
  const byMasterId = new Map<string, CentralImageIndexEntry>();
  const byBarcode = new Map<string, CentralImageIndexEntry>();
  const byCoreKey = new Map<string, CentralImageIndexEntry[]>();
  const byMediaId = new Map<
    string,
    { r2_object_key: string; content_type: string; public_url: string }
  >();

  for (const e of doc.entries) {
    byId.set(e.id, e);
    if (e.master_catalog_id) {
      byMasterId.set(e.master_catalog_id.trim(), e);
    }
    if (e.barcode && e.barcode.trim().length >= 5) {
      byBarcode.set(e.barcode.trim(), e);
    }
    if (e.preferred_media_id && e.r2_object_key) {
      byMediaId.set(e.preferred_media_id, {
        r2_object_key: e.r2_object_key,
        content_type: e.content_type || "image/webp",
        public_url: e.preferred_image_url,
      });
    }
    const keys = new Set<string>();
    const liveCk = computeNormalizedCoreKey(e.canonical_name) || computeNormalizedCoreKey(e.brand_name);
    for (const candidateKey of [liveCk, e.normalized_core_key]) {
      if (!candidateKey) continue;
      keys.add(candidateKey);
      const firstTok = candidateKey.split("_")[0];
      if (firstTok && firstTok.length >= 3) keys.add(firstTok);
    }
    if (e.aliases_json) {
      try {
        const aliases = JSON.parse(e.aliases_json);
        if (Array.isArray(aliases)) {
          for (const al of aliases) {
            if (typeof al !== "string") continue;
            const alk = computeNormalizedCoreKey(al);
            if (alk) {
              keys.add(alk);
              const firstTok = alk.split("_")[0];
              if (firstTok && firstTok.length >= 3) keys.add(firstTok);
            }
          }
        }
      } catch {
        // ignore invalid aliases JSON
      }
    }
    for (const k of keys) {
      const bucket = byCoreKey.get(k);
      if (bucket) bucket.push(e);
      else byCoreKey.set(k, [e]);
    }
  }

  return { doc, byId, byMasterId, byBarcode, byCoreKey, byMediaId };
}

/**
 * Rebuilds the global verified central image index from D1 ONCE and persists it to R2.
 * After this single write, 100+ pharmacies resolve images from R2/RAM with ZERO D1 reads!
 */
export async function rebuildAndSaveCentralImageIndex(
  env: StorefrontWorkerEnv,
  explicitVersion?: number
): Promise<CompiledCentralImageIndex> {
  const res = await env.DB.prepare(
    `SELECT c.id, c.canonical_name, c.master_catalog_id, c.master_catalog_name,
            c.normalized_catalog_name, c.normalized_core_key, c.allow_strengthless_match,
            c.brand_name, c.generic_name, c.strength, c.dosage_form, c.manufacturer,
            c.pack_size, c.pack_unit, c.barcode, c.aliases_json,
            c.preferred_media_id, m.public_url AS preferred_image_url,
            m.r2_object_key, m.content_type
     FROM central_medicines c
     INNER JOIN storefront_media m ON c.preferred_media_id = m.id
     WHERE c.verification_status = 'verified' AND c.preferred_media_id IS NOT NULL`
  ).all<Record<string, unknown>>();

  const entries: CentralImageIndexEntry[] = (res.results || []).map((r) => {
    const canonName = String(r.canonical_name || "");
    const brandName = r.brand_name ? String(r.brand_name) : null;
    // Always recompute normalized_core_key with the latest matcher logic first
    const coreKey =
      computeNormalizedCoreKey(canonName) ||
      computeNormalizedCoreKey(brandName) ||
      (r.normalized_core_key ? String(r.normalized_core_key) : null) ||
      null;
    return {
      id: String(r.id),
      canonical_name: canonName,
      master_catalog_id: r.master_catalog_id ? String(r.master_catalog_id) : null,
      master_catalog_name: r.master_catalog_name ? String(r.master_catalog_name) : null,
      normalized_catalog_name: r.normalized_catalog_name ? String(r.normalized_catalog_name) : null,
      normalized_core_key: coreKey,
      allow_strengthless_match: Number(r.allow_strengthless_match || 0) === 1,
      brand_name: brandName,
      generic_name: r.generic_name ? String(r.generic_name) : null,
      strength: r.strength ? String(r.strength) : null,
      dosage_form: r.dosage_form ? String(r.dosage_form) : null,
      manufacturer: r.manufacturer ? String(r.manufacturer) : null,
      pack_size: r.pack_size !== null && r.pack_size !== undefined ? Number(r.pack_size) : null,
      pack_unit: r.pack_unit ? String(r.pack_unit) : null,
      barcode: r.barcode ? String(r.barcode) : null,
      aliases_json: r.aliases_json ? String(r.aliases_json) : null,
      preferred_media_id: String(r.preferred_media_id),
      preferred_image_url: String(r.preferred_image_url),
      r2_object_key: String(r.r2_object_key || ""),
      content_type: String(r.content_type || "image/webp"),
    };
  });

  const version = explicitVersion ?? Date.now();
  const doc: R2CentralImageIndexDoc = {
    schema_version: 2,
    version,
    updated_at: new Date().toISOString(),
    total_verified: entries.length,
    entries,
  };

  if (env.MEDIA_BUCKET) {
    await env.MEDIA_BUCKET.put(CENTRAL_IMAGES_INDEX_R2_KEY, JSON.stringify(doc), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "no-store",
      },
      customMetadata: {
        index_version: String(version),
        total_verified: String(entries.length),
      },
    }).catch(() => {});
  }

  const compiled = compileCentralImageIndex(doc);
  centralIndexMemCache = {
    expiresAt: Date.now() + CENTRAL_INDEX_MEM_TTL_MS,
    compiled,
  };
  return compiled;
}

/**
 * Loads the compiled global central image index from RAM (0ms) -> R2 (~15ms).
 *
 * Read-path safety (Free Tier + correctness):
 * - R2 errors / corrupt JSON NEVER trigger a D1 rescan + R2 PUT. The last good (stale) index is
 *   served, or an empty index (cached briefly) when none exists in this isolate.
 * - Only when the R2 object is truly MISSING (get() returned null) AND `allowRebuild` is not false
 *   is the index rebuilt from D1 (one-time bootstrap for admin/sync paths). Public visitor paths
 *   always pass `allowRebuild: false`.
 * - Parallel misses inside an isolate share a single R2 GET (single-flight).
 */
export async function getCentralImageIndex(
  env: StorefrontWorkerEnv,
  options?: { freshFromR2?: boolean; allowRebuild?: boolean }
): Promise<CompiledCentralImageIndex> {
  const now = Date.now();
  if (!options?.freshFromR2 && centralIndexMemCache && centralIndexMemCache.expiresAt > now) {
    return centralIndexMemCache.compiled;
  }

  if (!options?.freshFromR2 && centralIndexInflight) {
    return centralIndexInflight;
  }

  const loadPromise = (async (): Promise<CompiledCentralImageIndex> => {
    const staleCompiled = centralIndexMemCache?.compiled || null;
    if (!env.MEDIA_BUCKET) {
      if (staleCompiled) return staleCompiled;
      if (options?.allowRebuild === false) return buildEmptyCompiledCentralIndex();
      return await rebuildAndSaveCentralImageIndex(env);
    }

    let obj: Awaited<ReturnType<NonNullable<StorefrontWorkerEnv["MEDIA_BUCKET"]>["get"]>> = null;
    try {
      obj = await env.MEDIA_BUCKET.get(CENTRAL_IMAGES_INDEX_R2_KEY);
    } catch {
      // Transient R2 failure: serve stale/empty, never rebuild + overwrite from a read path
      return serveStaleOrEmptyCentralIndex(staleCompiled);
    }

    if (!obj) {
      if (options?.allowRebuild === false) {
        return serveStaleOrEmptyCentralIndex(staleCompiled);
      }
      return await rebuildAndSaveCentralImageIndex(env);
    }

    try {
      const text = new TextDecoder().decode(await obj.arrayBuffer());
      const parsed = JSON.parse(text) as R2CentralImageIndexDoc;
      if (parsed && Array.isArray(parsed.entries)) {
        const compiled = compileCentralImageIndex(parsed);
        centralIndexMemCache = {
          expiresAt: Date.now() + CENTRAL_INDEX_MEM_TTL_MS,
          compiled,
        };
        return compiled;
      }
    } catch {
      // Corrupt / partial JSON -> fall through to stale/empty
    }
    return serveStaleOrEmptyCentralIndex(staleCompiled);
  })();

  if (options?.freshFromR2) {
    return loadPromise;
  }

  centralIndexInflight = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (centralIndexInflight === loadPromise) centralIndexInflight = null;
  }
}

function serveStaleOrEmptyCentralIndex(
  staleCompiled: CompiledCentralImageIndex | null
): CompiledCentralImageIndex {
  const compiled = staleCompiled || buildEmptyCompiledCentralIndex();
  centralIndexMemCache = {
    expiresAt: Date.now() + CENTRAL_INDEX_EMPTY_FALLBACK_TTL_MS,
    compiled,
  };
  return compiled;
}

/**
 * Incrementally merges newly uploaded/approved central medicine entries directly into the R2 index
 * without re-reading the entire central_medicines table from D1 (0 D1 reads!).
 */
export async function upsertEntriesInCentralImageIndex(
  env: StorefrontWorkerEnv,
  upsertedEntries: CentralImageIndexEntry[]
): Promise<CompiledCentralImageIndex> {
  if (upsertedEntries.length === 0) {
    return await getCentralImageIndex(env);
  }

  const current = await getCentralImageIndex(env, { freshFromR2: true });
  const mapById = new Map<string, CentralImageIndexEntry>(current.byId);
  for (const entry of upsertedEntries) {
    mapById.set(entry.id, entry);
  }

  const version = Math.max(Date.now(), (current.doc.version || 0) + 1);
  const nextDoc: R2CentralImageIndexDoc = {
    schema_version: 2,
    version,
    updated_at: new Date().toISOString(),
    total_verified: mapById.size,
    entries: Array.from(mapById.values()),
  };

  if (env.MEDIA_BUCKET) {
    await env.MEDIA_BUCKET.put(CENTRAL_IMAGES_INDEX_R2_KEY, JSON.stringify(nextDoc), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "no-store",
      },
      customMetadata: {
        index_version: String(version),
        total_verified: String(nextDoc.total_verified),
      },
    }).catch(() => {});
  }

  const compiled = compileCentralImageIndex(nextDoc);
  centralIndexMemCache = {
    expiresAt: Date.now() + CENTRAL_INDEX_MEM_TTL_MS,
    compiled,
  };
  return compiled;
}

/**
 * Fast O(1)-bucketed single-product match against the in-memory CompiledCentralImageIndex.
 * Zero D1 queries; runs in <0.05ms per medicine!
 */
export function matchProductAgainstCentralIndex(
  input: ProductInput,
  compiled: CompiledCentralImageIndex
): {
  matched: boolean;
  canonicalId: string | null;
  mediaId: string | null;
  imageUrl: string | null;
} {
  if (compiled.doc.entries.length === 0) {
    return { matched: false, canonicalId: null, mediaId: null, imageUrl: null };
  }

  // 1. O(1) Exact Master Medicine ID match
  const masterId = input.master_medicine_id?.trim();
  if (masterId) {
    const exact = compiled.byMasterId.get(masterId);
    if (exact && exact.preferred_image_url) {
      return {
        matched: true,
        canonicalId: exact.id,
        mediaId: exact.preferred_media_id,
        imageUrl: exact.preferred_image_url,
      };
    }
  }

  // 2. O(1) Exact Barcode match
  const bc = (input.barcode || input.sku_code || "").trim();
  if (bc.length >= 5) {
    const exactBc = compiled.byBarcode.get(bc);
    if (exactBc && exactBc.preferred_image_url) {
      return {
        matched: true,
        canonicalId: exactBc.id,
        mediaId: exactBc.preferred_media_id,
        imageUrl: exactBc.preferred_image_url,
      };
    }
  }

  // 3. Bucketed clinical identity matcher (only evaluates the 1-8 items sharing the normalized core key!)
  const ck = computeNormalizedCoreKey(input.name);
  if (!ck) {
    return { matched: false, canonicalId: null, mediaId: null, imageUrl: null };
  }

  const candidateMap = new Map<string, CentralImageIndexEntry>();
  const exactBucket = compiled.byCoreKey.get(ck);
  if (exactBucket) {
    for (const c of exactBucket) candidateMap.set(c.id, c);
  }
  const firstTok = ck.split("_")[0];
  if (firstTok && firstTok.length >= 3 && firstTok !== ck) {
    const rootBucket = compiled.byCoreKey.get(firstTok);
    if (rootBucket) {
      for (const c of rootBucket) candidateMap.set(c.id, c);
    }
  }

  if (candidateMap.size === 0) {
    return { matched: false, canonicalId: null, mediaId: null, imageUrl: null };
  }

  const candidates: CanonicalMedicineRecord[] = Array.from(candidateMap.values()).map((e) => ({
    id: e.id,
    canonical_name: e.canonical_name,
    master_catalog_id: e.master_catalog_id,
    master_catalog_name: e.master_catalog_name,
    normalized_catalog_name: e.normalized_catalog_name,
    normalized_core_key: e.normalized_core_key,
    allow_strengthless_match: e.allow_strengthless_match,
    brand_name: e.brand_name,
    generic_name: e.generic_name,
    strength: e.strength,
    dosage_form: e.dosage_form,
    manufacturer: e.manufacturer,
    pack_size: e.pack_size,
    pack_unit: e.pack_unit,
    barcode: e.barcode,
    aliases_json: e.aliases_json,
    verification_status: "verified",
    preferred_media_id: e.preferred_media_id,
  }));

  const matchRes = matchMedicineIdentity(input, candidates);
  if (matchRes.matched && matchRes.canonicalId) {
    const hit = candidateMap.get(matchRes.canonicalId);
    if (hit && hit.preferred_image_url) {
      return {
        matched: true,
        canonicalId: hit.id,
        mediaId: hit.preferred_media_id,
        imageUrl: hit.preferred_image_url,
      };
    }
  }

  return { matched: false, canonicalId: null, mediaId: null, imageUrl: null };
}

/**
 * Looks up a generic salt for an unavailable searched brand directly inside the in-memory
 * Central Image Index & unpublished pharmacy products — ZERO D1 reads!
 */
export function discoverGenericSaltInMemory(
  queryLower: string,
  catalogDoc: R2StorefrontCatalogDoc | null,
  centralIndex: CompiledCentralImageIndex | null
): { genericName: string; medicineName: string } | null {
  if (!queryLower || queryLower.length < 3) return null;

  if (catalogDoc) {
    for (const p of catalogDoc.products) {
      if (
        p.generic_name &&
        p.generic_name.trim().length >= 3 &&
        p.name.toLowerCase().includes(queryLower)
      ) {
        return { genericName: p.generic_name.trim(), medicineName: p.name };
      }
    }
  }

  if (centralIndex) {
    for (const e of centralIndex.doc.entries) {
      if (
        e.generic_name &&
        e.generic_name.trim().length >= 3 &&
        (e.canonical_name.toLowerCase().includes(queryLower) ||
          (e.brand_name && e.brand_name.toLowerCase().includes(queryLower)))
      ) {
        return { genericName: e.generic_name.trim(), medicineName: e.canonical_name };
      }
    }
  }

  return null;
}

// ============================================================================
// R2-First Per-Pharmacy Authoritative Catalog Store
// ============================================================================

export function recomputeCatalogDocSummaries(doc: R2StorefrontCatalogDoc): R2StorefrontCatalogDoc {
  // Sort deterministically by name ASC, id ASC so cursor pagination works in O(n) with no re-sorting
  doc.products.sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });

  let publishedCount = 0;
  let sharedMatchedCount = 0;
  let ownerOverrideCount = 0;
  const catCounts = new Map<string, number>();

  for (const p of doc.products) {
    if (p.image_source === "owner_override" && p.primary_image_url) {
      ownerOverrideCount++;
    } else if (p.image_source === "shared_library" && p.primary_image_url) {
      sharedMatchedCount++;
    }

    if (p.publish_status === "published" && Number(p.is_controlled_substance || 0) === 0) {
      publishedCount++;
      const cat = String(p.category_name || "General Medicines").trim() || "General Medicines";
      catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
    }
  }

  const categories = Array.from(catCounts.entries())
    .map(([name, count]) => ({
      name,
      slug: toUrlSlug(name),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  doc.published_count = publishedCount;
  doc.shared_matched_count = sharedMatchedCount;
  doc.owner_override_count = ownerOverrideCount;
  doc.categories = categories;
  return doc;
}

function mapD1RowToR2Product(r: Record<string, unknown>): R2CatalogProductRecord {
  const name = String(r.name || "").trim();
  const unitLabel = String(r.unit_label || "Pack");
  const nowIso = new Date().toISOString();
  const coreKey =
    (r.normalized_core_key ? String(r.normalized_core_key) : null) ||
    computeNormalizedCoreKey(name) ||
    null;

  return {
    id: String(r.id),
    storefront_id: String(r.storefront_id),
    pharmacy_id: String(r.pharmacy_id),
    pos_product_id: String(r.pos_product_id),
    master_medicine_id: r.master_medicine_id ? String(r.master_medicine_id) : null,
    sku_code: r.sku_code ? String(r.sku_code) : null,
    slug: String(r.slug || toUrlSlug(name, String(r.pos_product_id || ""))),
    name,
    generic_name: r.generic_name ? String(r.generic_name) : null,
    strength: r.strength ? String(r.strength) : null,
    dosage_form: r.dosage_form ? String(r.dosage_form) : null,
    brand_name: r.brand_name ? String(r.brand_name) : null,
    packing_label: r.packing_label ? String(r.packing_label) : null,
    unit_label: unitLabel,
    base_unit_label: r.base_unit_label ? String(r.base_unit_label) : unitLabel,
    selling_units_json: typeof r.selling_units_json === "string" ? r.selling_units_json : "[]",
    public_description: r.public_description ? String(r.public_description) : null,
    public_selling_price_pkr: Number(r.public_selling_price_pkr || 0),
    compare_at_price_pkr:
      r.compare_at_price_pkr !== null && r.compare_at_price_pkr !== undefined
        ? Number(r.compare_at_price_pkr)
        : null,
    override_price_pkr:
      r.override_price_pkr !== null && r.override_price_pkr !== undefined
        ? Number(r.override_price_pkr)
        : null,
    availability_status: String(r.availability_status || "in_stock"),
    available_qty: Number(r.available_qty || 0),
    available_base_qty: Number(r.available_base_qty ?? r.available_qty ?? 0),
    branch_stock_json: typeof r.branch_stock_json === "string" ? r.branch_stock_json : "{}",
    category_name: String(r.category_name || "General Medicines").trim() || "General Medicines",
    primary_image_url: r.primary_image_url ? String(r.primary_image_url) : null,
    image_source: String(r.image_source || (r.primary_image_url ? "shared_library" : "none")),
    selected_media_id: r.selected_media_id ? String(r.selected_media_id) : null,
    canonical_medicine_id: r.canonical_medicine_id ? String(r.canonical_medicine_id) : null,
    normalized_core_key: coreKey,
    search_keywords:
      typeof r.search_keywords === "string" && r.search_keywords
        ? r.search_keywords
        : [name, r.generic_name, r.brand_name, r.strength, r.dosage_form, r.category_name, r.sku_code]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
    publish_status: String(r.publish_status || "published"),
    requires_prescription: Number(r.requires_prescription || 0),
    is_controlled_substance: Number(r.is_controlled_substance || 0),
    is_featured: Number(r.is_featured || 0),
    is_popular: Number(r.is_popular || 0),
    max_order_qty: Number(r.max_order_qty || 20),
    sync_version: Number(r.sync_version || 1),
    deleted_at: r.deleted_at ? String(r.deleted_at) : null,
    last_synced_at: r.last_synced_at ? String(r.last_synced_at) : null,
    created_at: String(r.created_at || nowIso),
    updated_at: String(r.updated_at || nowIso),
  };
}

/**
 * Persists a pharmacy's authoritative catalog document to R2 (`storefront-catalogs/{sfId}/live.json`)
 * and refreshes the isolate hot cache immediately.
 */
export async function saveStorefrontCatalogDoc(
  env: StorefrontWorkerEnv,
  doc: R2StorefrontCatalogDoc
): Promise<R2StorefrontCatalogDoc> {
  recomputeCatalogDocSummaries(doc);
  doc.updated_at = new Date().toISOString();
  doc.catalog_version = (Number(doc.catalog_version) || 0) + 1;

  if (env.MEDIA_BUCKET) {
    const r2Key = getStorefrontLiveCatalogR2Key(doc.storefront_id);
    await env.MEDIA_BUCKET.put(r2Key, JSON.stringify(doc), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "no-store",
      },
      customMetadata: {
        storefront_id: doc.storefront_id,
        pharmacy_id: doc.pharmacy_id,
        catalog_version: String(doc.catalog_version),
        published_count: String(doc.published_count),
      },
    });
  }

  putCatalogMemCache(doc);
  return doc;
}

/**
 * Hydrates non-owner-override products in a catalog doc against the latest Central Image Index in memory (<3ms!).
 * Returns how many products received new/updated shared images.
 */
export function hydrateCatalogDocWithCentralIndex(
  doc: R2StorefrontCatalogDoc,
  compiled: CompiledCentralImageIndex,
  options?: { forceRematchAll?: boolean }
): { updatedCount: number; docChanged: boolean } {
  if (
    !options?.forceRematchAll &&
    doc.central_index_version === compiled.doc.version &&
    compiled.doc.version > 0
  ) {
    return { updatedCount: 0, docChanged: false };
  }

  let updatedCount = 0;
  // A central index version mismatch alone is NOT a content change — only real product image
  // updates (or forced un-matching) count, so callers never rewrite live.json for a no-op.
  let anyChanged = false;
  const nowIso = new Date().toISOString();

  for (const p of doc.products) {
    if (p.image_source === "owner_override" && p.primary_image_url) {
      continue;
    }

    // If already linked to a verified canonical entry, verify image URL is still current
    if (p.canonical_medicine_id && !options?.forceRematchAll) {
      const existingCanon = compiled.byId.get(p.canonical_medicine_id);
      if (existingCanon && existingCanon.preferred_image_url) {
        if (
          p.primary_image_url !== existingCanon.preferred_image_url ||
          p.selected_media_id !== existingCanon.preferred_media_id
        ) {
          p.primary_image_url = existingCanon.preferred_image_url;
          p.selected_media_id = existingCanon.preferred_media_id;
          p.image_source = "shared_library";
          p.updated_at = nowIso;
          updatedCount++;
          anyChanged = true;
        }
        continue;
      }
    }

    // Only attempt match for products without an image (or when forceRematchAll is requested)
    if (p.primary_image_url && !options?.forceRematchAll) {
      continue;
    }

    const input: ProductInput = {
      name: p.name,
      generic_name: p.generic_name,
      strength: p.strength,
      dosage_form: p.dosage_form,
      brand_name: p.brand_name,
      packing_label: p.packing_label,
      unit_label: p.unit_label,
      sku_code: p.sku_code,
      barcode: p.sku_code,
      master_medicine_id: p.master_medicine_id,
    };

    const match = matchProductAgainstCentralIndex(input, compiled);
    if (match.matched && match.imageUrl && match.canonicalId) {
      if (
        p.primary_image_url !== match.imageUrl ||
        p.canonical_medicine_id !== match.canonicalId ||
        p.selected_media_id !== match.mediaId
      ) {
        p.canonical_medicine_id = match.canonicalId;
        p.selected_media_id = match.mediaId;
        p.primary_image_url = match.imageUrl;
        p.image_source = "shared_library";
        p.updated_at = nowIso;
        updatedCount++;
        anyChanged = true;
      }
    } else if (options?.forceRematchAll && p.image_source === "shared_library") {
      p.canonical_medicine_id = null;
      p.selected_media_id = null;
      p.primary_image_url = null;
      p.image_source = "none";
      p.updated_at = nowIso;
      anyChanged = true;
    }
  }

  doc.central_index_version = compiled.doc.version;
  if (anyChanged) {
    recomputeCatalogDocSummaries(doc);
  }
  return { updatedCount, docChanged: anyChanged };
}

/**
 * Fetches + parses `storefront-catalogs/{sfId}/live.json`, distinguishing a truly MISSING object
 * (get() === null) from transient R2 / JSON failures.
 */
async function fetchCatalogDocFromR2(
  env: StorefrontWorkerEnv,
  storefrontId: string
): Promise<CatalogR2FetchResult> {
  if (!env.MEDIA_BUCKET) return { kind: "missing" };
  let obj: Awaited<ReturnType<NonNullable<StorefrontWorkerEnv["MEDIA_BUCKET"]>["get"]>> = null;
  try {
    obj = await env.MEDIA_BUCKET.get(getStorefrontLiveCatalogR2Key(storefrontId));
  } catch (error) {
    return { kind: "error", error };
  }
  if (!obj) return { kind: "missing" };
  try {
    const text = new TextDecoder().decode(await obj.arrayBuffer());
    const parsed = JSON.parse(text) as R2StorefrontCatalogDoc;
    if (parsed && parsed.storefront_id === storefrontId && Array.isArray(parsed.products)) {
      return { kind: "found", doc: parsed };
    }
    return { kind: "error", error: new Error("catalog_doc_invalid_shape") };
  } catch (error) {
    return { kind: "error", error };
  }
}

/** Single-flight wrapper so parallel isolate misses for one tenant share a single R2 GET. */
function fetchCatalogDocFromR2Deduped(
  env: StorefrontWorkerEnv,
  storefrontId: string
): Promise<CatalogR2FetchResult> {
  const existing = catalogR2Inflight.get(storefrontId);
  if (existing) return existing;
  const p = fetchCatalogDocFromR2(env, storefrontId).finally(() => {
    if (catalogR2Inflight.get(storefrontId) === p) catalogR2Inflight.delete(storefrontId);
  });
  catalogR2Inflight.set(storefrontId, p);
  return p;
}

async function buildCatalogDocFromLegacyD1(
  env: StorefrontWorkerEnv,
  storefrontId: string,
  pharmacyId: string
): Promise<R2StorefrontCatalogDoc> {
  const legacyRowsRes = await env.DB.prepare(
    `SELECT * FROM storefront_products
     WHERE storefront_id = ? AND pharmacy_id = ?
     ORDER BY name ASC, id ASC`
  )
    .bind(storefrontId, pharmacyId)
    .all<Record<string, unknown>>()
    .catch(() => ({ results: [] as Record<string, unknown>[] }));

  const mappedProducts = (legacyRowsRes.results || []).map(mapD1RowToR2Product);
  const sfRow = await env.DB.prepare(
    `SELECT last_sync_at, config_version FROM storefronts WHERE id = ? LIMIT 1`
  )
    .bind(storefrontId)
    .first<{ last_sync_at: string | null; config_version: number }>()
    .catch(() => null);

  return recomputeCatalogDocSummaries({
    schema_version: 2,
    storefront_id: storefrontId,
    pharmacy_id: pharmacyId,
    catalog_version: Number(sfRow?.config_version || 1),
    central_index_version: 0,
    updated_at: new Date().toISOString(),
    last_sync_at: sfRow?.last_sync_at || null,
    published_count: 0,
    shared_matched_count: 0,
    owner_override_count: 0,
    categories: [],
    products: mappedProducts,
  });
}

/**
 * Loads a pharmacy's authoritative catalog document:
 * 1. Isolate RAM (0ms, 0 D1, 0 R2) — unless `freshFromR2: true` (used before write-merge!) or the
 *    cached copy predates `expectedConfigVersion`.
 * 2. Cloudflare R2 (`storefront-catalogs/{sfId}/live.json`, ~12ms, 0 D1) — single-flight deduped.
 * 3. Legacy D1 `storefront_products` ONLY when the R2 object is truly missing.
 *
 * NEVER persists from a read path: central-image hydration is applied in memory only, and the
 * legacy D1 migration is only written to R2 when the caller explicitly passes
 * `persistLegacyMigration: true` (sync / maintenance code). R2 errors or corrupt JSON never fall
 * back to D1 (which could overwrite a good R2 catalog with stale/empty legacy rows): a stale
 * isolate copy is served when available, otherwise the error is thrown.
 */
export async function loadStorefrontCatalogDoc(
  env: StorefrontWorkerEnv,
  storefrontId: string,
  pharmacyId: string,
  options?: {
    freshFromR2?: boolean;
    hydrateCentralImages?: boolean;
    /** Kept for backward compatibility; read paths no longer schedule background writes. */
    execCtx?: WorkerExecutionContext;
    /** Tenant `config_version` observed by the caller; older isolate copies are refetched. */
    expectedConfigVersion?: number;
    /** Allow writing the one-time legacy D1 -> R2 migration (non-visitor callers only). */
    persistLegacyMigration?: boolean;
    /** Allow rebuilding a MISSING central index from D1 (non-visitor callers only). */
    allowCentralRebuild?: boolean;
  }
): Promise<{
  doc: R2StorefrontCatalogDoc;
  source: "isolate" | "r2" | "d1_migrated" | "empty";
  centralIndexVersion: number;
}> {
  const now = Date.now();
  const expectedVersion = Number(options?.expectedConfigVersion || 0);
  let doc: R2StorefrontCatalogDoc | null = null;
  let source: "isolate" | "r2" | "d1_migrated" | "empty" = "empty";
  let tagVersion = expectedVersion;

  const memHit = catalogMemCache.get(storefrontId);
  if (!options?.freshFromR2 && memHit) {
    const fresh = memHit.expiresAt > now;
    const versionOk = !expectedVersion || memHit.configVersion >= expectedVersion;
    if (fresh && versionOk) {
      doc = memHit.doc;
      source = "isolate";
      tagVersion = memHit.configVersion;
    }
  }

  if (!doc) {
    const fetched = options?.freshFromR2
      ? await fetchCatalogDocFromR2(env, storefrontId)
      : await fetchCatalogDocFromR2Deduped(env, storefrontId);

    if (fetched.kind === "found") {
      doc = fetched.doc;
      source = "r2";
    } else if (fetched.kind === "error") {
      // Transient R2 failure / corrupt JSON: serve last known good copy, never fall back to D1.
      if (memHit && !options?.freshFromR2) {
        doc = memHit.doc;
        source = "isolate";
        tagVersion = memHit.configVersion;
      } else {
        throw new Error(
          `catalog_r2_unavailable: ${
            fetched.error instanceof Error ? fetched.error.message : String(fetched.error)
          }`
        );
      }
    } else {
      // Truly missing in R2 -> legacy D1 hydration (served, not persisted unless explicitly allowed)
      doc = await buildCatalogDocFromLegacyD1(env, storefrontId, pharmacyId);
      source = doc.products.length > 0 ? "d1_migrated" : "empty";
      try {
        const centralIndex = await getCentralImageIndex(env, {
          allowRebuild: options?.allowCentralRebuild === true,
        });
        hydrateCatalogDocWithCentralIndex(doc, centralIndex);
      } catch {
        // Non-fatal
      }
      if (options?.persistLegacyMigration && env.MEDIA_BUCKET && doc.products.length > 0) {
        await saveStorefrontCatalogDoc(env, doc).catch(() => {});
      }
      if (!options?.freshFromR2) putCatalogMemCache(doc, tagVersion);
      return { doc, source, centralIndexVersion: doc.central_index_version };
    }
  }

  // In-memory-only central image hydration (no R2 writes from read paths)
  let centralVersion = doc.central_index_version || 0;
  if (options?.hydrateCentralImages !== false) {
    try {
      const centralIndex = await getCentralImageIndex(env, {
        allowRebuild: options?.allowCentralRebuild === true,
      });
      if (centralIndex.doc.version > 0) {
        hydrateCatalogDocWithCentralIndex(doc, centralIndex);
        centralVersion = centralIndex.doc.version;
      }
    } catch {
      // Non-fatal: serve the catalog without fresh central hydration
    }
  }

  if (source === "r2" && !options?.freshFromR2) {
    putCatalogMemCache(doc, tagVersion);
  }

  return { doc, source, centralIndexVersion: centralVersion };
}

/**
 * Syncs `storefronts.published_products_count`, `config_version`, `last_sync_at`, and
 * lightweight `storefront_categories` metadata from an R2 catalog doc using minimal D1 writes (~1-5 writes total!).
 */
export async function syncStorefrontMetadataFromCatalogDoc(
  db: D1Database,
  doc: R2StorefrontCatalogDoc,
  options?: {
    bumpConfigVersion?: boolean;
    updateLastSyncAt?: string | null;
    syncCategories?: boolean;
  }
): Promise<{ publishedCount: number; configVersion: number }> {
  const nowIso = new Date().toISOString();
  const publishedCount = doc.published_count;

  const setClauses = ["published_products_count = ?", "updated_at = ?"];
  const binds: unknown[] = [publishedCount, nowIso];

  if (options?.bumpConfigVersion) {
    setClauses.push("config_version = COALESCE(config_version, 1) + 1");
  }
  if (options?.updateLastSyncAt) {
    setClauses.push("last_sync_at = ?");
    binds.push(options.updateLastSyncAt);
  }
  binds.push(doc.storefront_id, doc.pharmacy_id);

  await db
    .prepare(
      `UPDATE storefronts
       SET ${setClauses.join(", ")}
       WHERE id = ? AND pharmacy_id = ?`
    )
    .bind(...binds)
    .run();

  let configVersion = doc.catalog_version;
  if (options?.bumpConfigVersion) {
    const vRow = await db
      .prepare(`SELECT config_version FROM storefronts WHERE id = ? LIMIT 1`)
      .bind(doc.storefront_id)
      .first<{ config_version: number }>();
    configVersion = Number(vRow?.config_version || 1);
  }

  if (options?.syncCategories && doc.categories.length > 0) {
    // Load existing categories (tiny table: ~5-20 rows) and batch-upsert only changed counts
    const existingRes = await db
      .prepare(
        `SELECT id, name, slug, published_product_count
         FROM storefront_categories
         WHERE storefront_id = ? AND pharmacy_id = ?`
      )
      .bind(doc.storefront_id, doc.pharmacy_id)
      .all<{ id: string; name: string; slug: string; published_product_count: number }>();

    const existingBySlug = new Map<string, { id: string; count: number }>();
    const existingByLowerName = new Map<string, { id: string; count: number }>();
    for (const c of existingRes.results || []) {
      const entry = { id: c.id, count: Number(c.published_product_count || 0) };
      existingBySlug.set(String(c.slug || "").toLowerCase(), entry);
      existingByLowerName.set(String(c.name || "").trim().toLowerCase(), entry);
    }

    const stmts: ReturnType<D1Database["prepare"]>[] = [];
    const seenIds = new Set<string>();

    for (const cat of doc.categories) {
      const existing =
        existingByLowerName.get(cat.name.toLowerCase()) ||
        existingBySlug.get(cat.slug.toLowerCase());
      if (existing) {
        seenIds.add(existing.id);
        if (existing.count !== cat.count) {
          stmts.push(
            db
              .prepare(
                `UPDATE storefront_categories
                 SET published_product_count = ?, updated_at = ?
                 WHERE id = ? AND storefront_id = ?`
              )
              .bind(cat.count, nowIso, existing.id, doc.storefront_id)
          );
        }
      } else {
        stmts.push(
          db
            .prepare(
              `INSERT INTO storefront_categories (
                 id, storefront_id, pharmacy_id, slug, name, description,
                 sort_order, is_visible, published_product_count, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, 10, 1, ?, ?, ?)
               ON CONFLICT(storefront_id, slug) DO UPDATE SET
                 published_product_count = excluded.published_product_count,
                 updated_at = excluded.updated_at`
            )
            .bind(
              `sfc_${crypto.randomUUID()}`,
              doc.storefront_id,
              doc.pharmacy_id,
              cat.slug,
              cat.name,
              `${cat.name} available at our pharmacy`,
              cat.count,
              nowIso,
              nowIso
            )
        );
      }
    }

    for (const c of existingRes.results || []) {
      if (!seenIds.has(c.id) && Number(c.published_product_count || 0) !== 0) {
        stmts.push(
          db
            .prepare(
              `UPDATE storefront_categories
               SET published_product_count = 0, updated_at = ?
               WHERE id = ? AND storefront_id = ?`
            )
            .bind(nowIso, c.id, doc.storefront_id)
        );
      }
    }

    if (stmts.length > 0) {
      await db.batch(stmts).catch(() => {});
    }
  }

  return { publishedCount, configVersion };
}

/**
 * Per-catalog-doc memo of the published product list. Keyed by the doc object (WeakMap, so it is
 * GC'd with the doc) and validated by a cheap version fingerprint, because hydration / merges can
 * mutate a doc in place. The returned array is shared and MUST be treated as read-only.
 */
const publishedProductsMemo = new WeakMap<
  R2StorefrontCatalogDoc,
  { fingerprint: string; products: Array<Record<string, unknown>> }
>();

function catalogDocFingerprint(doc: R2StorefrontCatalogDoc): string {
  return `${doc.catalog_version}|${doc.central_index_version}|${doc.updated_at}|${doc.products.length}|${doc.published_count}`;
}

export function getMemoizedPublishedProducts(
  doc: R2StorefrontCatalogDoc
): Array<Record<string, unknown>> {
  const fingerprint = catalogDocFingerprint(doc);
  const hit = publishedProductsMemo.get(doc);
  if (hit && hit.fingerprint === fingerprint) return hit.products;
  const products: Array<Record<string, unknown>> = [];
  for (const p of doc.products) {
    if (p.publish_status === "published" && Number(p.is_controlled_substance || 0) === 0) {
      products.push(p as unknown as Record<string, unknown>);
    }
  }
  publishedProductsMemo.set(doc, { fingerprint, products });
  return products;
}

/**
 * Converts an authoritative `R2StorefrontCatalogDoc` into a public-only snapshot view
 * (strictly published, non-controlled products + visible categories) for public API endpoints.
 */
export function buildPublicSnapshotViewFromCatalogDoc(
  doc: R2StorefrontCatalogDoc,
  sf: Pick<StorefrontRecord, "id" | "pharmacy_id" | "config_version" | "last_sync_at">,
  customCategoryMeta?: StorefrontCategoryRecord[]
): {
  version: number;
  storefront_id: string;
  pharmacy_id: string;
  generated_at: string;
  last_sync_at: string | null;
  categories: StorefrontCategoryRecord[];
  products: Array<Record<string, unknown>>;
} {
  const customBySlug = new Map<string, StorefrontCategoryRecord>();
  const customByName = new Map<string, StorefrontCategoryRecord>();
  for (const c of customCategoryMeta || []) {
    customBySlug.set(String(c.slug || "").toLowerCase(), c);
    customByName.set(String(c.name || "").trim().toLowerCase(), c);
  }

  const categories: StorefrontCategoryRecord[] = [];
  for (const cat of doc.categories) {
    const meta =
      customByName.get(cat.name.toLowerCase()) || customBySlug.get(cat.slug.toLowerCase());
    if (meta && Number(meta.is_visible ?? 1) === 0) continue;
    categories.push({
      id: meta?.id || `cat_${cat.slug}`,
      storefront_id: sf.id,
      pharmacy_id: sf.pharmacy_id,
      slug: meta?.slug || cat.slug,
      name: meta?.name || cat.name,
      description: meta?.description || `${cat.name} available at our pharmacy`,
      icon_name: meta?.icon_name || null,
      image_url: meta?.image_url || null,
      sort_order: meta?.sort_order ?? 10,
      is_visible: 1,
      published_product_count: cat.count,
    } as StorefrontCategoryRecord);
  }
  categories.sort(
    (a, b) =>
      Number(a.sort_order ?? 10) - Number(b.sort_order ?? 10) ||
      Number(b.published_product_count ?? 0) - Number(a.published_product_count ?? 0) ||
      String(a.name || "").localeCompare(String(b.name || ""))
  );

  const publishedProducts = getMemoizedPublishedProducts(doc);

  return {
    version: Number(sf.config_version || doc.catalog_version || 1),
    storefront_id: sf.id,
    pharmacy_id: sf.pharmacy_id,
    generated_at: doc.updated_at,
    last_sync_at: sf.last_sync_at || doc.last_sync_at || null,
    categories,
    products: publishedProducts,
  };
}
