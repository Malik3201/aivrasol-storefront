/**
 * AivraSol Central Smart Medicine Image Library Service
 *
 * Implements Layers A, B, C & Section 6, 8, 9, 10, 14, 15:
 * - Canonical product identity management
 * - Strict deterministic medicine matching
 * - Shared media resolution without duplicate R2 copies
 * - Owner overrides and contribution review queues
 * - Safe reference tracking preventing accidental deletion
 */

import type { D1Database, StorefrontWorkerEnv } from "./env";
import {
  computeNormalizedCoreKey,
  matchMedicineIdentity,
  CanonicalMedicineRecord,
  ProductInput,
} from "../shared/medicine-identity-matcher";
import { bumpStorefrontConfigVersion, resolveSharedMediaPublicUrl } from "./edge-cache-and-snapshots";

export interface CentralLibraryOverview {
  total_canonical_medicines: number;
  verified_shared_images: number;
  pending_submissions: number;
  unassigned_products: number;
  shared_references: number;
  owner_overrides: number;
  unique_r2_objects: number;
  total_stored_bytes: number;
  estimated_saved_bytes: number;
  average_image_bytes: number;
}

export async function getCentralLibraryOverview(
  db: D1Database
): Promise<CentralLibraryOverview> {
  const [canRow, mediaRow, subRow, prodImageStatsRow] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total_canonical FROM central_medicines`)
      .first<{ total_canonical: number }>(),
    db
      .prepare(
        `SELECT
           COUNT(DISTINCT r2_object_key) AS unique_objects,
           SUM(CASE WHEN is_shared = 1 THEN 1 ELSE 0 END) AS verified_shared,
           COALESCE(SUM(byte_size), 0) AS total_bytes,
           AVG(byte_size) AS avg_bytes
         FROM storefront_media`
      )
      .first<{
        unique_objects: number;
        verified_shared: number;
        total_bytes: number;
        avg_bytes: number | null;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS pending_subs
         FROM central_image_submissions
         WHERE status = 'pending'`
      )
      .first<{ pending_subs: number }>(),
    // Single pass over storefront_products instead of 3 separate full table scans
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN (image_source = 'none' OR primary_image_url IS NULL OR primary_image_url = '')
                     AND publish_status = 'published' THEN 1 ELSE 0 END) AS unassigned,
           SUM(CASE WHEN image_source = 'shared_library' AND primary_image_url IS NOT NULL THEN 1 ELSE 0 END) AS shared_refs,
           SUM(CASE WHEN image_source = 'owner_override' THEN 1 ELSE 0 END) AS owner_overrides
         FROM storefront_products`
      )
      .first<{
        unassigned: number | null;
        shared_refs: number | null;
        owner_overrides: number | null;
      }>(),
  ]);

  const totalCanonical = Number(canRow?.total_canonical || 0);
  const verifiedShared = Number(mediaRow?.verified_shared || 0);
  const pendingSubs = Number(subRow?.pending_subs || 0);
  const unassigned = Number(prodImageStatsRow?.unassigned || 0);
  const sharedRefs = Number(prodImageStatsRow?.shared_refs || 0);
  const ownerOverrides = Number(prodImageStatsRow?.owner_overrides || 0);
  const uniqueObjects = Number(mediaRow?.unique_objects || 0);
  const totalBytes = Number(mediaRow?.total_bytes || 0);
  const avgBytes = Math.round(Number(mediaRow?.avg_bytes || 45 * 1024));

  // Estimated bytes saved = number of shared references beyond the 1 physical file * average image size
  const savedReferences = Math.max(0, sharedRefs - verifiedShared);
  const estimatedSavedBytes = savedReferences * avgBytes;

  return {
    total_canonical_medicines: totalCanonical,
    verified_shared_images: verifiedShared,
    pending_submissions: pendingSubs,
    unassigned_products: unassigned,
    shared_references: sharedRefs,
    owner_overrides: ownerOverrides,
    unique_r2_objects: uniqueObjects,
    total_stored_bytes: totalBytes,
    estimated_saved_bytes: estimatedSavedBytes,
    average_image_bytes: avgBytes,
  };
}

export async function listCanonicalMedicines(
  db: D1Database,
  params: {
    q?: string;
    status?: string;
    dosage_form?: string;
    brand?: string;
    has_image?: string;
    page?: number;
    limit?: number;
  }
) {
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(100, Math.max(1, Number(params.limit || 40)));
  const offset = (page - 1) * limit;

  let whereClauses: string[] = ["1=1"];
  const bindValues: unknown[] = [];

  if (params.q && params.q.trim()) {
    const term = `%${params.q.trim().toLowerCase()}%`;
    whereClauses.push(
      `(LOWER(c.canonical_name) LIKE ? OR LOWER(c.brand_name) LIKE ? OR LOWER(c.generic_name) LIKE ? OR c.barcode LIKE ?)`
    );
    bindValues.push(term, term, term, `%${params.q.trim()}%`);
  }

  if (params.status && params.status !== "all") {
    whereClauses.push(`c.verification_status = ?`);
    bindValues.push(params.status);
  }

  if (params.dosage_form && params.dosage_form !== "all") {
    whereClauses.push(`LOWER(c.dosage_form) = LOWER(?)`);
    bindValues.push(params.dosage_form);
  }

  if (params.brand && params.brand !== "all") {
    whereClauses.push(`LOWER(c.brand_name) = LOWER(?)`);
    bindValues.push(params.brand);
  }

  if (params.has_image === "1") {
    whereClauses.push(`c.preferred_media_id IS NOT NULL`);
  } else if (params.has_image === "0") {
    whereClauses.push(`c.preferred_media_id IS NULL`);
  }

  const whereSql = whereClauses.join(" AND ");

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM central_medicines c WHERE ${whereSql}`
    )
    .bind(...bindValues)
    .first<{ total: number }>();
  const totalCount = Number(countRow?.total || 0);

  // Fetch ONLY the page's canonical medicines (no correlated subquery over storefront_products!)
  const querySql = `
    SELECT
      c.*,
      m.public_url AS preferred_image_url,
      m.byte_size AS image_byte_size,
      m.content_type AS image_content_type
    FROM central_medicines c
    LEFT JOIN storefront_media m ON c.preferred_media_id = m.id
    WHERE ${whereSql}
    ORDER BY c.canonical_name ASC
    LIMIT ? OFFSET ?
  `;

  const { results } = await db
    .prepare(querySql)
    .bind(...bindValues, limit, offset)
    .all<Record<string, unknown>>();

  const pageRows = results || [];
  const refCountMap = new Map<string, number>();

  // Fetch referencing product counts in ONE indexed IN (...) query for the page's IDs only
  // (reduces ~51,000 rows_read per page down to <100 rows_read!)
  const pageIds = pageRows
    .map((r) => (r.id ? String(r.id) : ""))
    .filter(Boolean);

  if (pageIds.length > 0) {
    const placeholders = pageIds.map(() => "?").join(", ");
    const refRes = await db
      .prepare(
        `SELECT canonical_medicine_id, COUNT(*) AS cnt
         FROM storefront_products
         WHERE canonical_medicine_id IN (${placeholders})
         GROUP BY canonical_medicine_id`
      )
      .bind(...pageIds)
      .all<{ canonical_medicine_id: string; cnt: number }>();
    for (const r of refRes.results || []) {
      if (r.canonical_medicine_id) {
        refCountMap.set(String(r.canonical_medicine_id), Number(r.cnt || 0));
      }
    }
  }

  const medicines = pageRows.map((row) => ({
    ...row,
    referencing_products_count: refCountMap.get(String(row.id || "")) || 0,
  }));

  return {
    medicines,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function upsertCanonicalMedicine(
  db: D1Database,
  data: {
    id?: string;
    canonical_name: string;
    master_catalog_id?: string | null;
    master_catalog_name?: string | null;
    normalized_catalog_name?: string | null;
    brand_name?: string | null;
    generic_name?: string | null;
    strength?: string | null;
    dosage_form?: string | null;
    manufacturer?: string | null;
    pack_size?: number | null;
    pack_unit?: string | null;
    barcode?: string | null;
    aliases?: string[];
    verification_status?: string;
    preferred_media_id?: string | null;
    image_source?: string | null;
    image_rights_status?: string | null;
    logical_file_name?: string | null;
    review_notes?: string | null;
  }
) {
  const id = data.id || `cmed_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const aliasesJson = JSON.stringify(data.aliases || []);
  const status = data.verification_status || "verified";
  const exactMasterName = (data.master_catalog_name || data.canonical_name).trim();
  const normName = data.normalized_catalog_name || exactMasterName.toLowerCase().replace(/\s+/g, " ");
  const coreKey = computeNormalizedCoreKey(exactMasterName) || computeNormalizedCoreKey(data.brand_name) || null;
  const logicalFileName = data.logical_file_name || `${exactMasterName}.webp`;

  await db
    .prepare(
      `INSERT INTO central_medicines (
         id, canonical_name, master_catalog_id, master_catalog_name, normalized_catalog_name, normalized_core_key,
         brand_name, generic_name, strength, dosage_form, manufacturer, pack_size, pack_unit, barcode,
         aliases_json, verification_status, preferred_media_id, image_source, image_rights_status,
         logical_file_name, review_notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         canonical_name = excluded.canonical_name,
         master_catalog_id = COALESCE(excluded.master_catalog_id, central_medicines.master_catalog_id),
         master_catalog_name = COALESCE(excluded.master_catalog_name, central_medicines.master_catalog_name),
         normalized_catalog_name = COALESCE(excluded.normalized_catalog_name, central_medicines.normalized_catalog_name),
         normalized_core_key = COALESCE(excluded.normalized_core_key, central_medicines.normalized_core_key),
         brand_name = excluded.brand_name,
         generic_name = excluded.generic_name,
         strength = excluded.strength,
         dosage_form = excluded.dosage_form,
         manufacturer = excluded.manufacturer,
         pack_size = excluded.pack_size,
         pack_unit = excluded.pack_unit,
         barcode = excluded.barcode,
         aliases_json = excluded.aliases_json,
         verification_status = excluded.verification_status,
         preferred_media_id = COALESCE(excluded.preferred_media_id, central_medicines.preferred_media_id),
         image_source = COALESCE(excluded.image_source, central_medicines.image_source),
         image_rights_status = COALESCE(excluded.image_rights_status, central_medicines.image_rights_status),
         logical_file_name = COALESCE(excluded.logical_file_name, central_medicines.logical_file_name),
         review_notes = excluded.review_notes,
         updated_at = excluded.updated_at`
    )
    .bind(
      id,
      exactMasterName,
      data.master_catalog_id?.trim() || null,
      exactMasterName,
      normName,
      coreKey,
      data.brand_name?.trim() || null,
      data.generic_name?.trim() || null,
      data.strength?.trim() || null,
      data.dosage_form?.trim() || null,
      data.manufacturer?.trim() || null,
      data.pack_size ?? null,
      data.pack_unit?.trim() || null,
      data.barcode?.trim() || null,
      aliasesJson,
      status,
      data.preferred_media_id || null,
      data.image_source || "manual",
      data.image_rights_status || "unknown",
      logicalFileName,
      data.review_notes?.trim() || null,
      now,
      now
    )
    .run();

  // If a preferred media was set or updated, update storefront products linked to this canonical ID
  // and auto-link unassigned products matching this identity across all pharmacies
  if (data.preferred_media_id) {
    await matchAndPropagateCanonicalMedicine(db, id);
  }

  return { id };
}

/**
 * Automatically matches and propagates a verified canonical medicine to all eligible
 * storefront products across all pharmacies (except those where the pharmacy owner uploaded a custom override photo).
 */
export async function matchAndPropagateCanonicalMedicine(
  db: D1Database,
  canonicalId: string
): Promise<{ matchedCount: number }> {
  const can = await db
    .prepare(
      `SELECT c.*, m.public_url AS preferred_image_url
       FROM central_medicines c
       INNER JOIN storefront_media m ON c.preferred_media_id = m.id
       WHERE c.id = ? AND c.verification_status = 'verified' AND c.preferred_media_id IS NOT NULL
       LIMIT 1`
    )
    .bind(canonicalId)
    .first<Record<string, unknown>>();

  if (!can || !can.preferred_media_id || !can.preferred_image_url) {
    return { matchedCount: 0 };
  }

  const canonicalRecord: CanonicalMedicineRecord = {
    id: String(can.id),
    canonical_name: String(can.canonical_name),
    master_catalog_id: can.master_catalog_id ? String(can.master_catalog_id) : null,
    master_catalog_name: can.master_catalog_name ? String(can.master_catalog_name) : null,
    normalized_catalog_name: can.normalized_catalog_name ? String(can.normalized_catalog_name) : null,
    normalized_core_key: can.normalized_core_key ? String(can.normalized_core_key) : null,
    allow_strengthless_match: Number(can.allow_strengthless_match || 0) === 1,
    brand_name: can.brand_name ? String(can.brand_name) : null,
    generic_name: can.generic_name ? String(can.generic_name) : null,
    strength: can.strength ? String(can.strength) : null,
    dosage_form: can.dosage_form ? String(can.dosage_form) : null,
    manufacturer: can.manufacturer ? String(can.manufacturer) : null,
    pack_size: can.pack_size ? Number(can.pack_size) : null,
    pack_unit: can.pack_unit ? String(can.pack_unit) : null,
    barcode: can.barcode ? String(can.barcode) : null,
    aliases_json: can.aliases_json ? String(can.aliases_json) : null,
    verification_status: String(can.verification_status),
    preferred_media_id: String(can.preferred_media_id),
  };

  const imageUrl = String(can.preferred_image_url);
  const mediaId = String(can.preferred_media_id);
  const now = new Date().toISOString();
  const affectedStorefronts = new Set<string>();

  // 1. Instantly update products already assigned to this canonical ID
  const directUpdate = await db
    .prepare(
      `UPDATE storefront_products
       SET primary_image_url = ?, selected_media_id = ?, image_source = 'shared_library', updated_at = ?
       WHERE canonical_medicine_id = ? AND image_source != 'owner_override'`
    )
    .bind(imageUrl, mediaId, now, canonicalId)
    .run();

  // 1B. Instantly update products with exact matching master_medicine_id across all pharmacies!
  let matchedCount = Number(directUpdate.meta?.changes || 0);
  if (can.master_catalog_id) {
    const masterIdStr = String(can.master_catalog_id).trim();
    const { results: masterAffected } = await db
      .prepare(
        `SELECT id, storefront_id FROM storefront_products
         WHERE master_medicine_id = ? AND image_source != 'owner_override'`
      )
      .bind(masterIdStr)
      .all<{ id: string; storefront_id: string }>();

    if ((masterAffected || []).length > 0) {
      const mUpd = await db
        .prepare(
          `UPDATE storefront_products
           SET canonical_medicine_id = ?, selected_media_id = ?, primary_image_url = ?, image_source = 'shared_library', updated_at = ?
           WHERE master_medicine_id = ? AND image_source != 'owner_override'`
        )
        .bind(canonicalId, mediaId, imageUrl, now, masterIdStr)
        .run();
      matchedCount += Number(mUpd.meta?.changes || 0);
      for (const row of masterAffected || []) affectedStorefronts.add(String(row.storefront_id));
    }
  }

  // 2. Targeted candidate fetch using indexed normalized_core_key or first brand token (avoids scanning 100k+ rows!)
  const coreKey =
    canonicalRecord.normalized_core_key ||
    computeNormalizedCoreKey(canonicalRecord.canonical_name) ||
    computeNormalizedCoreKey(canonicalRecord.brand_name);
  const firstWord = (coreKey || "").split("_")[0] || "";

  let candidateRows: Record<string, unknown>[] = [];
  if (coreKey) {
    const { results } = await db
      .prepare(
        `SELECT id, storefront_id, pharmacy_id, pos_product_id, master_medicine_id, name, generic_name,
                strength, dosage_form, brand_name, packing_label, unit_label,
                sku_code, primary_image_url, image_source, canonical_medicine_id
         FROM storefront_products
         WHERE image_source != 'owner_override'
           AND (canonical_medicine_id IS NULL OR canonical_medicine_id = '' OR primary_image_url IS NULL OR primary_image_url = '' OR image_source = 'none')
           AND (normalized_core_key = ? OR (normalized_core_key IS NULL AND LOWER(name) LIKE ?))
         LIMIT 500`
      )
      .bind(coreKey, `${firstWord}%`)
      .all<Record<string, unknown>>();
    candidateRows = results || [];
  }

  for (const p of candidateRows) {
    const input: ProductInput = {
      name: String(p.name || ""),
      generic_name: p.generic_name ? String(p.generic_name) : null,
      strength: p.strength ? String(p.strength) : null,
      dosage_form: p.dosage_form ? String(p.dosage_form) : null,
      brand_name: p.brand_name ? String(p.brand_name) : null,
      packing_label: p.packing_label ? String(p.packing_label) : null,
      unit_label: p.unit_label ? String(p.unit_label) : null,
      sku_code: p.sku_code ? String(p.sku_code) : null,
      barcode: p.sku_code ? String(p.sku_code) : null,
      master_medicine_id: p.master_medicine_id ? String(p.master_medicine_id) : null,
    };

    const matchRes = matchMedicineIdentity(input, [canonicalRecord]);
    if (matchRes.matched) {
      await db
        .prepare(
          `UPDATE storefront_products
           SET canonical_medicine_id = ?,
               selected_media_id = ?,
               primary_image_url = ?,
               image_source = 'shared_library',
               normalized_core_key = COALESCE(normalized_core_key, ?),
               updated_at = ?
           WHERE id = ?`
        )
        .bind(canonicalId, mediaId, imageUrl, coreKey || null, now, p.id)
        .run();
      matchedCount++;
      if (p.storefront_id) affectedStorefronts.add(String(p.storefront_id));
    }
  }

  // Rotate config_version on affected storefronts so Edge Cache & R2 snapshots show new images immediately
  for (const sfId of affectedStorefronts) {
    await bumpStorefrontConfigVersion(db, sfId).catch(() => {});
  }

  return { matchedCount };
}

/**
 * 38,000-Scale Indexed Canonical Matcher:
 * Queries ONLY candidate verified rows from `central_medicines` matching this batch's
 * `master_medicine_id`, `barcode`, or `normalized_core_key` — reading ~5-60 rows instead of 38,000!
 */
export async function findMatchingCanonicalMedicinesIndexed(
  db: D1Database,
  inputs: ProductInput[]
): Promise<{
  catalog: Array<CanonicalMedicineRecord & { preferred_image_url: string }>;
  rowsRead: number;
}> {
  if (!inputs.length) return { catalog: [], rowsRead: 0 };

  const masterIds = new Set<string>();
  const barcodes = new Set<string>();
  const coreKeys = new Set<string>();

  for (const inp of inputs) {
    if (inp.master_medicine_id?.trim()) masterIds.add(inp.master_medicine_id.trim());
    const bc = (inp.barcode || inp.sku_code || "").trim();
    if (bc.length >= 6) barcodes.add(bc);
    const ck = computeNormalizedCoreKey(inp.name);
    if (ck) {
      coreKeys.add(ck);
      // Also include single-token root so "panadol_advance" can check "panadol" safely (matcher still rejects variant conflict!)
      const firstTok = ck.split("_")[0];
      if (firstTok && firstTok.length >= 3) coreKeys.add(firstTok);
    }
  }

  const byId = new Map<string, CanonicalMedicineRecord & { preferred_image_url: string }>();
  let totalRowsRead = 0;

  const mapRows = (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const id = String(r.id);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        canonical_name: String(r.canonical_name),
        master_catalog_id: r.master_catalog_id ? String(r.master_catalog_id) : null,
        master_catalog_name: r.master_catalog_name ? String(r.master_catalog_name) : null,
        normalized_catalog_name: r.normalized_catalog_name ? String(r.normalized_catalog_name) : null,
        normalized_core_key: r.normalized_core_key ? String(r.normalized_core_key) : null,
        allow_strengthless_match: Number(r.allow_strengthless_match || 0) === 1,
        brand_name: r.brand_name ? String(r.brand_name) : null,
        generic_name: r.generic_name ? String(r.generic_name) : null,
        strength: r.strength ? String(r.strength) : null,
        dosage_form: r.dosage_form ? String(r.dosage_form) : null,
        manufacturer: r.manufacturer ? String(r.manufacturer) : null,
        pack_size: r.pack_size ? Number(r.pack_size) : null,
        pack_unit: r.pack_unit ? String(r.pack_unit) : null,
        barcode: r.barcode ? String(r.barcode) : null,
        aliases_json: r.aliases_json ? String(r.aliases_json) : null,
        verification_status: String(r.verification_status),
        preferred_media_id: String(r.preferred_media_id),
        preferred_image_url: String(r.preferred_image_url),
      });
    }
  };

  const baseSelect = `
    SELECT c.id, c.canonical_name, c.master_catalog_id, c.master_catalog_name, c.normalized_catalog_name,
           c.normalized_core_key, c.allow_strengthless_match,
           c.brand_name, c.generic_name, c.strength, c.dosage_form,
           c.manufacturer, c.pack_size, c.pack_unit, c.barcode, c.aliases_json,
           c.verification_status, c.preferred_media_id, m.public_url AS preferred_image_url
    FROM central_medicines c
    INNER JOIN storefront_media m ON c.preferred_media_id = m.id
    WHERE c.verification_status = 'verified' AND c.preferred_media_id IS NOT NULL
  `;

  const queryChunked = async (col: string, values: string[]) => {
    const CHUNK = 60;
    for (let i = 0; i < values.length; i += CHUNK) {
      const slice = values.slice(i, i + CHUNK);
      const placeholders = slice.map(() => "?").join(", ");
      const res = await db
        .prepare(`${baseSelect} AND c.${col} IN (${placeholders})`)
        .bind(...slice)
        .all<Record<string, unknown>>();
      totalRowsRead += Number((res as any)?.meta?.rows_read || (res.results?.length ?? 0) + 1);
      mapRows(res.results || []);
    }
  };

  if (masterIds.size > 0) await queryChunked("master_catalog_id", Array.from(masterIds));
  if (barcodes.size > 0) await queryChunked("barcode", Array.from(barcodes));
  if (coreKeys.size > 0) await queryChunked("normalized_core_key", Array.from(coreKeys));

  return { catalog: Array.from(byId.values()), rowsRead: totalRowsRead };
}

export interface BulkVerifiedImageItem {
  master_catalog_id?: string | null;
  master_catalog_name: string;
  brand_name?: string | null;
  generic_name?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer?: string | null;
  barcode?: string | null;
  data_base64: string;
  sha256_hex: string;
  content_type?: string;
  byte_size?: number;
  width?: number;
  height?: number;
  source_type?: string;
  logical_file_name?: string;
  allow_strengthless_match?: boolean;
}

/**
 * Bulk Verified Central Image Importer (used by Admin Bulk ZIP Importer):
 * - Deduplicates images by SHA-256 across R2 (`shared/medicines/{hash}.webp`)
 * - Uploads binary WebP directly to R2 with 1-year immutable Cache-Control
 * - Upserts `central_medicines` as `verified` with indexed `normalized_core_key`
 * - Propagates immediately to all matching pharmacy storefronts
 */
export async function bulkUploadVerifiedCentralImages(
  env: StorefrontWorkerEnv,
  actorId: string,
  items: BulkVerifiedImageItem[]
): Promise<{
  uploaded: number;
  deduplicated: number;
  propagated_products: number;
  failed: Array<{ name: string; error: string }>;
}> {
  let uploaded = 0;
  let deduplicated = 0;
  let propagatedProducts = 0;
  const failed: Array<{ name: string; error: string }> = [];
  const nowIso = new Date().toISOString();

  for (const item of items) {
    const exactName = String(item.master_catalog_name || "").trim();
    if (!exactName) {
      failed.push({ name: "(empty)", error: "missing_master_catalog_name" });
      continue;
    }

    try {
      const cleanedBase64 = String(item.data_base64 || "").replace(/^data:[^;]+;base64,/, "");
      const contentType = String(item.content_type || "image/webp").toLowerCase();
      const contentHash = String(item.sha256_hex || "").trim().toLowerCase();
      if (!cleanedBase64 || !contentHash) {
        failed.push({ name: exactName, error: "missing_image_payload_or_hash" });
        continue;
      }

      const estimatedBytes = Math.ceil((cleanedBase64.length * 3) / 4);
      const byteSize = Number(item.byte_size ?? estimatedBytes);
      if (byteSize > 650 * 1024) {
        failed.push({ name: exactName, error: "exceeds_650kb_limit" });
        continue;
      }

      // 1. Check SHA-256 deduplication in shared media
      const existingMedia = await env.DB.prepare(
        `SELECT id, public_url, r2_object_key FROM storefront_media WHERE sha256_hex = ? AND is_shared = 1 LIMIT 1`
      )
        .bind(contentHash)
        .first<{ id: string; public_url: string; r2_object_key: string }>();

      let mediaId: string;
      let publicUrl: string;
      const logicalFileName = item.logical_file_name || `${exactName}.webp`;

      if (existingMedia) {
        mediaId = String(existingMedia.id);
        publicUrl = String(existingMedia.public_url);
        deduplicated++;
      } else {
        mediaId = `sfm_shared_${crypto.randomUUID().slice(0, 12)}`;
        const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : "webp";
        const r2Key = `shared/medicines/${contentHash}.${ext}`;

        if (env.MEDIA_BUCKET) {
          const bin = atob(cleanedBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

          await env.MEDIA_BUCKET.put(r2Key, bytes, {
            httpMetadata: {
              contentType,
              cacheControl: "public, max-age=31536000, immutable",
            },
            customMetadata: {
              is_shared: "true",
              sha256_hex: contentHash,
              logical_name: logicalFileName.slice(0, 120),
              uploaded_by: actorId,
            },
          });
        }

        publicUrl = resolveSharedMediaPublicUrl(env, mediaId, r2Key);
        await env.DB.prepare(
          `INSERT INTO storefront_media (
             id, storefront_id, pharmacy_id, r2_object_key, public_url,
             content_type, byte_size, width, height, sha256_hex, purpose,
             is_shared, verification_status, source_type, logical_file_name,
             rights_status, uploaded_by, created_at
           ) VALUES (?, 'sf_central_library', 'pharmacy_central_platform', ?, ?, ?, ?, ?, ?, ?, 'product_image', 1, 'verified', ?, ?, 'verified_bulk_import', ?, ?)`
        )
          .bind(
            mediaId,
            r2Key,
            publicUrl,
            contentType,
            byteSize,
            item.width ? Number(item.width) : null,
            item.height ? Number(item.height) : null,
            contentHash,
            item.source_type || "bulk_zip_import",
            logicalFileName,
            actorId,
            nowIso
          )
          .run();
        uploaded++;
      }

      // 2. Upsert verified canonical medicine
      const masterId = item.master_catalog_id ? String(item.master_catalog_id).trim() : null;
      const canonicalId = masterId
        ? `cmed_m_${masterId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
        : `cmed_${crypto.randomUUID()}`;
      const normName = exactName.toLowerCase().replace(/\s+/g, " ");
      const coreKey = computeNormalizedCoreKey(exactName) || computeNormalizedCoreKey(item.brand_name) || null;

      await env.DB.prepare(
        `INSERT INTO central_medicines (
           id, canonical_name, master_catalog_id, master_catalog_name, normalized_catalog_name, normalized_core_key,
           allow_strengthless_match, brand_name, generic_name, strength, dosage_form, manufacturer, barcode,
           verification_status, preferred_media_id, image_source, image_rights_status, logical_file_name,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, 'bulk_zip_import', 'verified_bulk_import', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           canonical_name = excluded.canonical_name,
           master_catalog_id = COALESCE(excluded.master_catalog_id, central_medicines.master_catalog_id),
           master_catalog_name = COALESCE(excluded.master_catalog_name, central_medicines.master_catalog_name),
           normalized_catalog_name = excluded.normalized_catalog_name,
           normalized_core_key = COALESCE(excluded.normalized_core_key, central_medicines.normalized_core_key),
           brand_name = COALESCE(excluded.brand_name, central_medicines.brand_name),
           generic_name = COALESCE(excluded.generic_name, central_medicines.generic_name),
           strength = COALESCE(excluded.strength, central_medicines.strength),
           dosage_form = COALESCE(excluded.dosage_form, central_medicines.dosage_form),
           manufacturer = COALESCE(excluded.manufacturer, central_medicines.manufacturer),
           barcode = COALESCE(excluded.barcode, central_medicines.barcode),
           verification_status = 'verified',
           preferred_media_id = excluded.preferred_media_id,
           image_source = 'bulk_zip_import',
           logical_file_name = excluded.logical_file_name,
           updated_at = excluded.updated_at`
      )
        .bind(
          canonicalId,
          exactName,
          masterId,
          exactName,
          normName,
          coreKey,
          item.allow_strengthless_match ? 1 : 0,
          item.brand_name?.trim() || null,
          item.generic_name?.trim() || null,
          item.strength?.trim() || null,
          item.dosage_form?.trim() || null,
          item.manufacturer?.trim() || null,
          item.barcode?.trim() || null,
          mediaId,
          logicalFileName,
          nowIso,
          nowIso
        )
        .run();

      // Also mark discovery queue verified if it was imported there
      if (masterId) {
        await env.DB.prepare(
          `UPDATE medicine_image_discovery_queue
           SET status = 'verified', approved_media_id = ?, updated_at = ?
           WHERE master_catalog_id = ?`
        )
          .bind(mediaId, nowIso, masterId)
          .run()
          .catch(() => {});
      }

      // 3. Fast indexed propagation across all pharmacy websites
      const prop = await matchAndPropagateCanonicalMedicine(env.DB, canonicalId);
      propagatedProducts += prop.matchedCount;
      void publicUrl;
    } catch (err: any) {
      failed.push({ name: exactName, error: String(err?.message || "bulk_upload_error") });
    }
  }

  return {
    uploaded,
    deduplicated,
    propagated_products: propagatedProducts,
    failed,
  };
}

/**
 * Batch-matches existing published storefront products against verified central medicines
 * without POS re-upload. Runs in safe, bounded batches (e.g. 100 products per request).
 */
export async function batchMatchStorefrontProducts(
  db: D1Database,
  batchSize = 100,
  offset = 0,
  storefrontId?: string
) {
  // 1. Load active verified canonical medicines with an assigned image
  const { results: canonicalRows } = await db
    .prepare(
      `SELECT
         c.id, c.canonical_name, c.master_catalog_id, c.master_catalog_name, c.normalized_catalog_name,
         c.brand_name, c.generic_name, c.strength, c.dosage_form, c.manufacturer, c.pack_size,
         c.pack_unit, c.barcode, c.aliases_json, c.verification_status,
         c.preferred_media_id, m.public_url AS preferred_image_url
       FROM central_medicines c
       INNER JOIN storefront_media m ON c.preferred_media_id = m.id
       WHERE c.verification_status = 'verified' AND c.preferred_media_id IS NOT NULL`
    )
    .all<Record<string, unknown>>();

  const canonicalCatalog: (CanonicalMedicineRecord & { preferred_image_url: string })[] =
    (canonicalRows || []).map((r) => ({
      id: String(r.id),
      canonical_name: String(r.canonical_name),
      master_catalog_id: r.master_catalog_id ? String(r.master_catalog_id) : null,
      master_catalog_name: r.master_catalog_name ? String(r.master_catalog_name) : null,
      normalized_catalog_name: r.normalized_catalog_name ? String(r.normalized_catalog_name) : null,
      brand_name: r.brand_name ? String(r.brand_name) : null,
      generic_name: r.generic_name ? String(r.generic_name) : null,
      strength: r.strength ? String(r.strength) : null,
      dosage_form: r.dosage_form ? String(r.dosage_form) : null,
      manufacturer: r.manufacturer ? String(r.manufacturer) : null,
      pack_size: r.pack_size ? Number(r.pack_size) : null,
      pack_unit: r.pack_unit ? String(r.pack_unit) : null,
      barcode: r.barcode ? String(r.barcode) : null,
      aliases_json: r.aliases_json ? String(r.aliases_json) : null,
      verification_status: String(r.verification_status),
      preferred_media_id: String(r.preferred_media_id),
      preferred_image_url: String(r.preferred_image_url),
    }));

  if (canonicalCatalog.length === 0) {
    return {
      processed: 0,
      matched: 0,
      hasMore: false,
      nextOffset: offset,
      message: "No verified canonical medicines with shared images exist in library.",
    };
  }

  // 2. Select products eligible for matching (not owner overrides)
  let prodSql = `
    SELECT id, storefront_id, pharmacy_id, pos_product_id, master_medicine_id, name, generic_name,
           strength, dosage_form, brand_name, packing_label, unit_label,
           sku_code, primary_image_url, image_source, canonical_medicine_id
    FROM storefront_products
    WHERE image_source != 'owner_override'
  `;
  const prodBinds: unknown[] = [];
  if (storefrontId) {
    prodSql += ` AND storefront_id = ?`;
    prodBinds.push(storefrontId);
  }
  prodSql += ` ORDER BY id ASC LIMIT ? OFFSET ?`;
  prodBinds.push(batchSize, offset);

  const { results: productRows } = await db
    .prepare(prodSql)
    .bind(...prodBinds)
    .all<Record<string, unknown>>();

  const products = productRows || [];
  let matchedCount = 0;
  const now = new Date().toISOString();

  for (const p of products) {
    const input: ProductInput = {
      name: String(p.name || ""),
      generic_name: p.generic_name ? String(p.generic_name) : null,
      strength: p.strength ? String(p.strength) : null,
      dosage_form: p.dosage_form ? String(p.dosage_form) : null,
      brand_name: p.brand_name ? String(p.brand_name) : null,
      packing_label: p.packing_label ? String(p.packing_label) : null,
      unit_label: p.unit_label ? String(p.unit_label) : null,
      sku_code: p.sku_code ? String(p.sku_code) : null,
      barcode: p.sku_code ? String(p.sku_code) : null,
      master_medicine_id: p.master_medicine_id ? String(p.master_medicine_id) : null,
    };

    const matchRes = matchMedicineIdentity(input, canonicalCatalog);
    if (matchRes.matched && matchRes.canonicalId && matchRes.preferredMediaId) {
      const canonicalMatch = canonicalCatalog.find((c) => c.id === matchRes.canonicalId);
      const imageUrl = canonicalMatch?.preferred_image_url;

      if (imageUrl) {
        await db
          .prepare(
            `UPDATE storefront_products
             SET canonical_medicine_id = ?,
                 selected_media_id = ?,
                 primary_image_url = ?,
                 image_source = 'shared_library',
                 updated_at = ?
             WHERE id = ?`
          )
          .bind(
            matchRes.canonicalId,
            matchRes.preferredMediaId,
            imageUrl,
            now,
            p.id
          )
          .run();
        matchedCount++;
      }
    } else if (p.image_source === "shared_library") {
      // Previously linked to shared library, but no longer qualifies under strict clinical rules
      await db
        .prepare(
          `UPDATE storefront_products
           SET canonical_medicine_id = NULL,
               selected_media_id = NULL,
               primary_image_url = NULL,
               image_source = 'none',
               updated_at = ?
           WHERE id = ?`
        )
        .bind(now, p.id)
        .run();
    }
  }

  const processed = products.length;
  const hasMore = processed === batchSize;

  return {
    processed,
    matched: matchedCount,
    hasMore,
    nextOffset: offset + processed,
    message: `Processed ${processed} products, matched ${matchedCount} to shared library images.`,
  };
}

/**
 * Assigns or reverts a pharmacy product's image with strict tenant authorization
 */
export async function assignProductImage(
  db: D1Database,
  sfId: string,
  pharmacyId: string,
  posProductId: string,
  action: "set_owner_override" | "select_shared" | "revert_to_shared" | "submit_for_library",
  payload?: {
    media_id?: string;
    image_url?: string;
    canonical_id?: string;
  }
) {
  const now = new Date().toISOString();
  const prod = await db
    .prepare(
      `SELECT * FROM storefront_products
       WHERE (id = ? OR pos_product_id = ?) AND storefront_id = ? AND pharmacy_id = ?
       LIMIT 1`
    )
    .bind(posProductId, posProductId, sfId, pharmacyId)
    .first<Record<string, unknown>>();

  if (!prod) {
    throw new Error("Product not found in this pharmacy's storefront.");
  }

  if (action === "set_owner_override") {
    if (!payload?.image_url) {
      throw new Error("image_url is required for owner override.");
    }
    await db
      .prepare(
        `UPDATE storefront_products
         SET primary_image_url = ?,
             selected_media_id = ?,
             image_source = 'owner_override',
             updated_at = ?
         WHERE id = ?`
      )
      .bind(payload.image_url, payload.media_id || null, now, prod.id)
      .run();
    return { ok: true, image_source: "owner_override", image_url: payload.image_url };
  }

  if (action === "select_shared") {
    if (!payload?.media_id) {
      throw new Error("media_id is required to select shared library image.");
    }
    // Verify media is truly shared or verified
    const mediaRow = await db
      .prepare(
        `SELECT id, public_url, is_shared FROM storefront_media
         WHERE id = ? AND (is_shared = 1 OR (storefront_id = ? AND pharmacy_id = ?))
         LIMIT 1`
      )
      .bind(payload.media_id, sfId, pharmacyId)
      .first<{ id: string; public_url: string; is_shared: number }>();

    if (!mediaRow) {
      throw new Error("Requested shared media asset not found or not approved for sharing.");
    }

    await db
      .prepare(
        `UPDATE storefront_products
         SET primary_image_url = ?,
             selected_media_id = ?,
             canonical_medicine_id = COALESCE(?, canonical_medicine_id),
             image_source = 'shared_library',
             updated_at = ?
         WHERE id = ?`
      )
      .bind(mediaRow.public_url, mediaRow.id, payload.canonical_id || null, now, prod.id)
      .run();

    return { ok: true, image_source: "shared_library", image_url: mediaRow.public_url };
  }

  if (action === "revert_to_shared") {
    // If linked to canonical_medicine_id, restore its preferred image, else remove override
    let resolvedUrl: string | null = null;
    let selectedMediaId: string | null = null;
    let newSource = "none";

    if (prod.canonical_medicine_id) {
      const canRow = await db
        .prepare(
          `SELECT c.preferred_media_id, m.public_url
           FROM central_medicines c
           LEFT JOIN storefront_media m ON c.preferred_media_id = m.id
           WHERE c.id = ? LIMIT 1`
        )
        .bind(prod.canonical_medicine_id)
        .first<{ preferred_media_id?: string; public_url?: string }>();

      if (canRow?.public_url) {
        resolvedUrl = canRow.public_url;
        selectedMediaId = canRow.preferred_media_id || null;
        newSource = "shared_library";
      }
    }

    await db
      .prepare(
        `UPDATE storefront_products
         SET primary_image_url = ?,
             selected_media_id = ?,
             image_source = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(resolvedUrl, selectedMediaId, newSource, now, prod.id)
      .run();

    return { ok: true, image_source: newSource, image_url: resolvedUrl };
  }

  if (action === "submit_for_library") {
    if (!payload?.media_id) {
      throw new Error("media_id is required to submit image to central library.");
    }

    const subId = `csub_${crypto.randomUUID()}`;
    await db
      .prepare(
        `INSERT INTO central_image_submissions (
           id, media_id, pharmacy_id, storefront_id, pos_product_id,
           product_name_snapshot, generic_snapshot, strength_snapshot,
           dosage_form_snapshot, brand_snapshot, status, target_canonical_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .bind(
        subId,
        payload.media_id,
        pharmacyId,
        sfId,
        String(prod.pos_product_id),
        String(prod.name),
        prod.generic_name ? String(prod.generic_name) : null,
        prod.strength ? String(prod.strength) : null,
        prod.dosage_form ? String(prod.dosage_form) : null,
        prod.brand_name ? String(prod.brand_name) : null,
        prod.canonical_medicine_id ? String(prod.canonical_medicine_id) : null,
        now
      )
      .run();

    return { ok: true, submission_id: subId, status: "pending" };
  }

  throw new Error(`Unknown action: ${action}`);
}

// ============================================================================
// Automatic Master Catalog Image Discovery Queue & Collector Integration
// ============================================================================

export interface MasterCatalogImportItem {
  master_catalog_id: string;
  master_catalog_name: string;
  brand?: string | null;
  generic?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer?: string | null;
  pack_size?: number | null;
  pack_unit?: string | null;
  barcode?: string | null;
}

export interface DiscoveryQueueOverview {
  total_imported: number;
  pending: number;
  searching: number;
  candidate_found: number;
  verified: number;
  needs_review: number;
  not_found: number;
  failed: number;
  auto_approve_strict: boolean;
  daily_search_limit: number;
  daily_searches_used: number;
  collector_status: string;
  enabled_sources: string[];
}

export async function importMasterCatalogToDiscoveryQueue(
  db: D1Database,
  items: MasterCatalogImportItem[]
): Promise<{ importedCount: number; updatedCount: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { importedCount: 0, updatedCount: 0 };
  }

  const now = new Date().toISOString();
  let importedCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const rawId = String(item.master_catalog_id || "").trim();
    const rawName = String(item.master_catalog_name || "").trim();
    if (!rawId || !rawName) continue;

    const normName = rawName.toLowerCase().replace(/\s+/g, " ");

    // Check if any pharmacy storefront currently publishes this product (high priority = 1, regular = 5)
    const publishedCheck = await db
      .prepare(
        `SELECT 1 FROM storefront_products
         WHERE (master_medicine_id = ? OR LOWER(name) = ?)
           AND publish_status = 'published'
         LIMIT 1`
      )
      .bind(rawId, normName)
      .first();

    const priority = publishedCheck ? 1 : 5;

    // Check if an approved verified image already exists for this master ID
    const existingVerified = await db
      .prepare(
        `SELECT preferred_media_id FROM central_medicines
         WHERE master_catalog_id = ? AND preferred_media_id IS NOT NULL
         LIMIT 1`
      )
      .bind(rawId)
      .first<{ preferred_media_id?: string }>();

    const status = existingVerified?.preferred_media_id ? "verified" : "pending";
    const approvedMediaId = existingVerified?.preferred_media_id || null;
    const queueId = `mdis_${rawId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    await db
      .prepare(
        `INSERT INTO medicine_image_discovery_queue (
           id, master_catalog_id, master_catalog_name, normalized_catalog_name,
           brand, generic, strength, dosage_form, manufacturer,
           pack_size, pack_unit, barcode, priority, status, approved_media_id,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(master_catalog_id) DO UPDATE SET
           master_catalog_name = excluded.master_catalog_name,
           normalized_catalog_name = excluded.normalized_catalog_name,
           brand = COALESCE(excluded.brand, medicine_image_discovery_queue.brand),
           generic = COALESCE(excluded.generic, medicine_image_discovery_queue.generic),
           strength = COALESCE(excluded.strength, medicine_image_discovery_queue.strength),
           dosage_form = COALESCE(excluded.dosage_form, medicine_image_discovery_queue.dosage_form),
           manufacturer = COALESCE(excluded.manufacturer, medicine_image_discovery_queue.manufacturer),
           barcode = COALESCE(excluded.barcode, medicine_image_discovery_queue.barcode),
           priority = CASE WHEN excluded.priority < medicine_image_discovery_queue.priority THEN excluded.priority ELSE medicine_image_discovery_queue.priority END,
           status = CASE WHEN medicine_image_discovery_queue.status = 'verified' THEN 'verified' ELSE excluded.status END,
           approved_media_id = COALESCE(medicine_image_discovery_queue.approved_media_id, excluded.approved_media_id),
           updated_at = excluded.updated_at`
      )
      .bind(
        queueId,
        rawId,
        rawName,
        normName,
        item.brand?.trim() || null,
        item.generic?.trim() || null,
        item.strength?.trim() || null,
        item.dosage_form?.trim() || null,
        item.manufacturer?.trim() || null,
        item.pack_size ?? null,
        item.pack_unit?.trim() || null,
        item.barcode?.trim() || null,
        priority,
        status,
        approvedMediaId,
        now,
        now
      )
      .run();

    // Ensure central_medicines also preserves this Master Catalog medicine
    const canonicalId = `cmed_m_${rawId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const logicalFileName = `${rawName}.webp`;

    await db
      .prepare(
        `INSERT INTO central_medicines (
           id, canonical_name, master_catalog_id, master_catalog_name, normalized_catalog_name,
           brand_name, generic_name, strength, dosage_form, manufacturer, pack_size, pack_unit, barcode,
           verification_status, logical_file_name, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           master_catalog_id = COALESCE(excluded.master_catalog_id, central_medicines.master_catalog_id),
           master_catalog_name = COALESCE(excluded.master_catalog_name, central_medicines.master_catalog_name),
           normalized_catalog_name = COALESCE(excluded.normalized_catalog_name, central_medicines.normalized_catalog_name),
           updated_at = excluded.updated_at`
      )
      .bind(
        canonicalId,
        rawName,
        rawId,
        rawName,
        normName,
        item.brand?.trim() || null,
        item.generic?.trim() || null,
        item.strength?.trim() || null,
        item.dosage_form?.trim() || null,
        item.manufacturer?.trim() || null,
        item.pack_size ?? null,
        item.pack_unit?.trim() || null,
        item.barcode?.trim() || null,
        logicalFileName,
        now,
        now
      )
      .run();

    importedCount++;
  }

  return { importedCount, updatedCount };
}

export async function getDiscoveryQueueOverview(
  db: D1Database
): Promise<DiscoveryQueueOverview> {
  const [countsRow, settingsRow] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS total_imported,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'searching' THEN 1 ELSE 0 END) AS searching,
           SUM(CASE WHEN status = 'candidate_found' THEN 1 ELSE 0 END) AS candidate_found,
           SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review,
           SUM(CASE WHEN status = 'not_found' THEN 1 ELSE 0 END) AS not_found,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM medicine_image_discovery_queue`
      )
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT auto_approve_strict, daily_search_limit, daily_searches_used, enabled_sources_json, collector_status
         FROM image_collector_settings
         WHERE id = 'default'`
      )
      .first<Record<string, unknown>>(),
  ]);

  let sources: string[] = ["wikimedia"];
  try {
    if (settingsRow?.enabled_sources_json) {
      sources = JSON.parse(String(settingsRow.enabled_sources_json));
    }
  } catch {
    // fallback
  }

  return {
    total_imported: Number(countsRow?.total_imported || 0),
    pending: Number(countsRow?.pending || 0),
    searching: Number(countsRow?.searching || 0),
    candidate_found: Number(countsRow?.candidate_found || 0),
    verified: Number(countsRow?.verified || 0),
    needs_review: Number(countsRow?.needs_review || 0),
    not_found: Number(countsRow?.not_found || 0),
    failed: Number(countsRow?.failed || 0),
    auto_approve_strict: Number(settingsRow?.auto_approve_strict || 0) === 1,
    daily_search_limit: Number(settingsRow?.daily_search_limit || 500),
    daily_searches_used: Number(settingsRow?.daily_searches_used || 0),
    collector_status: String(settingsRow?.collector_status || "idle"),
    enabled_sources: sources,
  };
}

