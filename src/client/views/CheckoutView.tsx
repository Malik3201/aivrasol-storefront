import React, { useState } from "react";
import type {
  StorefrontBrandingRecord,
  StorefrontOrderRecord,
  StorefrontPromotionRecord,
  StorefrontPublicContext,
  StorefrontSettingsRecord,
} from "../../shared/types";
import type { CartItem, StorefrontView } from "../types-ui";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  CloseIcon,
  MailIcon,
  MedicinePlaceholderIllustration,
  PackageTrackIcon,
  PrescriptionIcon,
  ReceiptDownloadIcon,
  ShoppingBagIcon,
  StoreIcon,
  TagIcon,
  TrashIcon,
  TruckIcon,
  WhatsAppIcon,
} from "../components/Icons";
import { QuantityStepperInput } from "../components/QuantityStepperInput";
import { downloadStorefront80mmInvoicePdf } from "../utils/invoicePdf80mm";

interface CheckoutViewProps {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  settings?: Partial<StorefrontSettingsRecord> | Record<string, any> | null;
  displayName: string;
  cart: CartItem[];
  cartCalculations: {
    totalItems: number;
    subtotalPkr: number;
    discountPkr: number;
    activePromo?: StorefrontPromotionRecord | null;
    matchedPromo?: StorefrontPromotionRecord | null;
    promoStatus?: "none" | "applied" | "below_min" | "invalid";
    promoMinOrderPkr?: number;
    promoRemainingMinPkr?: number;
    deliveryFeePkr: number;
    totalPkr: number;
    freeThreshold: number;
    remainingForFreeDelivery: number;
    minOrderValue: number;
    hasPrescriptionItems: boolean;
  };
  deliveryConfig: any;
  deliveryZones: Array<any>;
  branchesList: Array<any>;
  customerName: string;
  onChangeCustomerName: (v: string) => void;
  customerPhone: string;
  onChangeCustomerPhone: (v: string) => void;
  customerEmail: string;
  onChangeCustomerEmail: (v: string) => void;
  fulfillmentType: "delivery" | "pickup";
  onChangeFulfillmentType: (v: "delivery" | "pickup") => void;
  deliveryAddress: string;
  onChangeDeliveryAddress: (v: string) => void;
  deliveryCity: string;
  onChangeDeliveryCity: (v: string) => void;
  deliveryInstructions: string;
  onChangeDeliveryInstructions: (v: string) => void;
  selectedZoneId: string;
  onChangeSelectedZoneId: (v: string) => void;
  selectedBranchId: string;
  onChangeSelectedBranchId: (v: string) => void;
  paymentMethod: "cod" | "counter_pay" | "bank_transfer";
  onChangePaymentMethod: (v: "cod" | "counter_pay" | "bank_transfer") => void;
  promoCodeInput: string;
  onChangePromoCodeInput: (v: string) => void;
  appliedPromoCode: string;
  onApplyPromoCode: (code: string) => void;
  customerNotes: string;
  onChangeCustomerNotes: (v: string) => void;
  rxAcknowledged: boolean;
  onChangeRxAcknowledged: (v: boolean) => void;
  rxInquiryNote: string;
  onChangeRxInquiryNote: (v: string) => void;
  checkoutSubmitting: boolean;
  checkoutError: string | null;
  completedOrder: (StorefrontOrderRecord & { applied_promo_code?: string | null }) | null;
  invoiceEmailQueued?: boolean;
  onClearCompletedOrder: () => void;
  onSubmitOrder: (e: React.FormEvent) => void;
  getCartItemMaxCap: (item: CartItem, allCart: CartItem[]) => number;
  onUpdateCartQty: (cartKey: string, nextQty: number) => void;
  onRemoveFromCart: (cartKey: string) => void;
  onSelectView: (view: StorefrontView) => void;
  onTrackCompletedOrder: (orderNo: string, token: string) => void;
  buildWhatsAppOrderShareUrl: (order: StorefrontOrderRecord) => string;
  onShowToast: (msg: string) => void;
}

