-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — CLOUDFLARE D1 INITIAL SCHEMA MIGRATION (REVERSIBLE DOWN)
-- Migration: 0001_initial_storefront_schema.down.sql
-- Direction: DOWN
-- ============================================================================

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS storefront_audit_logs;
DROP TABLE IF EXISTS storefront_usage_daily;
DROP TABLE IF EXISTS storefront_media_references;
DROP TABLE IF EXISTS storefront_media;
DROP TABLE IF EXISTS storefront_import_idempotency;
DROP TABLE IF EXISTS storefront_outbox;
DROP TABLE IF EXISTS storefront_sync_failures;
DROP TABLE IF EXISTS storefront_sync_events;
DROP TABLE IF EXISTS storefront_sync_cursors;
DROP TABLE IF EXISTS storefront_order_events;
DROP TABLE IF EXISTS storefront_order_status_history;
DROP TABLE IF EXISTS storefront_order_items;
DROP TABLE IF EXISTS storefront_orders;
DROP TABLE IF EXISTS storefront_delivery_zones;
DROP TABLE IF EXISTS storefront_banners;
DROP TABLE IF EXISTS storefront_promotions;
DROP TABLE IF EXISTS storefront_product_images;
DROP TABLE IF EXISTS storefront_product_visibility;
DROP TABLE IF EXISTS storefront_product_categories;
DROP TABLE IF EXISTS storefront_products;
DROP TABLE IF EXISTS storefront_categories;
DROP TABLE IF EXISTS storefront_permissions;
DROP TABLE IF EXISTS storefront_branding;
DROP TABLE IF EXISTS storefront_settings;
DROP TABLE IF EXISTS storefront_branches;
DROP TABLE IF EXISTS storefront_domains;
DROP TABLE IF EXISTS storefronts;
DROP TABLE IF EXISTS storefront_schema_migrations;

PRAGMA foreign_keys = ON;

