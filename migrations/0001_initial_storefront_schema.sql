-- ============================================================================
-- AIVRASOL STOREFRONT SAAS — CLOUDFLARE D1 INITIAL SCHEMA MIGRATION
-- Migration: 0001_initial_storefront_schema.sql
-- Direction: UP
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 0. Migration tracking table
CREATE TABLE IF NOT EXISTS storefront_schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================================
-- 1. TENANTS AND CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefronts (
  id TEXT PRIMARY KEY,
  pharmacy_id TEXT NOT NULL UNIQUE,           -- Stable Client.id from AivraSol core
  license_id TEXT,                            -- Associated License.id
  project_id TEXT,                            -- Associated Project.id
  slug TEXT NOT NULL UNIQUE,                  -- Unique lowercase subdomain slug (e.g. 'alshifa')
  pharmacy_name TEXT NOT NULL,
  legal_business_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending_setup'
    CHECK (status IN ('pending_setup', 'active', 'disabled', 'suspended')),
  website_enabled INTEGER NOT NULL DEFAULT 0  -- 0 = disabled, 1 = enabled
    CHECK (website_enabled IN (0, 1)),
  entitlement_status TEXT NOT NULL DEFAULT 'active'
    CHECK (entitlement_status IN ('active', 'pilot', 'grace', 'suspended', 'expired', 'none')),
  pilot_access INTEGER NOT NULL DEFAULT 0
    CHECK (pilot_access IN (0, 1)),
  plan_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (plan_tier IN ('pilot', 'standard', 'pro', 'enterprise')),
  primary_domain TEXT NOT NULL UNIQUE,        -- e.g. 'alshifa.aivrasol.pk'
  contact_phone TEXT,
  whatsapp_phone TEXT,
  contact_email TEXT,
  support_phone TEXT,
  address_line TEXT,
  city TEXT NOT NULL DEFAULT 'Lahore',
  region TEXT DEFAULT 'Punjab',
  country TEXT NOT NULL DEFAULT 'PK',
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  drug_sale_license_no TEXT,
  pharmacist_name TEXT,
  pharmacist_reg_no TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  published_products_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  suspended_reason TEXT,
  disabled_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_storefronts_status ON storefronts(status, website_enabled);
CREATE INDEX IF NOT EXISTS idx_storefronts_license ON storefronts(license_id);

CREATE TABLE IF NOT EXISTS storefront_domains (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,              -- Normalized lowercase hostname
  domain_type TEXT NOT NULL DEFAULT 'subdomain'
    CHECK (domain_type IN ('subdomain', 'custom', 'redirect_alias')),
  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK (is_primary IN (0, 1)),
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('verified', 'pending', 'failed', 'revoked')),
  verification_token TEXT,
  verification_method TEXT NOT NULL DEFAULT 'cname_txt'
    CHECK (verification_method IN ('system_subdomain', 'cname_txt', 'http_token')),
  redirect_to_hostname TEXT,                  -- Populated when domain_type = 'redirect_alias' (e.g. renamed slug)
  ssl_status TEXT NOT NULL DEFAULT 'active'
    CHECK (ssl_status IN ('pending', 'active', 'failed')),
  verified_at TEXT,
  last_checked_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_domains_tenant ON storefront_domains(storefront_id, pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_storefront_domains_lookup ON storefront_domains(hostname, verification_status);

CREATE TABLE IF NOT EXISTS storefront_branches (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  pos_branch_id TEXT NOT NULL,                -- 'main' or branch identifier
  branch_code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_main INTEGER NOT NULL DEFAULT 0
    CHECK (is_main IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  phone TEXT,
  whatsapp_phone TEXT,
  address_line TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,
  pickup_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (pickup_enabled IN (0, 1)),
  delivery_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (delivery_enabled IN (0, 1)),
  opening_hours_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, pos_branch_id),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_branches_tenant ON storefront_branches(storefront_id, pharmacy_id, status);

CREATE TABLE IF NOT EXISTS storefront_settings (
  storefront_id TEXT PRIMARY KEY,
  pharmacy_id TEXT NOT NULL UNIQUE,
  -- Catalog publishing rules
  publishing_mode TEXT NOT NULL DEFAULT 'manual_only'
    CHECK (publishing_mode IN ('manual_only', 'in_stock_approved', 'category_allowlist')),
  hide_out_of_stock INTEGER NOT NULL DEFAULT 0
    CHECK (hide_out_of_stock IN (0, 1)),
  show_exact_stock_qty INTEGER NOT NULL DEFAULT 0
    CHECK (show_exact_stock_qty IN (0, 1)),
  allow_controlled_medicines INTEGER NOT NULL DEFAULT 0
    CHECK (allow_controlled_medicines IN (0, 1)),
  require_rx_for_prescription_items INTEGER NOT NULL DEFAULT 1
    CHECK (require_rx_for_prescription_items IN (0, 1)),
  auto_unpublish_zero_stock INTEGER NOT NULL DEFAULT 0
    CHECK (auto_unpublish_zero_stock IN (0, 1)),
  max_published_products INTEGER NOT NULL DEFAULT 2500,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  -- Delivery & Pickup configuration
  delivery_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (delivery_enabled IN (0, 1)),
  pickup_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (pickup_enabled IN (0, 1)),
  min_order_amount_pkr REAL NOT NULL DEFAULT 300,
  standard_delivery_fee_pkr REAL NOT NULL DEFAULT 150,
  free_delivery_threshold_pkr REAL NOT NULL DEFAULT 2000,
  estimated_delivery_minutes INTEGER NOT NULL DEFAULT 45,
  estimated_pickup_minutes INTEGER NOT NULL DEFAULT 15,
  delivery_radius_km REAL NOT NULL DEFAULT 10,
  cod_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (cod_enabled IN (0, 1)),
  bank_transfer_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (bank_transfer_enabled IN (0, 1)),
  prescription_upload_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (prescription_upload_enabled IN (0, 1)),
  whatsapp_order_assist_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (whatsapp_order_assist_enabled IN (0, 1)),
  -- Storefront public display & SEO
  announcement_bar_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (announcement_bar_enabled IN (0, 1)),
  announcement_bar_text TEXT DEFAULT 'Licensed Community Pharmacy • Genuine Medicines • Fast Local Delivery',
  featured_categories_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (featured_categories_enabled IN (0, 1)),
  opening_hours_json TEXT NOT NULL DEFAULT '{"mon_sat":"09:00 AM - 11:00 PM","sun":"10:00 AM - 10:00 PM","is_24_hours":false}',
  seo_title TEXT,
  seo_description TEXT,
  social_links_json TEXT NOT NULL DEFAULT '{}',
  legal_disclaimer_text TEXT NOT NULL DEFAULT 'All prescription medicines require a valid registered medical practitioner prescription prior to dispensing.',
  pharmacist_supervision_note TEXT NOT NULL DEFAULT 'Dispensed under the supervision of a qualified registered pharmacist.',
  emergency_notice_text TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storefront_branding (
  storefront_id TEXT PRIMARY KEY,
  pharmacy_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tagline TEXT DEFAULT 'Your Trusted Neighborhood Pharmacy',
  logo_url TEXT,
  logo_media_id TEXT,
  favicon_url TEXT,
  hero_title TEXT DEFAULT 'Genuine Medicines & Healthcare Essentials Delivered Safely',
  hero_subtitle TEXT DEFAULT 'Order online from our licensed pharmacy inventory with real-time availability.',
  hero_banner_url TEXT,
  theme_preset TEXT NOT NULL DEFAULT 'emerald_clinical'
    CHECK (theme_preset IN ('emerald_clinical', 'royal_care', 'modern_teal', 'classic_navy')),
  primary_color TEXT NOT NULL DEFAULT '#009A4D',
  secondary_color TEXT NOT NULL DEFAULT '#0F172A',
  accent_color TEXT NOT NULL DEFAULT '#10B981',
  surface_mode TEXT NOT NULL DEFAULT 'light'
    CHECK (surface_mode IN ('light', 'dark')),
  card_style TEXT NOT NULL DEFAULT 'elevated'
    CHECK (card_style IN ('elevated', 'bordered', 'minimal')),
  font_heading TEXT NOT NULL DEFAULT 'Outfit',
  font_body TEXT NOT NULL DEFAULT 'Figtree',
  show_verified_license_badge INTEGER NOT NULL DEFAULT 1
    CHECK (show_verified_license_badge IN (0, 1)),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storefront_permissions (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'portal_role'
    CHECK (subject_type IN ('portal_role', 'portal_user', 'pos_operator')),
  subject_id TEXT NOT NULL,                   -- e.g. 'owner', 'manager', 'viewer' or user UUID
  can_manage_catalog INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_catalog IN (0, 1)),
  can_publish_products INTEGER NOT NULL DEFAULT 0 CHECK (can_publish_products IN (0, 1)),
  can_manage_branding INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_branding IN (0, 1)),
  can_manage_settings INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_settings IN (0, 1)),
  can_manage_banners INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_banners IN (0, 1)),
  can_manage_orders INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_orders IN (0, 1)),
  can_manage_domains INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_domains IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, subject_type, subject_id),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_permissions_tenant ON storefront_permissions(storefront_id, pharmacy_id);

