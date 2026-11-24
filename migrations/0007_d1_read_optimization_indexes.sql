-- Migration 0007: D1 Read-Efficiency Indexes (Eliminates Full Table Scans on Free Tier)
-- 100% additive, safe, idempotent DDL. Zero business/data mutations.

-- 1. Eliminates full-table scans when counting storefront products referencing canonical_medicines
CREATE INDEX IF NOT EXISTS idx_storefront_products_canonical_id
  ON storefront_products(canonical_medicine_id)
  WHERE canonical_medicine_id IS NOT NULL;

-- 2. Covering index for catalog counts & category rollups without scanning full product rows
CREATE INDEX IF NOT EXISTS idx_storefront_products_count
  ON storefront_products(storefront_id, pharmacy_id, publish_status, is_controlled_substance, category_name);

-- 3. Active order inbox & notification poll index (avoids scanning completed/cancelled historical orders)
CREATE INDEX IF NOT EXISTS idx_storefront_orders_active_poll
  ON storefront_orders(storefront_id, pharmacy_id, status, pos_handoff_status, created_at DESC);

-- 4. Partial index for verified central medicines that actually have a shared image
CREATE INDEX IF NOT EXISTS idx_central_med_verified_media
  ON central_medicines(verification_status, preferred_media_id)
  WHERE verification_status = 'verified' AND preferred_media_id IS NOT NULL;

-- 5. Composite index for batched order-item fetches in POS Order Inbox
CREATE INDEX IF NOT EXISTS idx_storefront_order_items_order_batch
  ON storefront_order_items(storefront_id, pharmacy_id, order_id, created_at ASC);