export function CheckoutView({
  sf,
  branding,
  settings,
  displayName,
  cart,
  cartCalculations,
  deliveryConfig,
  deliveryZones,
  branchesList,
  customerName,
  onChangeCustomerName,
  customerPhone,
  onChangeCustomerPhone,
  customerEmail,
  onChangeCustomerEmail,
  fulfillmentType,
  onChangeFulfillmentType,
  deliveryAddress,
  onChangeDeliveryAddress,
  deliveryCity,
  onChangeDeliveryCity,
  deliveryInstructions,
  onChangeDeliveryInstructions,
  selectedZoneId,
  onChangeSelectedZoneId,
  selectedBranchId,
  onChangeSelectedBranchId,
  paymentMethod,
  onChangePaymentMethod,
  promoCodeInput,
  onChangePromoCodeInput,
  appliedPromoCode,
  onApplyPromoCode,
  customerNotes,
  onChangeCustomerNotes,
  rxAcknowledged,
  onChangeRxAcknowledged,
  rxInquiryNote,
  onChangeRxInquiryNote,
  checkoutSubmitting,
  checkoutError,
  completedOrder,
  invoiceEmailQueued,
  onClearCompletedOrder,
  onSubmitOrder,
  getCartItemMaxCap,
  onUpdateCartQty,
  onRemoveFromCart,
  onSelectView,
  onTrackCompletedOrder,
  buildWhatsAppOrderShareUrl,
  onShowToast,
}: CheckoutViewProps) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // 1. Order Confirmation Screen
  if (completedOrder) {
    const confirmedDiscount = Number(completedOrder.discount_pkr || 0);
    const confirmedDeliveryFee = Number(completedOrder.delivery_fee_pkr || 0);
    const confirmedSubtotal = Number(completedOrder.subtotal_pkr || 0);
    const confirmedEmail = String(completedOrder.customer_email || "").trim();

    return (
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 flex-1 sf-fade-up">
        <div
          className="sf-card rounded-3xl overflow-hidden shadow-lg"
          data-testid="order-confirmation-card"
        >
          {/* Deep Forest Confirmation Banner */}
          <div className="sf-surface-forest p-6 sm:p-8 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-[#172B36]"
                style={{ backgroundColor: "var(--sf-warm-accent)" }}
              >
                <CheckCircleIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-widest text-[#E6A65B]">
                  Order Received • {displayName}
                </span>
                <h1 className="sf-heading text-2xl font-extrabold text-white">
                  Thank you, {completedOrder.customer_name}
                </h1>
                <p className="text-sm text-[#D5EAE4]">
                  Tracking Reference:{" "}
                  <strong
                    className="font-mono font-bold text-[#FFF8ED]"
                    data-testid="confirmed-order-number"
                  >
                    {completedOrder.order_number}
                  </strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={downloadingPdf}
              data-testid="download-80mm-invoice-btn"
              onClick={async () => {
                setDownloadingPdf(true);
                try {
                  await downloadStorefront80mmInvoicePdf({
                    sf,
                    branding,
                    displayName,
                    order: completedOrder as any,
                    promoCode: completedOrder.applied_promo_code || undefined,
                  });
                  onShowToast("Downloaded 80mm Invoice PDF");
                } finally {
                  setDownloadingPdf(false);
                }
              }}
              className="h-11 px-4.5 rounded-xl sf-btn-warm text-xs font-bold inline-flex items-center gap-2 shrink-0"
            >
              <ReceiptDownloadIcon className="w-4 h-4" />
              <span>
                {downloadingPdf ? "Preparing Receipt…" : "Download 80mm Invoice (PDF)"}
              </span>
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-6 bg-white">
            {confirmedEmail && (invoiceEmailQueued || confirmedEmail.includes("@")) && (
              <div className="rounded-2xl sf-surface-mint border border-[#C5DFD7] px-4 py-3 flex items-center gap-2.5 text-xs text-[#0E5146]">
                <MailIcon className="w-4 h-4 shrink-0" />
                <span>
                  Official invoice &amp; 80mm receipt PDF has also been emailed to{" "}
                  <strong className="font-semibold">{confirmedEmail}</strong>.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sf-surface-ivory rounded-2xl p-4 text-xs border border-[#EADFCE]">
              <div className="space-y-0.5">
                <span className="text-[#607481] block">Order Reference</span>
                <span className="font-mono font-bold text-[#172B36]">
                  {completedOrder.order_number}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[#607481] block">Current Status</span>
                <span className="font-bold sf-text-brand capitalize">
                  {String(completedOrder.status).replace(/_/g, " ")}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[#607481] block">Fulfillment</span>
                <span className="font-bold text-[#172B36] capitalize">
                  {completedOrder.fulfillment_type === "pickup"
                    ? "Counter Pickup"
                    : "Home Delivery"}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[#607481] block">Net Payable</span>
                <span className="sf-heading font-extrabold text-[#172B36] tabular-nums">
                  PKR {Number(completedOrder.total_pkr).toLocaleString()}
                </span>
              </div>
            </div>

            {completedOrder.items && completedOrder.items.length > 0 && (
              <div className="border border-[#DBE5E0] rounded-2xl divide-y divide-[#E8EFEA] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#FAF8F4] text-xs font-bold text-[#4D616E] flex justify-between">
                  <span>Receipt Breakdown</span>
                  <span className="font-mono">{completedOrder.order_number}</span>
                </div>
                {completedOrder.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[#172B36]">
                        {item.product_name || item.product_name_snapshot}
                      </span>
                      <span className="text-xs text-[#607481] ml-2">
                        × {item.qty} {item.selling_unit_name || item.unit_label || ""}
                      </span>
                    </div>
                    <span className="font-bold text-[#172B36] shrink-0 tabular-nums">
                      PKR {Number(item.line_total_pkr).toLocaleString()}
                    </span>
                  </div>
                ))}

                <div className="px-4 py-2.5 bg-[#FAF8F4] flex justify-between text-xs text-[#4D616E] tabular-nums">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-[#172B36]">
                    PKR {confirmedSubtotal.toLocaleString()}
                  </span>
                </div>

                {confirmedDiscount > 0 && (
                  <div className="px-4 py-2.5 sf-surface-mint flex justify-between text-xs font-bold sf-text-brand tabular-nums">
                    <span>
                      Promo Discount
                      {completedOrder.applied_promo_code
                        ? ` (${completedOrder.applied_promo_code})`
                        : ""}
                    </span>
                    <span>− PKR {confirmedDiscount.toLocaleString()}</span>
                  </div>
                )}

                <div className="px-4 py-2.5 bg-[#FAF8F4] flex justify-between text-xs text-[#4D616E] tabular-nums">
                  <span>
                    {completedOrder.fulfillment_type === "pickup"
                      ? "Counter Pickup"
                      : "Delivery Charges"}
                  </span>
                  <span className="font-semibold text-[#172B36]">
                    {confirmedDeliveryFee === 0
                      ? "Free"
                      : `PKR ${confirmedDeliveryFee.toLocaleString()}`}
                  </span>
                </div>

                <div className="px-4 py-3 sf-surface-ivory flex justify-between text-sm font-extrabold text-[#172B36] tabular-nums">
                  <span>Total Payable</span>
                  <span>PKR {Number(completedOrder.total_pkr).toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {Number(settings?.whatsapp_order_assist_enabled ?? 1) === 1 && (
                <a
                  href={buildWhatsAppOrderShareUrl(completedOrder)}
                  target="_blank"
                  rel="noreferrer"
                  className="h-11 px-5 rounded-xl sf-btn-primary text-xs font-semibold inline-flex items-center gap-2"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Share Order on WhatsApp</span>
                </a>
              )}

              <button
                type="button"
                onClick={() =>
                  onTrackCompletedOrder(
                    completedOrder.order_number,
                    completedOrder.tracking_token || ""
                  )
                }
                className="h-11 px-5 rounded-xl bg-[#172B36] hover:bg-[#0F1E26] text-white text-xs font-semibold inline-flex items-center gap-2 transition"
              >
                <PackageTrackIcon className="w-4 h-4" />
                <span>Track Order Status</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClearCompletedOrder();
                  onSelectView("home");
                }}
                className="h-11 px-4 rounded-xl sf-btn-secondary text-xs font-semibold"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // 2. Empty Cart State
  if (cart.length === 0) {
    return (
      <main className="max-w-xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-14 flex-1 sf-fade-up">
        <div className="sf-card rounded-3xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl sf-surface-mint border border-[var(--sf-primary-border)] flex items-center justify-center mx-auto sf-text-brand">
            <ShoppingBagIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h1 className="sf-heading text-xl font-extrabold text-[#172B36]">Your Cart Is Empty</h1>
            <p className="text-sm text-[#607481]">
              Select medicines or healthcare supplies from {displayName} to proceed to checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectView("shop")}
            className="h-11 px-6 rounded-xl sf-btn-primary text-sm font-semibold"
          >
            Browse Medicines
          </button>
        </div>
      </main>
    );
  }

  const deliveryEnabled = deliveryConfig?.delivery_enabled !== false;
  const pickupEnabled = deliveryConfig?.pickup_enabled !== false;

  // 3. Active Two-Column Checkout
  return (
    <main className="flex-1 sf-fade-up">
      {/* Compact Deep Forest Checkout Header */}
      <section className="sf-surface-forest border-b border-white/10">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-7 sm:py-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#E6A65B]">
              {displayName} • Online Order
            </span>
            <h1 className="sf-heading text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
              Checkout & Fulfillment Details
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onSelectView("shop")}
            className="h-10 px-4 rounded-xl sf-btn-ghost-light text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Add More Medicines</span>
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Customer, Fulfillment & Payment Form */}
          <form
            id="checkout-form"
            onSubmit={onSubmitOrder}
            className="lg:col-span-7 space-y-6"
          >
            {checkoutError && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-2.5 text-xs font-medium text-rose-800">
                <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Section 1: Contact Information */}
            <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full sf-surface-forest text-white text-xs font-bold inline-flex items-center justify-center">
                  1
                </span>
                <h2 className="sf-heading text-base font-bold text-[#172B36]">
                  Contact Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                    Customer / Patient Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => onChangeCustomerName(e.target.value)}
                    placeholder="Full name"
                    data-testid="checkout-name-input"
                    className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                    Mobile / WhatsApp Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => onChangeCustomerPhone(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    data-testid="checkout-phone-input"
                    className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                    Email Address{" "}
                    <span className="text-[#8899A4] font-normal">
                      (Optional — receives official 80mm PDF receipt by email)
                    </span>
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => onChangeCustomerEmail(e.target.value)}
                    placeholder="name@example.com"
                    data-testid="checkout-email-input"
                    className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Delivery or Counter Pickup */}
            <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full sf-surface-forest text-white text-xs font-bold inline-flex items-center justify-center">
                  2
                </span>
                <h2 className="sf-heading text-base font-bold text-[#172B36]">
                  Delivery or Counter Pickup
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {deliveryEnabled && (
                  <button
                    type="button"
                    onClick={() => onChangeFulfillmentType("delivery")}
                    className={`p-4 rounded-xl border text-left flex items-start gap-3 transition ${
                      fulfillmentType === "delivery"
                        ? "border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] ring-1 ring-[var(--sf-primary)]"
                        : "border-[#DBE5E0] bg-white hover:border-[var(--sf-primary)]"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#DBE5E0] flex items-center justify-center sf-text-brand shrink-0">
                      <TruckIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="sf-heading text-sm font-bold text-[#172B36]">
                        Home Delivery
                      </div>
                      <div className="text-xs text-[#607481] mt-0.5 tabular-nums">
                        Standard fee PKR{" "}
                        {Number(deliveryConfig?.standard_delivery_fee_pkr ?? 150).toLocaleString()}
                        {Number(deliveryConfig?.estimated_delivery_minutes || 0) > 0
                          ? ` • ~${deliveryConfig.estimated_delivery_minutes} mins`
                          : ""}
                      </div>
                    </div>
                  </button>
                )}

                {pickupEnabled && (
                  <button
                    type="button"
                    onClick={() => onChangeFulfillmentType("pickup")}
                    className={`p-4 rounded-xl border text-left flex items-start gap-3 transition ${
                      fulfillmentType === "pickup"
                        ? "border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] ring-1 ring-[var(--sf-primary)]"
                        : "border-[#DBE5E0] bg-white hover:border-[var(--sf-primary)]"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#DBE5E0] flex items-center justify-center sf-text-brand shrink-0">
                      <StoreIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="sf-heading text-sm font-bold text-[#172B36]">
                        Counter Pickup
                      </div>
                      <div className="text-xs text-[#607481] mt-0.5">
                        Collect at {displayName} • Free
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {fulfillmentType === "delivery" ? (
                <div className="space-y-4 pt-1">
                  {deliveryZones.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                        Delivery Area / Zone
                      </label>
                      <select
                        value={selectedZoneId}
                        onChange={(e) => onChangeSelectedZoneId(e.target.value)}
                        className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                      >
                        <option value="">
                          Standard Local Delivery (PKR{" "}
                          {Number(
                            deliveryConfig?.standard_delivery_fee_pkr ?? 150
                          ).toLocaleString()}
                          )
                        </option>
                        {deliveryZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.zone_name || z.name} — PKR{" "}
                            {Number(z.fee_pkr ?? z.delivery_fee_pkr ?? 0).toLocaleString()}
                            {z.estimated_minutes ? ` (~${z.estimated_minutes} mins)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                        Complete Street / House Address <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={deliveryAddress}
                        onChange={(e) => onChangeDeliveryAddress(e.target.value)}
                        placeholder="House #, Street, Sector / Area, Landmark"
                        data-testid="checkout-address-input"
                        className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                        City
                      </label>
                      <input
                        type="text"
                        value={deliveryCity}
                        onChange={(e) => onChangeDeliveryCity(e.target.value)}
                        placeholder={sf.city}
                        className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                      Delivery Landmark / Rider Note{" "}
                      <span className="text-[#8899A4] font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={deliveryInstructions}
                      onChange={(e) => onChangeDeliveryInstructions(e.target.value)}
                      placeholder="Optional gate, floor, or nearby landmark instructions"
                      className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="pt-1 space-y-2">
                  {branchesList.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                        Pickup Pharmacy Location
                      </label>
                      <select
                        value={selectedBranchId}
                        onChange={(e) => onChangeSelectedBranchId(e.target.value)}
                        className="w-full h-11 rounded-xl sf-input px-3.5 text-sm"
                      >
                        {branchesList.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.branch_name || b.name || displayName} —{" "}
                            {b.address_line || sf.address_line || b.city || sf.city}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl sf-surface-ivory border border-[#EADFCE] text-xs text-[#4D616E]">
                      Pickup Counter: <strong className="text-[#172B36]">{displayName}</strong>
                      {sf.address_line ? ` — ${sf.address_line}, ${sf.city}` : ` (${sf.city})`}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Conditional Prescription Confirmation */}
            {cartCalculations.hasPrescriptionItems && (
              <section className="rounded-2xl bg-rose-50/80 border border-rose-200 p-5 sm:p-6 space-y-3.5">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-900">
                  <PrescriptionIcon className="w-4 h-4 text-rose-700" />
                  <span>Prescription Verification Required</span>
                </div>
                <label className="flex items-start gap-3 text-xs text-rose-900 leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rxAcknowledged}
                    onChange={(e) => onChangeRxAcknowledged(e.target.checked)}
                    data-testid="checkout-rx-checkbox"
                    className="mt-0.5 w-4 h-4 rounded border-rose-400 accent-rose-600 shrink-0"
                  />
                  <span>
                    I confirm that I hold a valid prescription from a registered medical
                    practitioner for the prescription-only medicine(s) in this order and will
                    present or share it prior to dispensing.
                  </span>
                </label>
                <input
                  type="text"
                  value={rxInquiryNote}
                  onChange={(e) => onChangeRxInquiryNote(e.target.value)}
                  placeholder="Optional: Prescribing doctor / clinic or reference note"
                  className="w-full h-10 rounded-xl border border-rose-200 bg-white px-3.5 text-xs text-[#172B36] focus:outline-none focus:border-rose-400"
                />
              </section>
            )}

            {/* Payment Method & Notes */}
            <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full sf-surface-forest text-white text-xs font-bold inline-flex items-center justify-center">
                  {cartCalculations.hasPrescriptionItems ? "4" : "3"}
                </span>
                <h2 className="sf-heading text-base font-bold text-[#172B36]">
                  Payment & Order Notes
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { id: "cod", label: "Cash on Delivery", sub: "Pay upon receipt" },
                  { id: "counter_pay", label: "Pay at Counter", sub: "Cash or card in store" },
                  { id: "bank_transfer", label: "Bank / Raast", sub: "Confirm with pharmacy" },
                ].map((pm) => {
                  const active = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => onChangePaymentMethod(pm.id as any)}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        active
                          ? "border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] ring-1 ring-[var(--sf-primary)]"
                          : "border-[#DBE5E0] bg-white hover:border-[var(--sf-primary)]"
                      }`}
                    >
                      <div className="sf-heading text-xs font-bold text-[#172B36]">{pm.label}</div>
                      <div className="text-[11px] text-[#607481] mt-0.5">{pm.sub}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4D616E] mb-1.5">
                  Order Note for Pharmacy{" "}
                  <span className="text-[#8899A4] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={customerNotes}
                  onChange={(e) => onChangeCustomerNotes(e.target.value)}
                  placeholder="Any specific note for the pharmacy team…"
                  className="w-full rounded-xl sf-input px-3.5 py-2.5 text-sm"
                />
              </div>
            </section>
          </form>

          {/* Right Column: Sticky Order Summary */}
          <div className="lg:col-span-5">
            <div className="sf-card rounded-2xl overflow-hidden lg:sticky lg:top-24">
              <div className="px-5 sm:px-6 py-4 bg-[#FAF8F4] border-b border-[#E2E8E4] flex items-center justify-between">
                <h2 className="sf-heading text-base font-extrabold text-[#172B36]">
                  Order Summary ({cartCalculations.totalItems})
                </h2>
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="text-xs font-semibold sf-text-brand hover:underline"
                >
                  + Add Items
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                {cartCalculations.remainingForFreeDelivery > 0 &&
                  fulfillmentType === "delivery" && (
                    <div className="rounded-xl sf-surface-mint border border-[#C5DFD7] p-3 text-xs text-[#172B36] flex items-center gap-2">
                      <TruckIcon className="w-4 h-4 sf-text-brand shrink-0" />
                      <span>
                        Add{" "}
                        <strong className="font-bold tabular-nums">
                          PKR {cartCalculations.remainingForFreeDelivery.toLocaleString()}
                        </strong>{" "}
                        more for <strong className="sf-text-brand">Free Home Delivery</strong>
                      </span>
                    </div>
                  )}

                {/* Itemized Cart Lines */}
                <div className="divide-y divide-[#E8EFEA] max-h-[340px] overflow-y-auto pr-1">
                  {cart.map((cartItem) => {
                    const { cartKey, product, selectedUnit, qty } = cartItem;
                    const unitPrice = Number(selectedUnit.price_pkr ?? 0);
                    const lineTotal = Number((unitPrice * qty).toFixed(2));
                    const itemCap = getCartItemMaxCap(cartItem, cart);

                    return (
                      <div key={cartKey} className="py-3.5 flex items-start gap-3">
                        <div className="w-16 h-16 rounded-xl border border-[#DCE7E2] bg-white overflow-hidden flex items-center justify-center shrink-0 p-1">
                          {product.primary_image_url ? (
                            <img
                              src={product.primary_image_url}
                              alt={product.name}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <MedicinePlaceholderIllustration
                              name={product.name}
                              dosageForm={product.dosage_form}
                              categoryName={product.category_name}
                              brandName={product.brand_name}
                              packingLabel={product.packing_label}
                              className="w-full h-full scale-90"
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="sf-heading text-xs font-bold text-[#172B36] truncate">
                                {product.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-[#F3F6F4] text-[#4D616E] text-[10.5px] font-semibold">
                                  {selectedUnit.label || selectedUnit.unit_name}
                                </span>
                                {product.requires_prescription && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                                    Rx
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onRemoveFromCart(cartKey)}
                              title="Remove item from cart"
                              aria-label={`Remove ${product.name} from cart`}
                              data-testid="checkout-remove-item-btn"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shrink-0"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <QuantityStepperInput
                              value={qty}
                              min={1}
                              max={itemCap}
                              size="sm"
                              onChange={(q) => onUpdateCartQty(cartKey, q)}
                              onCapReached={(cap) =>
                                onShowToast(
                                  `Maximum ${cap} ${selectedUnit.unit_name} available.`
                                )
                              }
                            />
                            <span className="sf-heading text-xs font-bold text-[#172B36] tabular-nums">
                              PKR {lineTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Promo Code */}
                <div className="pt-2 border-t border-[#E8EFEA] space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <TagIcon className="w-3.5 h-3.5 text-[#607481] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={promoCodeInput}
                        onChange={(e) => onChangePromoCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onApplyPromoCode(promoCodeInput.trim());
                          }
                        }}
                        placeholder="Promo code (optional)"
                        data-testid="checkout-promo-input"
                        className="w-full h-10 rounded-xl sf-input pl-8 pr-3 text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans"
                      />
                    </div>
                    <button
                      type="button"
                      data-testid="checkout-apply-promo-btn"
                      onClick={() => onApplyPromoCode(promoCodeInput.trim())}
                      className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-semibold"
                    >
                      Apply
                    </button>
                  </div>

                  {appliedPromoCode && cartCalculations.promoStatus === "applied" && (
                    <div
                      data-testid="promo-applied-banner"
                      className="rounded-xl sf-surface-mint border border-[#C5DFD7] px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#0E5146]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          <strong className="font-mono font-bold">{appliedPromoCode}</strong> applied
                          —{" "}
                          <strong className="font-semibold tabular-nums">
                            PKR {cartCalculations.discountPkr.toLocaleString()} off
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onChangePromoCodeInput("");
                          onApplyPromoCode("");
                        }}
                        title="Remove promo code"
                        className="hover:opacity-75 p-0.5 shrink-0"
                      >
                        <CloseIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {appliedPromoCode && cartCalculations.promoStatus === "below_min" && (
                    <div
                      data-testid="promo-below-min-banner"
                      className="rounded-xl sf-surface-ivory border border-[#EADFCE] px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#7C4A12]"
                    >
                      <span>
                        Code <strong className="font-mono">{appliedPromoCode}</strong> needs min
                        order{" "}
                        <strong>
                          PKR {Number(cartCalculations.promoMinOrderPkr || 0).toLocaleString()}
                        </strong>{" "}
                        (add PKR{" "}
                        {Number(cartCalculations.promoRemainingMinPkr || 0).toLocaleString()} more).
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onChangePromoCodeInput("");
                          onApplyPromoCode("");
                        }}
                        className="hover:opacity-75 p-0.5 shrink-0"
                      >
                        <CloseIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {appliedPromoCode && cartCalculations.promoStatus === "invalid" && (
                    <div
                      data-testid="promo-invalid-banner"
                      className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 flex items-center justify-between gap-2 text-xs text-rose-800"
                    >
                      <span>
                        Promo code <strong className="font-mono">{appliedPromoCode}</strong> is
                        invalid or expired.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onChangePromoCodeInput("");
                          onApplyPromoCode("");
                        }}
                        className="text-rose-700 hover:text-rose-950 p-0.5 shrink-0"
                      >
                        <CloseIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Warm Ivory Totals Box */}
                <div className="rounded-2xl sf-surface-ivory border border-[#EADFCE] p-4 space-y-2.5 text-xs tabular-nums">
                  <div className="flex justify-between text-[#4D616E]">
                    <span>Items Subtotal ({cartCalculations.totalItems})</span>
                    <span className="font-semibold text-[#172B36]">
                      PKR {cartCalculations.subtotalPkr.toLocaleString()}
                    </span>
                  </div>

                  {cartCalculations.discountPkr > 0 && (
                    <div
                      data-testid="checkout-discount-row"
                      className="flex justify-between sf-text-brand font-bold"
                    >
                      <span>
                        Promo Discount ({appliedPromoCode}
                        {cartCalculations.matchedPromo?.promo_type === "percentage"
                          ? ` • ${cartCalculations.matchedPromo.discount_value}%`
                          : ""}
                        )
                      </span>
                      <span>− PKR {cartCalculations.discountPkr.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-[#4D616E]">
                    <span>
                      {fulfillmentType === "pickup" ? "Counter Pickup" : "Delivery Fee"}
                    </span>
                    <span className="font-semibold text-[#172B36]">
                      {cartCalculations.deliveryFeePkr === 0
                        ? "Free"
                        : `PKR ${cartCalculations.deliveryFeePkr.toLocaleString()}`}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline text-base font-extrabold text-[#172B36] border-t border-[#E2D6C3] pt-3">
                    <span className="sf-heading">Total Payable</span>
                    <span className="sf-heading text-xl">
                      PKR {cartCalculations.totalPkr.toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  form="checkout-form"
                  disabled={checkoutSubmitting}
                  data-testid="place-order-submit-btn"
                  className="w-full h-12 px-4 rounded-xl sf-btn-primary font-bold text-sm shadow-xs tabular-nums"
                >
                  {checkoutSubmitting
                    ? "Submitting Order…"
                    : `Place Order • PKR ${cartCalculations.totalPkr.toLocaleString()}`}
                </button>

                <p className="text-[11.5px] text-[#607481] text-center leading-relaxed">
                  Orders are received directly at {displayName}&apos;s POS counter for live stock
                  verification.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
