/**
 * AivraSol Storefront Platform — Shared Domain & API Types
 */

export type StorefrontStatus = "pending_setup" | "active" | "disabled" | "suspended";
export type StorefrontEntitlementStatus = "active" | "pilot" | "grace" | "suspended" | "expired" | "none";
export type StorefrontPlanTier = "pilot" | "standard" | "pro" | "enterprise";
export type ThemePresetId = "emerald_clinical" | "royal_care" | "modern_teal" | "classic_navy";
export type PublishingMode = "manual_only" | "in_stock_approved" | "category_allowlist";
export type ProductAvailabilityStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "unavailable"
  | "availability_unconfirmed";
export type ProductPublishStatus = "published" | "draft" | "unpublished" | "archived";

export type StorefrontOrderStatus =
  | "pending_confirmation"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "collected"
  | "completed"
  | "cancelled"
  | "rejected"
  | "returned";

export type StorefrontPaymentStatus =
  | "unpaid"
  | "pending_cod"
  | "partially_paid"
  | "paid"
  | "refunded";

export type PosHandoffStatus =
  | "pending"
  | "acknowledged"
  | "fetched_by_pos"
  | "loaded_in_pos"
  | "held_in_pos"
  | "invoiced_in_pos"
  | "fulfilled_in_pos"
  | "cancelled";

export interface PublicSellingUnitOption {
  unit_id: string;
  name: string;
  unit_name: string;
  label: string;
  multiplier: number;
  price_pkr: number;
  compare_at_price_pkr?: number | null;
  is_base?: boolean;
  is_default?: boolean;
  barcode?: string | null;
  available_unit_qty?: number;
  max_qty?: number;
  in_stock?: boolean;
}

export interface StorefrontRecord {
  id: string;
  pharmacy_id: string;
  license_id: string | null;
  project_id: string | null;
  slug: string;
  pharmacy_name: string;
  legal_business_name: string | null;
  status: StorefrontStatus;
  website_enabled: number; // 0 | 1
  entitlement_status: StorefrontEntitlementStatus;
  pilot_access: number; // 0 | 1
  plan_tier: StorefrontPlanTier;
  primary_domain: string;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  contact_email: string | null;
  support_phone: string | null;
  address_line: string | null;
  city: string;
  region: string | null;
  country: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  drug_sale_license_no: string | null;
  pharmacist_name: string | null;
  pharmacist_reg_no: string | null;
  config_version: number;
  published_products_count: number;
  last_sync_at: string | null;
  suspended_reason: string | null;
  disabled_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorefrontDomainRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  hostname: string;
  domain_type: "subdomain" | "custom" | "redirect_alias";
  is_primary: number;
  verification_status: "verified" | "pending" | "failed" | "revoked";
  verification_token: string | null;
  verification_method: "system_subdomain" | "cname_txt" | "http_token";
  redirect_to_hostname: string | null;
  ssl_status: "pending" | "active" | "failed";
  verified_at: string | null;
  last_checked_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorefrontBrandingRecord {
  storefront_id: string;
  pharmacy_id: string;
  display_name: string;
  tagline: string | null;
  logo_url: string | null;
  logo_media_id: string | null;
  favicon_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_banner_url: string | null;
  hero_image_url?: string | null;
  theme_preset: ThemePresetId;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  surface_mode: "light" | "dark";
  card_style: "elevated" | "bordered" | "minimal";
  font_heading: string;
  font_body: string;
  show_verified_license_badge: number;
  about_title?: string | null;
  about_content?: string | null;
  footer_tagline?: string | null;
  services_json?: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorefrontSettingsRecord {
  storefront_id: string;
  pharmacy_id: string;
  publishing_mode: PublishingMode;
  hide_out_of_stock: number;
  show_exact_stock_qty: number;
  show_stock_badges?: number;
  allow_controlled_medicines: number;
  require_rx_for_prescription_items: number;
  auto_unpublish_zero_stock: number;
  max_published_products: number;
  low_stock_threshold: number;
  delivery_enabled: number;
  pickup_enabled: number;
  min_order_amount_pkr: number;
  standard_delivery_fee_pkr: number;
  free_delivery_threshold_pkr: number;
  estimated_delivery_minutes: number;
  estimated_pickup_minutes: number;
  delivery_radius_km: number;
  cod_enabled: number;
  bank_transfer_enabled: number;
  prescription_upload_enabled: number;
  whatsapp_order_assist_enabled: number;
  announcement_bar_enabled: number;
  announcement_bar_text: string | null;
  featured_categories_enabled: number;
  opening_hours_json: string;
  seo_title: string | null;
  seo_description: string | null;
  social_links_json: string;
  legal_disclaimer_text: string;
  pharmacist_supervision_note: string;
  emergency_notice_text: string | null;
  maintenance_mode?: number;
  maintenance_message?: string | null;
  stale_stock_threshold_hours?: number;
  max_items_per_order?: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorefrontBranchRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  pos_branch_id: string;
  branch_code: string;
  name: string;
  is_main: number;
  status: "active" | "inactive";
  phone: string | null;
  whatsapp_phone: string | null;
  address_line: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  pickup_enabled: number;
  delivery_enabled: number;
  opening_hours_json: string;
  created_at: string;
  updated_at: string;
}

export interface StorefrontCategoryRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_name: string | null;
  image_url: string | null;
  sort_order: number;
  is_visible: number;
  published_product_count: number;
  created_at: string;
  updated_at: string;
}

export interface BranchAvailabilitySnapshot {
  branch_id: string;
  branch_name?: string;
  availability_status: ProductAvailabilityStatus;
  available_qty?: number;
}

/**
 * Public Product DTO — Strictly excludes all cost, WAC, profit, supplier, and Khata data.
 */
export interface PublicStorefrontProduct {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  pos_product_id: string;
  master_medicine_id?: string | null;
  sku_code: string | null;
  slug: string;
  name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  brand_name: string | null;
  packing_label: string | null;
  unit_label: string;
  base_unit_label?: string;
  selling_units?: PublicSellingUnitOption[];
  public_description: string | null;
  public_selling_price_pkr: number;
  effective_price_pkr?: number;
  compare_at_price_pkr: number | null;
  override_price_pkr?: number | null;
  availability_status: ProductAvailabilityStatus;
  availability_unconfirmed?: boolean;
  available_qty?: number; // Present ONLY when show_exact_stock_qty === 1
  available_base_qty?: number; // Base-unit stock cap when POS stock is synced
  branch_availability?: Record<string, BranchAvailabilitySnapshot>;
  category_name: string;
  primary_image_url: string | null;
  requires_prescription: boolean;
  is_featured: boolean;
  is_popular?: boolean;
  max_order_qty: number;
  sync_version: number;
  last_synced_at?: string | null;
  updated_at: string;
}

export interface StorefrontBannerRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  title: string;
  subtitle: string | null;
  badge_text: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  bg_gradient: string | null;
  placement: "hero" | "secondary" | "category_strip";
  sort_order: number;
  is_active: number;
  starts_at: string | null;
  ends_at: string | null;
}

