-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — CENTRAL SMART MEDICINE IMAGE LIBRARY
-- Migration: 0005_central_medicine_image_library.sql
-- Direction: UP (100% additive, strictly preserves existing storefronts & media)
-- ============================================================================

-- 1. Layer A: Central Product / Medicine Canonical Identity
CREATE TABLE IF NOT EXISTS central_medicines (
  id TEXT PRIMARY KEY,                                      -- Canonical medicine ID (cmed_...)
  canonical_name TEXT NOT NULL,                             -- Normalized primary trade name
  brand_name TEXT,                                          -- Brand / Trade Name (e.g. Panadol, Brufen)
  generic_name TEXT,                                        -- Active pharmaceutical ingredient / salt
  strength TEXT,                                            -- Exact strength (e.g. 500mg, 250mg, 100ml)
  dosage_form TEXT,                                         -- Dosage form (e.g. Tablet, Syrup, Injection)
  manufacturer TEXT,                                        -- Manufacturer (e.g. Haleon, Abbott, GSK)
  pack_size REAL,                                           -- Packaging count / volume (e.g. 100, 20, 1)
  pack_unit TEXT,                                           -- Packaging unit (e.g. Tablet, Box, Strip, Bottle)
  barcode TEXT,                                             -- GTIN / EAN-13 / Verified Barcode
  aliases_json TEXT NOT NULL DEFAULT '[]',                  -- JSON array of verified alternate trade names
  verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('verified', 'pending_review', 'unverified')),
  preferred_media_id TEXT,                                  -- References storefront_media(id)
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_central_med_barcode
  ON central_medicines(barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_central_med_brand_strength
  ON central_medicines(brand_name, strength, dosage_form);

CREATE INDEX IF NOT EXISTS idx_central_med_name
  ON central_medicines(canonical_name);

-- 2. Layer B: Owner Submissions & Image Review Queue
CREATE TABLE IF NOT EXISTS central_image_submissions (
  id TEXT PRIMARY KEY,                                      -- Submission ID (csub_...)
  media_id TEXT NOT NULL,                                   -- Temporary or tenant media reference
  pharmacy_id TEXT NOT NULL,                                -- Submitting pharmacy ID
  storefront_id TEXT,                                       -- Submitting storefront ID
  pos_product_id TEXT,                                      -- Source product ID in submitting POS
  product_name_snapshot TEXT NOT NULL,                      -- Product name at time of submission
  generic_snapshot TEXT,                                    -- Salt composition
  strength_snapshot TEXT,                                   -- Product strength
  dosage_form_snapshot TEXT,                                -- Product dosage form
  brand_snapshot TEXT,                                      -- Product manufacturer/brand
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  target_canonical_id TEXT,                                 -- Linked canonical identity once approved
  reviewed_by TEXT,                                         -- Super Admin actor ID
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_central_sub_status
  ON central_image_submissions(status, created_at DESC);

-- 3. Layer C: Storefront Product Image Assignment Tracking
ALTER TABLE storefront_products ADD COLUMN image_source TEXT NOT NULL DEFAULT 'none';
ALTER TABLE storefront_products ADD COLUMN selected_media_id TEXT;
ALTER TABLE storefront_products ADD COLUMN canonical_medicine_id TEXT;

CREATE INDEX IF NOT EXISTS idx_storefront_products_canonical
  ON storefront_products(storefront_id, canonical_medicine_id);

-- 4. Media Metadata Extensions for Central Shared Assets
ALTER TABLE storefront_media ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE storefront_media ADD COLUMN source_type TEXT NOT NULL DEFAULT 'super_admin';
ALTER TABLE storefront_media ADD COLUMN contributed_by_pharmacy_id TEXT;
ALTER TABLE storefront_media ADD COLUMN review_notes TEXT;

