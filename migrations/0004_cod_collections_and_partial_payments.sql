-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — COD RECEIVABLE & PARTIAL COLLECTIONS MIGRATION
-- Migration: 0004_cod_collections_and_partial_payments.sql
-- Direction: UP (100% additive, preserves all existing live orders & items)
-- ============================================================================

ALTER TABLE storefront_orders ADD COLUMN cod_paid_amount_pkr REAL NOT NULL DEFAULT 0;
ALTER TABLE storefront_orders ADD COLUMN cod_balance_due_pkr REAL;
ALTER TABLE storefront_orders ADD COLUMN cod_last_collection_at TEXT;
ALTER TABLE storefront_orders ADD COLUMN cod_collections_json TEXT;
