/**
 * AivraSol Storefront Platform — POS-to-Storefront Safe Synchronization Contract
 * Version: aivrasol-storefront-sync/v1
 *
 * Integration Boundary Rules (Sections 7 & 10):
 * 1. The public Worker NEVER connects directly to a local POS database.
 * 2. Only explicitly approved public fields cross this boundary.
 * 3. Purchase cost, WAC, supplier purchase history, gross/net profit, Khata,
 *    employee PINs, and patient details are strictly prohibited in this contract.
 */

import type {
  BranchAvailabilitySnapshot,
  PosHandoffStatus,
  ProductAvailabilityStatus,
  ProductPublishStatus,
  PublicSellingUnitOption,
  StorefrontOrderItemRecord,
  StorefrontOrderStatus,
  StorefrontPaymentStatus,
} from "./types";

export const STOREFRONT_SYNC_CONTRACT_VERSION = "aivrasol-storefront-sync/v1" as const;

export interface PosSyncTenantIdentity {
  pharmacy_id: string;       // Client.id
  storefront_id: string;     // Storefront.id
  license_id?: string;
}

export interface PosSyncBranchIdentity {
  branch_id: string;         // 'main' or branch UUID
  terminal_id?: string;
}

export interface PosSyncProductIdentity {
  sku_code?: string;
  name: string;
  generic_name?: string;
  strength?: string;
  dosage_form?: string;
  brand_name?: string;
  packing_label?: string;
  unit_label: string;
  category_name?: string;
  public_description?: string;
  primary_image_url?: string;
  master_medicine_id?: string;
  requires_prescription?: boolean;
  is_controlled_substance?: boolean;
}

export interface StorefrontCatalogDeltaItem {
  pos_product_id: string;
  source_revision: number;
  public_selling_price_pkr: number;
  compare_at_price_pkr?: number | null;
  website_visibility: ProductPublishStatus; // 'published' | 'unpublished' | 'draft' | 'archived'
  availability: ProductAvailabilityStatus;  // 'in_stock' | 'low_stock' | 'out_of_stock' | 'unavailable'
  available_qty?: number;
  available_base_qty?: number;
  base_unit_label?: string;
  selling_units?: PublicSellingUnitOption[];
  branch_availability?: Record<string, BranchAvailabilitySnapshot>;
  is_featured?: boolean;
  is_popular?: boolean;
  is_deleted?: boolean;
  max_order_qty?: number;
  product_identity: PosSyncProductIdentity;
}

export interface StorefrontCatalogDeltaRequest {
  contract_version: typeof STOREFRONT_SYNC_CONTRACT_VERSION;
  idempotency_key: string;
  source_cursor: string | null;
  next_cursor: string;
  full_snapshot?: boolean;
  batch_index?: number;
  total_batches?: number;
  tenant_identity: PosSyncTenantIdentity;
  branch_identity: PosSyncBranchIdentity;
  items: StorefrontCatalogDeltaItem[];
}

export interface StorefrontCatalogDeltaResponse {
  ok: boolean;
  duplicate: boolean;
  sync_event_id: string;
  storefront_id: string;
  pharmacy_id: string;
  branch_id: string;
  applied_cursor: string;
  items_received: number;
  items_applied: number;
  items_rejected: number;
  published_products_count: number;
  batch_index?: number;
  total_batches?: number;
  rejections?: Array<{
    pos_product_id: string;
    error_code: string;
    message: string;
  }>;
}

/**
 * Safe External Order Inbox Contract (Section 10):
 * - Online orders NEVER automatically create finalized POS invoices or deduct stock.
 * - POS fetches pending/confirmed online orders into its safe Order Inbox.
 * - Operator reviews items/stock/prices and either queues a Held Bill in Billing
 *   or completes checkout through existing POS Billing.
 * - POS acknowledges fulfillment with an idempotent handoff reference.
 */
export interface PosOrderInboxLinePayload extends StorefrontOrderItemRecord {
  order_item_id: string;
  product_name: string;
  unit_label: string;
  packing_label?: string;
  sku_code?: string | null;
  selling_unit_id?: string | null;
  selling_unit_name?: string | null;
  unit_multiplier: number;
  base_qty_required: number;
}

export interface PosOrderInboxItem {
  order_id: string;
  order_number: string;
  storefront_id: string;
  pharmacy_id: string;
  branch_id: string;
  branch_name_snapshot?: string | null;
  status: StorefrontOrderStatus;
  payment_status: StorefrontPaymentStatus;
  pos_handoff_status: PosHandoffStatus;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfillment_type: "delivery" | "pickup";
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_instructions?: string | null;
  payment_method: "cod" | "bank_transfer" | "counter_pay";
  subtotal_pkr: number;
  delivery_fee_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  cod_paid_amount_pkr?: number;
  cod_balance_due_pkr?: number | null;
  cod_last_collection_at?: string | null;
  cod_collections_json?: string | null;
  requires_prescription: boolean;
  rx_inquiry_note: string | null;
  customer_notes: string | null;
  fulfillment_notes?: string | null;
  fulfilled_adjustments_json?: string | null;
  pos_order_ref: string | null;
  pos_invoice_id: string | null;
  pos_invoice_number: string | null;
  pos_fulfilled_at: string | null;
  pos_fulfilled_by?: string | null;
  created_at: string;
  updated_at: string;
  items: PosOrderInboxLinePayload[];
  history?: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    actor_type: string;
    actor_id: string | null;
    note: string | null;
    created_at: string;
  }>;
}

export interface PosOrderFulfillmentAckRequest {
  idempotency_key: string;
  order_id: string;
  action:
    | "acknowledge_receipt"
    | "load_to_billing"
    | "stage_held_bill"
    | "link_pos_invoice"
    | "update_status"
    | "sync_cod_payment"
    | "mark_fulfilled"
    | "cancel_order";
  next_status?: StorefrontOrderStatus;
  target_status?: StorefrontOrderStatus;
  payment_status?: StorefrontPaymentStatus;
  cod_paid_amount_pkr?: number;
  cod_balance_due_pkr?: number | null;
  cod_last_collection_at?: string | null;
  cod_collections_json?: string | null;
  pos_order_ref?: string;
  pos_invoice_id?: string;
  pos_invoice_number?: string;
  operator_id?: string;
  operator_name?: string;
  note?: string;
  fulfillment_notes?: string;
  fulfilled_adjustments?: Record<string, unknown> | null;
}

export interface PosOrderFulfillmentAckResponse {
  ok: boolean;
  duplicate?: boolean;
  order_id: string;
  order_number: string;
  status: StorefrontOrderStatus;
  payment_status?: StorefrontPaymentStatus;
  cod_paid_amount_pkr?: number;
  cod_balance_due_pkr?: number | null;
  pos_handoff_status: PosHandoffStatus;
  pos_invoice_number: string | null;
  updated_at: string;
}