-- ============================================================================
-- 2. CATALOG (PUBLIC BOUNDARY — NEVER STORES COST, WAC, PROFIT, SUPPLIER, KHATA)
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_categories (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1
    CHECK (is_visible IN (0, 1)),
  published_product_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, slug),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_categories_public
  ON storefront_categories(storefront_id, is_visible, sort_order, name);

CREATE TABLE IF NOT EXISTS storefront_products (
  id TEXT PRIMARY KEY,                        -- Website product ID (sfp_...)
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  pos_product_id TEXT NOT NULL,               -- Stable source POS product ID
  master_medicine_id TEXT,                    -- Optional master medicine reference
  sku_code TEXT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  generic_name TEXT,
  strength TEXT,
  dosage_form TEXT,
  brand_name TEXT,
  packing_label TEXT,
  unit_label TEXT NOT NULL DEFAULT 'Pack',
  public_description TEXT,
  public_selling_price_pkr REAL NOT NULL CHECK (public_selling_price_pkr >= 0),
  compare_at_price_pkr REAL,
  availability_status TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (availability_status IN ('in_stock', 'low_stock', 'out_of_stock', 'unavailable')),
  available_qty INTEGER NOT NULL DEFAULT 0,   -- Only exposed if show_exact_stock_qty = 1
  primary_category_id TEXT,
  category_name TEXT NOT NULL DEFAULT 'General Medicines',
  primary_image_url TEXT,
  search_keywords TEXT NOT NULL DEFAULT '',   -- Normalized lowercase tokens for fast search
  publish_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('published', 'draft', 'unpublished', 'archived')),
  requires_prescription INTEGER NOT NULL DEFAULT 0
    CHECK (requires_prescription IN (0, 1)),
  is_controlled_substance INTEGER NOT NULL DEFAULT 0
    CHECK (is_controlled_substance IN (0, 1)),
  is_featured INTEGER NOT NULL DEFAULT 0
    CHECK (is_featured IN (0, 1)),
  max_order_qty INTEGER NOT NULL DEFAULT 10,
  sync_version INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, pos_product_id),
  UNIQUE(storefront_id, slug),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