export async function listDiscoveryQueueItems(
  db: D1Database,
  options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    priority?: number;
  }
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(5, options.limit || 20));
  const offset = (page - 1) * limit;

  const whereClauses: string[] = ["1=1"];
  const bindValues: unknown[] = [];

  if (options.status && options.status !== "all") {
    whereClauses.push("status = ?");
    bindValues.push(options.status);
  }

  if (options.search && options.search.trim()) {
    whereClauses.push(
      "(LOWER(master_catalog_name) LIKE ? OR LOWER(master_catalog_id) LIKE ? OR LOWER(generic) LIKE ?)"
    );
    const term = `%${options.search.trim().toLowerCase()}%`;
    bindValues.push(term, term, term);
  }

  if (options.priority) {
    whereClauses.push("priority = ?");
    bindValues.push(options.priority);
  }

  const whereSql = whereClauses.join(" AND ");

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM medicine_image_discovery_queue WHERE ${whereSql}`)
    .bind(...bindValues)
    .first<{ total: number }>();
  const totalCount = Number(countRow?.total || 0);

  const { results } = await db
    .prepare(
      `SELECT q.*, m.public_url AS approved_image_url
       FROM medicine_image_discovery_queue q
       LEFT JOIN storefront_media m ON q.approved_media_id = m.id
       WHERE ${whereSql}
       ORDER BY q.priority ASC, q.updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...bindValues, limit, offset)
    .all<Record<string, unknown>>();

  return {
    items: (results || []).map((r) => ({
      ...r,
      candidate_results: typeof r.candidate_results_json === "string" ? JSON.parse(r.candidate_results_json || "[]") : [],
    })),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function getDiscoveryBatchForCollector(
  db: D1Database,
  limit = 10
): Promise<{ ok: boolean; items: Record<string, unknown>[]; paused?: boolean; message?: string }> {
  // Check settings and daily quota
  const settings = await db
    .prepare(
      `SELECT auto_approve_strict, daily_search_limit, daily_searches_used, collector_status, last_reset_date
       FROM image_collector_settings
       WHERE id = 'default'`
    )
    .first<{
      auto_approve_strict: number;
      daily_search_limit: number;
      daily_searches_used: number;
      collector_status: string;
      last_reset_date: string | null;
    }>();

  if (settings && settings.collector_status === "paused") {
    return { ok: false, items: [], paused: true, message: "Image discovery collector is currently paused." };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  let dailyUsed = Number(settings?.daily_searches_used || 0);

  if (settings && settings.last_reset_date !== todayStr) {
    // Reset daily counter
    await db
      .prepare(`UPDATE image_collector_settings SET daily_searches_used = 0, last_reset_date = ? WHERE id = 'default'`)
      .bind(todayStr)
      .run();
    dailyUsed = 0;
  }

  const dailyLimit = Number(settings?.daily_search_limit || 500);
  if (dailyUsed >= dailyLimit) {
    return {
      ok: false,
      items: [],
      paused: true,
      message: `Daily search limit reached (${dailyUsed}/${dailyLimit}). Pausing until next reset.`,
    };
  }

  const batchSize = Math.min(limit, dailyLimit - dailyUsed);
  if (batchSize <= 0) {
    return { ok: true, items: [] };
  }

  const now = new Date().toISOString();

  // Pick highest priority items that are pending or ready for retry
  const { results } = await db
    .prepare(
      `SELECT * FROM medicine_image_discovery_queue
       WHERE status = 'pending'
          OR (status = 'retry_scheduled' AND next_retry_at <= ?)
       ORDER BY priority ASC, updated_at ASC
       LIMIT ?`
    )
    .bind(now, batchSize)
    .all<Record<string, unknown>>();

  const items = results || [];
  if (items.length > 0) {
    const ids = items.map((i) => String(i.id));
    const placeholders = ids.map(() => "?").join(",");
    await db
      .prepare(
        `UPDATE medicine_image_discovery_queue
         SET status = 'searching', last_searched_at = ?, attempt_count = attempt_count + 1, updated_at = ?
         WHERE id IN (${placeholders})`
      )
      .bind(now, now, ...ids)
      .run();

    await db
      .prepare(`UPDATE image_collector_settings SET daily_searches_used = daily_searches_used + ? WHERE id = 'default'`)
      .bind(items.length)
      .run();
  }

  return { ok: true, items };
}

export async function submitDiscoveryResult(
  db: D1Database,
  queueId: string,
  result: {
    status: "candidate_found" | "not_found" | "failed";
    source: string;
    candidates?: any[];
    error?: string;
  }
) {
  const now = new Date().toISOString();
  const queueItem = await db
    .prepare(`SELECT * FROM medicine_image_discovery_queue WHERE id = ?`)
    .bind(queueId)
    .first<Record<string, any>>();

  if (!queueItem) {
    throw new Error(`Queue item ${queueId} not found.`);
  }

  if (result.status === "candidate_found" && Array.isArray(result.candidates) && result.candidates.length > 0) {
    const settings = await db
      .prepare(`SELECT auto_approve_strict FROM image_collector_settings WHERE id = 'default'`)
      .first<{ auto_approve_strict: number }>();

    const autoApprove = Number(settings?.auto_approve_strict || 0) === 1;

    // Check if the top candidate has high confidence and verified license
    const top = result.candidates[0];
    const isStrictMatch =
      top.confidence_score >= 0.95 &&
      top.rights_verified === true &&
      top.strength_match === true &&
      top.dosage_form_match === true;

    if (autoApprove && isStrictMatch) {
      return await approveDiscoveryCandidate(db, queueId, {
        image_url: top.image_url,
        r2_key: top.r2_key,
        media_id: top.media_id,
        rights_status: top.license || "open_license",
        attribution: top.attribution || null,
        source_type: result.source,
      });
    }

    // Otherwise mark needs_review for Super Admin
    await db
      .prepare(
        `UPDATE medicine_image_discovery_queue
         SET status = 'needs_review',
             source_searched = ?,
             candidate_results_json = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(result.source, JSON.stringify(result.candidates), now, queueId)
      .run();

    return { ok: true, status: "needs_review" };
  }

  if (result.status === "not_found") {
    await db
      .prepare(
        `UPDATE medicine_image_discovery_queue
         SET status = 'not_found', source_searched = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(result.source, now, queueId)
      .run();
    return { ok: true, status: "not_found" };
  }

  // Handle failure & retry schedule
  const attempts = Number(queueItem.attempt_count || 1);
  if (attempts < 3) {
    const retryAfterHours = attempts === 1 ? 1 : 4;
    const nextRetry = new Date(Date.now() + retryAfterHours * 3600 * 1000).toISOString();
    await db
      .prepare(
        `UPDATE medicine_image_discovery_queue
         SET status = 'retry_scheduled', next_retry_at = ?, error_details = ?, source_searched = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(nextRetry, result.error || "Temporary search failure", result.source, now, queueId)
      .run();
    return { ok: true, status: "retry_scheduled", next_retry_at: nextRetry };
  }

  await db
    .prepare(
      `UPDATE medicine_image_discovery_queue
       SET status = 'failed', error_details = ?, source_searched = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(result.error || "Max attempts exceeded", result.source, now, queueId)
    .run();

  return { ok: true, status: "failed" };
}

export async function approveDiscoveryCandidate(
  db: D1Database,
  queueId: string,
  candidate: {
    media_id?: string;
    image_url?: string;
    r2_key?: string;
    source_type?: string;
    rights_status?: string;
    attribution?: string;
    byte_size?: number;
    width?: number;
    height?: number;
    sha256_hex?: string;
  }
) {
  const queueItem = await db
    .prepare(`SELECT * FROM medicine_image_discovery_queue WHERE id = ?`)
    .bind(queueId)
    .first<Record<string, any>>();

  if (!queueItem) {
    throw new Error(`Queue item ${queueId} not found.`);
  }

  const now = new Date().toISOString();
  let mediaId = candidate.media_id;
  const masterId = String(queueItem.master_catalog_id);
  const masterName = String(queueItem.master_catalog_name);
  const logicalFileName = `${masterName}.webp`;

  // If candidate is a direct upload or existing media
  if (!mediaId && candidate.image_url) {
    mediaId = `sfm_shared_${crypto.randomUUID().slice(0, 12)}`;
    const r2Key = candidate.r2_key || `shared/medicines/${mediaId}.webp`;

    await db
      .prepare(
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
        candidate.image_url,
        candidate.byte_size || 45000,
        candidate.width || 600,
        candidate.height || 600,
        candidate.sha256_hex || null,
        candidate.source_type || "image_collector",
        logicalFileName,
        candidate.rights_status || "open_license",
        candidate.attribution || null,
        now
      )
      .run();
  }

  if (!mediaId) {
    throw new Error("Cannot approve candidate without a valid media reference.");
  }

  // Update central_medicines
  const canonicalId = `cmed_m_${masterId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  await db
    .prepare(
      `INSERT INTO central_medicines (
         id, canonical_name, master_catalog_id, master_catalog_name, normalized_catalog_name,
         brand_name, generic_name, strength, dosage_form, manufacturer, pack_size, pack_unit, barcode,
         verification_status, preferred_media_id, image_source, image_rights_status, logical_file_name,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, 'collector', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         preferred_media_id = excluded.preferred_media_id,
         verification_status = 'verified',
         image_source = excluded.image_source,
         image_rights_status = excluded.image_rights_status,
         logical_file_name = excluded.logical_file_name,
         updated_at = excluded.updated_at`
    )
    .bind(
      canonicalId,
      masterName,
      masterId,
      masterName,
      queueItem.normalized_catalog_name,
      queueItem.brand,
      queueItem.generic,
      queueItem.strength,
      queueItem.dosage_form,
      queueItem.manufacturer,
      queueItem.pack_size,
      queueItem.pack_unit,
      queueItem.barcode,
      mediaId,
      candidate.rights_status || "open_license",
      logicalFileName,
      now,
      now
    )
    .run();

  // Mark queue item verified
  await db
    .prepare(
      `UPDATE medicine_image_discovery_queue
       SET status = 'verified', approved_media_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(mediaId, now, queueId)
    .run();

  // Automatically propagate to every pharmacy website having this Master Catalog medicine!
  const propRes = await matchAndPropagateCanonicalMedicine(db, canonicalId);

  return { ok: true, status: "verified", media_id: mediaId, propagated_count: propRes.matchedCount };
}

export async function rejectDiscoveryCandidate(
  db: D1Database,
  queueId: string,
  reason?: string
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE medicine_image_discovery_queue
       SET status = 'not_found', error_details = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(reason || "Candidate rejected during review", now, queueId)
    .run();
  return { ok: true, status: "not_found" };
}

export async function updateCollectorSettings(
  db: D1Database,
  settings: {
    auto_approve_strict?: boolean;
    daily_search_limit?: number;
    collector_status?: "idle" | "running" | "paused";
    enabled_sources?: string[];
  }
) {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const binds: unknown[] = [now];

  if (settings.auto_approve_strict !== undefined) {
    sets.push("auto_approve_strict = ?");
    binds.push(settings.auto_approve_strict ? 1 : 0);
  }
  if (settings.daily_search_limit !== undefined) {
    sets.push("daily_search_limit = ?");
    binds.push(Math.max(10, Math.min(5000, Number(settings.daily_search_limit))));
  }
  if (settings.collector_status !== undefined) {
    sets.push("collector_status = ?");
    binds.push(settings.collector_status);
  }
  if (Array.isArray(settings.enabled_sources)) {
    sets.push("enabled_sources_json = ?");
    binds.push(JSON.stringify(settings.enabled_sources));
  }

  await db
    .prepare(`UPDATE image_collector_settings SET ${sets.join(", ")} WHERE id = 'default'`)
    .bind(...binds)
    .run();

  return await getDiscoveryQueueOverview(db);
}

export async function retryFailedDiscoveryJobs(db: D1Database): Promise<{ resetCount: number }> {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE medicine_image_discovery_queue
       SET status = 'pending', attempt_count = 0, error_details = NULL, updated_at = ?
       WHERE status IN ('failed', 'retry_scheduled', 'not_found')`
    )
    .bind(now)
    .run();
  return { resetCount: res.meta.changes || 0 };
}

