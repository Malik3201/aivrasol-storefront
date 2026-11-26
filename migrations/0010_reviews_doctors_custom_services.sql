-- ============================================================================
-- Migration 0010: Verified Customer Order Reviews, Optional In-House Doctors,
-- and Custom Pharmacy Services / Diagnostic Lab Test Catalog
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_reviews (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  order_id TEXT,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  owner_reply TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, order_number),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_reviews_pub
  ON storefront_reviews(storefront_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS storefront_doctors (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  qualification TEXT,
  specialization TEXT,
  timings TEXT,
  days_available TEXT,
  consultation_fee_pkr REAL NOT NULL DEFAULT 0,
  experience_years INTEGER,
  room_or_clinic_note TEXT,
  bio TEXT,
  booking_phone TEXT,
  photo_url TEXT,
  media_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_doctors_active
  ON storefront_doctors(storefront_id, is_active, sort_order ASC, name ASC);

CREATE TABLE IF NOT EXISTS storefront_custom_services (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  title TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'lab_tests',
  subtitle TEXT,
  description TEXT,
  image_url TEXT,
  media_id TEXT,
  timings TEXT,
  home_service_available INTEGER NOT NULL DEFAULT 0 CHECK (home_service_available IN (0, 1)),
  starting_price_pkr REAL,
  booking_phone TEXT,
  items_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_custom_services_active
  ON storefront_custom_services(storefront_id, is_active, sort_order ASC, title ASC);
