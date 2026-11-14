-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — MILESTONE 2 & 3 SCHEMA ADDITIONS
-- Migration: 0002_milestone2_3_ordering_media_sync.sql
-- Direction: UP
-- ============================================================================

-- 1. Product catalog overrides, branch stock, popular flags & soft archive
ALTER TABLE storefront_products ADD COLUMN override_price_pkr REAL;
ALTER TABLE storefront_products ADD COLUMN is_popular INTEGER NOT NULL DEFAULT 0;
ALTER TABLE storefront_products ADD COLUMN branch_stock_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE storefront_products ADD COLUMN deleted_at TEXT;

-- 2. Branding rich content (About Pharmacy, Footer, Services)
ALTER TABLE storefront_branding ADD COLUMN about_title TEXT;
ALTER TABLE storefront_branding ADD COLUMN about_content TEXT;
ALTER TABLE storefront_branding ADD COLUMN footer_tagline TEXT;
ALTER TABLE storefront_branding ADD COLUMN services_json TEXT NOT NULL DEFAULT '[]';

-- 3. Storefront operational settings (maintenance mode, stale stock threshold, order limits)
ALTER TABLE storefront_settings ADD COLUMN maintenance_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE storefront_settings ADD COLUMN maintenance_message TEXT;
ALTER TABLE storefront_settings ADD COLUMN stale_stock_threshold_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE storefront_settings ADD COLUMN max_items_per_order INTEGER NOT NULL DEFAULT 25;

-- 4. Online Orders idempotency, tracking token & POS Order Inbox handoff reconciliation
ALTER TABLE storefront_orders ADD COLUMN idempotency_key TEXT;
ALTER TABLE storefront_orders ADD COLUMN tracking_token TEXT;
ALTER TABLE storefront_orders ADD COLUMN pos_handoff_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE storefront_orders ADD COLUMN pos_invoice_id TEXT;
ALTER TABLE storefront_orders ADD COLUMN pos_invoice_number TEXT;
ALTER TABLE storefront_orders ADD COLUMN pos_fulfilled_at TEXT;
ALTER TABLE storefront_orders ADD COLUMN pos_fulfilled_by TEXT;
ALTER TABLE storefront_orders ADD COLUMN rx_inquiry_note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_storefront_orders_idemp
  ON storefront_orders(storefront_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_pos_handoff
  ON storefront_orders(storefront_id, pos_handoff_status, created_at DESC);

-- 5. Media content-hash deduplication & shared medicine references
ALTER TABLE storefront_media ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE storefront_media ADD COLUMN master_medicine_id TEXT;
ALTER TABLE storefront_media ADD COLUMN variants_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_storefront_media_sha256
  ON storefront_media(storefront_id, sha256_hex);

CREATE INDEX IF NOT EXISTS idx_storefront_media_shared_med
  ON storefront_media(is_shared, master_medicine_id);

-- 6. Promotions metadata
ALTER TABLE storefront_promotions ADD COLUMN code TEXT;
ALTER TABLE storefront_promotions ADD COLUMN badge_text TEXT;
ALTER TABLE storefront_promotions ADD COLUMN banner_image_url TEXT;
ALTER TABLE storefront_promotions ADD COLUMN min_order_pkr REAL NOT NULL DEFAULT 0;
ALTER TABLE storefront_promotions ADD COLUMN product_ids_json TEXT NOT NULL DEFAULT '[]';

