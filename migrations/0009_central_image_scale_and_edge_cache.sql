-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — 38K CENTRAL IMAGE SCALE & FREE-TIER EDGE CACHING
-- Migration: 0009_central_image_scale_and_edge_cache.sql
-- Direction: UP (100% additive, preserves all existing storefronts & media)
-- ============================================================================

-- 1. Add indexed normalized_core_key & single-strength matching flag on central_medicines
ALTER TABLE central_medicines ADD COLUMN normalized_core_key TEXT;
ALTER TABLE central_medicines ADD COLUMN allow_strengthless_match INTEGER NOT NULL DEFAULT 0;

-- Partial index for O(1) indexed lookup across 38,000+ verified central medicines
CREATE INDEX IF NOT EXISTS idx_central_med_verified_core_key
  ON central_medicines(normalized_core_key)
  WHERE verification_status = 'verified' AND preferred_media_id IS NOT NULL AND normalized_core_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_central_med_verified_master_id
  ON central_medicines(master_catalog_id)
  WHERE verification_status = 'verified' AND preferred_media_id IS NOT NULL AND master_catalog_id IS NOT NULL;

-- 2. Add indexed normalized_core_key & master_medicine_id index on storefront_products
ALTER TABLE storefront_products ADD COLUMN normalized_core_key TEXT;

CREATE INDEX IF NOT EXISTS idx_storefront_products_master_id
  ON storefront_products(master_medicine_id)
  WHERE master_medicine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_products_core_key_shareable
  ON storefront_products(normalized_core_key)
  WHERE image_source != 'owner_override' AND normalized_core_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_media_sha256_shared
  ON storefront_media(sha256_hex)
  WHERE is_shared = 1 AND sha256_hex IS NOT NULL;
