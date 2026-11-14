-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — LIVE FUNCTIONAL FIXES MIGRATION
-- Migration: 0003_packing_units_payment_and_order_sync.sql
-- Direction: UP (100% additive, preserves all existing rows & foreign keys)
-- ============================================================================

-- 1. Genuine POS Selling Units & Base-Unit Stock Tracking on Storefront Products
ALTER TABLE storefront_products ADD COLUMN selling_units_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE storefront_products ADD COLUMN base_unit_label TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE storefront_products ADD COLUMN available_base_qty REAL NOT NULL DEFAULT 0;

-- 2. Independent Payment Status, Fulfillment Outcome & Adjustment Audit on Orders
ALTER TABLE storefront_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE storefront_orders ADD COLUMN fulfillment_outcome TEXT;
ALTER TABLE storefront_orders ADD COLUMN branch_name_snapshot TEXT;
ALTER TABLE storefront_orders ADD COLUMN delivery_instructions TEXT;
ALTER TABLE storefront_orders ADD COLUMN fulfillment_notes TEXT;
ALTER TABLE storefront_orders ADD COLUMN fulfilled_adjustments_json TEXT;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_status_updated
  ON storefront_orders(storefront_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_payment_status
  ON storefront_orders(storefront_id, payment_status, created_at DESC);

-- 3. Exact Selling Unit, Multiplier, Base Qty & SKU Snapshot on Order Line Items
ALTER TABLE storefront_order_items ADD COLUMN sku_code_snapshot TEXT;
ALTER TABLE storefront_order_items ADD COLUMN selling_unit_id TEXT;
ALTER TABLE storefront_order_items ADD COLUMN selling_unit_name TEXT;
ALTER TABLE storefront_order_items ADD COLUMN unit_multiplier REAL NOT NULL DEFAULT 1;
ALTER TABLE storefront_order_items ADD COLUMN base_qty_required REAL NOT NULL DEFAULT 1;