-- Composite tenant indexes for cursor pagination & public queries
CREATE INDEX IF NOT EXISTS idx_storefront_products_public_cursor
  ON storefront_products(storefront_id, publish_status, name, id);
CREATE INDEX IF NOT EXISTS idx_storefront_products_category_cursor
  ON storefront_products(storefront_id, publish_status, category_name, name, id);
CREATE INDEX IF NOT EXISTS idx_storefront_products_featured
  ON storefront_products(storefront_id, publish_status, is_featured, name, id);
CREATE INDEX IF NOT EXISTS idx_storefront_products_pos_lookup
  ON storefront_products(storefront_id, pharmacy_id, pos_product_id);

CREATE TABLE IF NOT EXISTS storefront_product_categories (
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (storefront_id, product_id, category_id),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES storefront_products(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES storefront_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_prod_cats_cat
  ON storefront_product_categories(storefront_id, category_id, product_id);

CREATE TABLE IF NOT EXISTS storefront_product_visibility (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  pos_product_id TEXT NOT NULL,
  branch_id TEXT NOT NULL DEFAULT 'main',
  is_visible INTEGER NOT NULL DEFAULT 0
    CHECK (is_visible IN (0, 1)),
  visibility_reason TEXT NOT NULL DEFAULT 'owner_approved'
    CHECK (visibility_reason IN ('owner_approved', 'admin_approved', 'rule_matched', 'manual_hidden', 'controlled_blocked', 'out_of_stock_hidden')),
  override_selling_price_pkr REAL,
  approved_by TEXT,
  approved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, pos_product_id, branch_id),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES storefront_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_visibility_lookup
  ON storefront_product_visibility(storefront_id, is_visible, product_id);

CREATE TABLE IF NOT EXISTS storefront_product_images (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  media_id TEXT,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES storefront_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_product_images_prod
  ON storefront_product_images(storefront_id, product_id, sort_order);

CREATE TABLE IF NOT EXISTS storefront_promotions (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  promo_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (promo_type IN ('percentage', 'fixed_amount', 'bundle')),
  discount_value REAL NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_promotions_active
  ON storefront_promotions(storefront_id, is_active);

CREATE TABLE IF NOT EXISTS storefront_banners (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  badge_text TEXT,
  cta_label TEXT,
  cta_url TEXT,
  image_url TEXT,
  media_id TEXT,
  bg_gradient TEXT DEFAULT 'from-emerald-700 to-teal-900',
  placement TEXT NOT NULL DEFAULT 'hero'
    CHECK (placement IN ('hero', 'secondary', 'category_strip')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_banners_public
  ON storefront_banners(storefront_id, is_active, placement, sort_order);

-- ============================================================================
-- 3. ORDERS & DELIVERY ZONES (SCHEMA FOUNDATION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_delivery_zones (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  branch_id TEXT NOT NULL DEFAULT 'main',
  zone_name TEXT NOT NULL,
  city TEXT NOT NULL,
  areas_json TEXT NOT NULL DEFAULT '[]',
  delivery_fee_pkr REAL NOT NULL DEFAULT 150,
  min_order_pkr REAL NOT NULL DEFAULT 300,
  free_delivery_above_pkr REAL,
  estimated_minutes INTEGER NOT NULL DEFAULT 45,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_delivery_zones_tenant
  ON storefront_delivery_zones(storefront_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS storefront_orders (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  branch_id TEXT NOT NULL DEFAULT 'main',
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'delivery'
    CHECK (fulfillment_type IN ('delivery', 'pickup')),
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_zone_id TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cod'
    CHECK (payment_method IN ('cod', 'bank_transfer', 'counter_pay')),
  status TEXT NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'rejected')),
  subtotal_pkr REAL NOT NULL DEFAULT 0,
  delivery_fee_pkr REAL NOT NULL DEFAULT 0,
  discount_pkr REAL NOT NULL DEFAULT 0,
  total_pkr REAL NOT NULL DEFAULT 0,
  requires_prescription INTEGER NOT NULL DEFAULT 0 CHECK (requires_prescription IN (0, 1)),
  prescription_media_id TEXT,
  customer_notes TEXT,
  pos_order_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, order_number),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_tenant_cursor
  ON storefront_orders(storefront_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS storefront_order_items (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  pos_product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_label_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_pkr REAL NOT NULL CHECK (unit_price_pkr >= 0),
  line_total_pkr REAL NOT NULL CHECK (line_total_pkr >= 0),
  requires_prescription INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES storefront_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_order_items_order
  ON storefront_order_items(storefront_id, order_id);

CREATE TABLE IF NOT EXISTS storefront_order_status_history (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES storefront_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_order_history_order
  ON storefront_order_status_history(storefront_id, order_id, created_at);

CREATE TABLE IF NOT EXISTS storefront_order_events (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES storefront_orders(id) ON DELETE CASCADE
);

-- ============================================================================
-- 4. SYNCHRONIZATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_sync_cursors (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  branch_id TEXT NOT NULL DEFAULT 'main',
  stream_name TEXT NOT NULL DEFAULT 'catalog', -- e.g. 'catalog', 'availability'
  last_cursor TEXT NOT NULL,
  last_revision INTEGER NOT NULL DEFAULT 0,
  last_event_id TEXT,
  last_sync_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, branch_id, stream_name),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storefront_sync_events (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  branch_id TEXT NOT NULL DEFAULT 'main',
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('catalog_delta', 'catalog_snapshot', 'availability_delta')),
  source_cursor TEXT,
  next_cursor TEXT NOT NULL,
  items_received INTEGER NOT NULL DEFAULT 0,
  items_applied INTEGER NOT NULL DEFAULT 0,
  items_rejected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('processing', 'completed', 'partial', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_sync_events_tenant
  ON storefront_sync_events(storefront_id, created_at DESC);

CREATE TABLE IF NOT EXISTS storefront_sync_failures (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  sync_event_id TEXT,
  pos_product_id TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_sync_failures_tenant
  ON storefront_sync_failures(storefront_id, created_at DESC);

CREATE TABLE IF NOT EXISTS storefront_outbox (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatched', 'acknowledged', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_outbox_pending
  ON storefront_outbox(storefront_id, status, created_at);

CREATE TABLE IF NOT EXISTS storefront_import_idempotency (
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (storefront_id, idempotency_key),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

-- ============================================================================
-- 5. MEDIA (R2 TENANT-SCOPED ASSETS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_media (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  r2_object_key TEXT NOT NULL UNIQUE,         -- Enforced prefix: storefronts/<storefront_id>/...
  public_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER,
  height INTEGER,
  sha256_hex TEXT,
  purpose TEXT NOT NULL DEFAULT 'product_image'
    CHECK (purpose IN ('logo', 'favicon', 'banner', 'product_image', 'category_image', 'prescription_upload')),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_media_tenant
  ON storefront_media(storefront_id, pharmacy_id, purpose);

CREATE TABLE IF NOT EXISTS storefront_media_references (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,                  -- 'branding', 'product', 'banner', 'category'
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(storefront_id, media_id, entity_type, entity_id),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES storefront_media(id) ON DELETE CASCADE
);

-- ============================================================================
-- 6. OPERATIONAL MONITORING & AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_usage_daily (
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,                   -- YYYY-MM-DD (UTC)
  public_requests INTEGER NOT NULL DEFAULT 0,
  search_requests INTEGER NOT NULL DEFAULT 0,
  sync_requests INTEGER NOT NULL DEFAULT 0,
  manage_requests INTEGER NOT NULL DEFAULT 0,
  d1_rows_read_est INTEGER NOT NULL DEFAULT 0,
  d1_rows_written_est INTEGER NOT NULL DEFAULT 0,
  r2_bytes_stored INTEGER NOT NULL DEFAULT 0,
  r2_class_a_ops INTEGER NOT NULL DEFAULT 0,
  r2_class_b_ops INTEGER NOT NULL DEFAULT 0,
  orders_created INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (storefront_id, usage_date),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_usage_date
  ON storefront_usage_daily(usage_date, storefront_id);

CREATE TABLE IF NOT EXISTS storefront_audit_logs (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'super_admin'
    CHECK (actor_type IN ('super_admin', 'portal_owner', 'portal_manager', 'pos_sync', 'system')),
  actor_id TEXT,
  actor_email TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (storefront_id) REFERENCES storefronts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storefront_audit_tenant_cursor
  ON storefront_audit_logs(storefront_id, created_at DESC, id DESC);