export interface StorefrontPromotionRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  title: string;
  description: string | null;
  promo_type: "percentage" | "fixed_amount" | "bundle";
  discount_value: number;
  code?: string | null;
  badge_text?: string | null;
  banner_image_url?: string | null;
  min_order_pkr?: number;
  product_ids_json?: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface StorefrontOrderItemRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  order_id: string;
  product_id: string;
  pos_product_id: string;
  sku_code_snapshot?: string | null;
  product_name_snapshot: string;
  unit_label_snapshot: string;
  selling_unit_id?: string | null;
  selling_unit_name?: string | null;
  unit_multiplier?: number;
  qty: number;
  base_qty_required?: number;
  unit_price_pkr: number;
  line_total_pkr: number;
  requires_prescription: number;
  created_at: string;
  // Convenience aliases for UI & POS Inbox consumers
  product_name?: string;
  unit_label?: string;
  sku_code?: string | null;
}

export interface StorefrontOrderStatusHistoryRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  actor_type: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

export interface StorefrontOrderRecord {
  id: string;
  storefront_id: string;
  pharmacy_id: string;
  branch_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfillment_type: "delivery" | "pickup";
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_zone_id: string | null;
  branch_name_snapshot?: string | null;
  delivery_instructions?: string | null;
  payment_method: "cod" | "bank_transfer" | "counter_pay";
  payment_status?: StorefrontPaymentStatus;
  status: StorefrontOrderStatus;
  fulfillment_outcome?: string | null;
  fulfillment_notes?: string | null;
  fulfilled_adjustments_json?: string | null;
  subtotal_pkr: number;
  delivery_fee_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  cod_paid_amount_pkr?: number;
  cod_balance_due_pkr?: number | null;
  cod_last_collection_at?: string | null;
  cod_collections_json?: string | null;
  requires_prescription: number;
  prescription_media_id: string | null;
  rx_inquiry_note?: string | null;
  customer_notes: string | null;
  idempotency_key?: string | null;
  tracking_token?: string | null;
  pos_order_ref: string | null;
  pos_handoff_status?: PosHandoffStatus;
  pos_invoice_id?: string | null;
  pos_invoice_number?: string | null;
  pos_fulfilled_at?: string | null;
  pos_fulfilled_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: StorefrontOrderItemRecord[];
  history?: StorefrontOrderStatusHistoryRecord[];
}

export interface PublicStorefrontTenant {
  id: string;
  pharmacy_id: string;
  slug: string;
  pharmacy_name: string;
  legal_business_name?: string | null;
  primary_domain: string;
  status: StorefrontStatus;
  website_enabled: boolean | number;
  entitlement_status: StorefrontEntitlementStatus;
  city: string;
  region?: string | null;
  country?: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address_line: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  contact_email: string | null;
  support_phone?: string | null;
  drug_sale_license_no: string | null;
  pharmacist_name: string | null;
  pharmacist_reg_no?: string | null;
  published_products_count: number;
  last_sync_at?: string | null;
  config_version: number;
}

export type StorefrontPublicContext = StorefrontRecord | PublicStorefrontTenant;

export interface DomainResolutionResponse {
  ok: boolean;
  resolution_status: "active" | "inactive" | "suspended" | "redirect" | "not_found";
  requested_hostname: string;
  normalized_hostname: string;
  redirect_to_hostname?: string;
  redirect_url?: string;
  storefront?: PublicStorefrontTenant;
  branding?: StorefrontBrandingRecord;
  settings?: Partial<StorefrontSettingsRecord> & {
    opening_hours?: Record<string, unknown>;
  };
  branches?: StorefrontBranchRecord[];
  message?: string;
}

export interface CursorPaginatedResult<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
