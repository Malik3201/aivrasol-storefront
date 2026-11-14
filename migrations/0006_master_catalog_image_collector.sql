-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — MASTER CATALOG FIRST IMAGE COLLECTOR
-- Migration: 0006_master_catalog_image_collector.sql
-- Direction: UP (100% additive, strictly preserves existing data)
-- ============================================================================

-- 1. Extend central_medicines with Master Catalog Identity & Image Metadata
ALTER TABLE central_medicines ADD COLUMN master_catalog_id TEXT;
ALTER TABLE central_medicines ADD COLUMN master_catalog_name TEXT;
ALTER TABLE central_medicines ADD COLUMN normalized_catalog_name TEXT;
ALTER TABLE central_medicines ADD COLUMN image_source TEXT DEFAULT 'manual';
ALTER TABLE central_medicines ADD COLUMN image_rights_status TEXT DEFAULT 'unknown';
ALTER TABLE central_medicines ADD COLUMN logical_file_name TEXT;

CREATE INDEX IF NOT EXISTS idx_central_med_master_id
  ON central_medicines(master_catalog_id);

CREATE INDEX IF NOT EXISTS idx_central_med_norm_name
  ON central_medicines(normalized_catalog_name);

-- 2. Extend storefront_media with Logical File Name & Licensing Metadata
ALTER TABLE storefront_media ADD COLUMN logical_file_name TEXT;
ALTER TABLE storefront_media ADD COLUMN rights_status TEXT;
ALTER TABLE storefront_media ADD COLUMN attribution_text TEXT;

-- 3. Persistent Medicine Image Discovery Queue
CREATE TABLE IF NOT EXISTS medicine_image_discovery_queue (
  id TEXT PRIMARY KEY,
  master_catalog_id TEXT NOT NULL UNIQUE,
  master_catalog_name TEXT NOT NULL,
  normalized_catalog_name TEXT NOT NULL,
  brand TEXT,
  generic TEXT,
  strength TEXT,
  dosage_form TEXT,
  manufacturer TEXT,
  pack_size REAL,
  pack_unit TEXT,
  barcode TEXT,
  priority INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'searching', 'candidate_found', 'verified', 'needs_review', 'not_found', 'retry_scheduled', 'failed')),
  source_searched TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_searched_at TEXT,
  next_retry_at TEXT,
  candidate_results_json TEXT NOT NULL DEFAULT '[]',
  approved_media_id TEXT,
  error_details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_discovery_queue_status_prio
  ON medicine_image_discovery_queue(status, priority, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_discovery_queue_norm_name
  ON medicine_image_discovery_queue(normalized_catalog_name);

CREATE INDEX IF NOT EXISTS idx_discovery_queue_master_id
  ON medicine_image_discovery_queue(master_catalog_id);

-- 4. Image Collector System Settings & Daily Quota Guard
CREATE TABLE IF NOT EXISTS image_collector_settings (
  id TEXT PRIMARY KEY,
  auto_approve_strict INTEGER NOT NULL DEFAULT 0,
  daily_search_limit INTEGER NOT NULL DEFAULT 500,
  daily_searches_used INTEGER NOT NULL DEFAULT 0,
  last_reset_date TEXT,
  enabled_sources_json TEXT NOT NULL DEFAULT '["wikimedia"]',
  collector_status TEXT NOT NULL DEFAULT 'idle',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO image_collector_settings (id, auto_approve_strict, daily_search_limit, daily_searches_used, collector_status)
VALUES ('default', 0, 500, 0, 'idle');

