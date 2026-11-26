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
  ChevronDownIcon,
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
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  // 1. Order Confirmation Screen
  if (completedOrder) {
    const confirmedDiscount = Number(completedOrder.discount_pkr || 0);
    const confirmedDeliveryFee = Number(completedOrder.delivery_fee_pkr || 0);
    const confirmedSubtotal = Number(completedOrder.subtotal_pkr || 0);
    const confirmedEmail = String(completedOrder.customer_email || "").trim();

    return (
      <main className="max-w-3xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-6 sm:py-10 flex-1 sf-fade-up">
        <div
          className="sf-card rounded-xl overflow-hidden shadow-lg"
          data-testid="order-confirmation-card"
        >
          {/* Deep Forest Confirmation Banner */}
          <div className="sf-surface-forest p-5 sm:p-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
              <div
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 text-[#111827]"
                style={{ backgroundColor: "var(--sf-warm-accent)" }}
              >
                <CheckCircleIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-emerald-400 block truncate">
                  Order Received • {displayName}
                </span>
                <h1 className="sf-heading text-xl sm:text-2xl font-extrabold text-white leading-tight">
                  Thank you, {completedOrder.customer_name}
                </h1>
                <p className="text-xs sm:text-sm text-[#D5EAE4]">
                  Tracking Ref:{" "}
                  <strong
                    className="font-mono font-bold text-white break-all"
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
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl sf-btn-warm text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0"
            >
              <ReceiptDownloadIcon className="w-4 h-4" />
              <span>
                {downloadingPdf ? "Preparing Receipt…" : "Download 80mm Invoice (PDF)"}
              </span>
            </button>
          </div>

          <div className="p-4 sm:p-8 space-y-5 sm:space-y-6 bg-white">
            {confirmedEmail && (invoiceEmailQueued || confirmedEmail.includes("@")) && (
              <div className="rounded-xl sm:rounded-2xl sf-surface-mint border border-[#C5DFD7] px-3.5 py-3 flex items-center gap-2.5 text-xs text-[#0E5146]">
                <MailIcon className="w-4 h-4 shrink-0" />
                <span className="break-words min-w-0">
                  Official invoice &amp; 80mm receipt PDF has also been emailed to{" "}
                  <strong className="font-semibold">{confirmedEmail}</strong>.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sf-surface-ivory rounded-xl sm:rounded-2xl p-3.5 sm:p-4 text-xs border border-[#E5E7EB]">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[#6B7280] block">Order Reference</span>
                <span className="font-mono font-bold text-[#111827] block truncate">
                  {completedOrder.order_number}
                </span>
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[#6B7280] block">Current Status</span>
                <span className="font-bold sf-text-brand capitalize block truncate">
                  {String(completedOrder.status).replace(/_/g, " ")}
                </span>
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[#6B7280] block">Fulfillment</span>
                <span className="font-bold text-[#111827] capitalize block truncate">
                  {completedOrder.fulfillment_type === "pickup"
                    ? "Counter Pickup"
                    : "Home Delivery"}
                </span>
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[#6B7280] block">Net Payable</span>
                <span className="sf-heading font-extrabold text-[#111827] tabular-nums block">
                  PKR {Number(completedOrder.total_pkr).toLocaleString()}
                </span>
              </div>
            </div>

            {completedOrder.items && completedOrder.items.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-xl sm:rounded-2xl divide-y divide-[#E8EFEA] overflow-hidden">
                <div className="px-3.5 sm:px-4 py-2.5 bg-[#F9FAFB] text-xs font-bold text-[#4B5563] flex justify-between gap-2">
                  <span>Receipt Breakdown</span>
                  <span className="font-mono truncate">{completedOrder.order_number}</span>
                </div>
                {completedOrder.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[#111827] break-words">
                        {item.product_name || item.product_name_snapshot}
                      </span>
                      <span className="text-xs text-[#6B7280] ml-1.5 whitespace-nowrap">
                        × {item.qty} {item.selling_unit_name || item.unit_label || ""}
                      </span>
                    </div>
                    <span className="font-bold text-[#111827] shrink-0 tabular-nums">
                      PKR {Number(item.line_total_pkr).toLocaleString()}
                    </span>
                  </div>
                ))}

                <div className="px-3.5 sm:px-4 py-2.5 bg-[#F9FAFB] flex justify-between text-xs text-[#4B5563] tabular-nums">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-[#111827]">
                    PKR {confirmedSubtotal.toLocaleString()}
                  </span>
                </div>

                {confirmedDiscount > 0 && (
                  <div className="px-3.5 sm:px-4 py-2.5 sf-surface-mint flex justify-between text-xs font-bold sf-text-brand tabular-nums">
                    <span>
                      Promo Discount
                      {completedOrder.applied_promo_code
                        ? ` (${completedOrder.applied_promo_code})`
                        : ""}
                    </span>
                    <span>− PKR {confirmedDiscount.toLocaleString()}</span>
                  </div>
                )}

                <div className="px-3.5 sm:px-4 py-2.5 bg-[#F9FAFB] flex justify-between text-xs text-[#4B5563] tabular-nums">
                  <span>
                    {completedOrder.fulfillment_type === "pickup"
                      ? "Counter Pickup"
                      : "Delivery Charges"}
                  </span>
                  <span className="font-semibold text-[#111827]">
                    {confirmedDeliveryFee === 0
                      ? "Free"
                      : `PKR ${confirmedDeliveryFee.toLocaleString()}`}
                  </span>
                </div>

                <div className="px-3.5 sm:px-4 py-3 sf-surface-ivory flex justify-between text-sm font-extrabold text-[#111827] tabular-nums">
                  <span>Total Payable</span>
                  <span>PKR {Number(completedOrder.total_pkr).toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 pt-1">
              {Number(settings?.whatsapp_order_assist_enabled ?? 1) === 1 && (
                <a
                  href={buildWhatsAppOrderShareUrl(completedOrder)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] px-5 rounded-xl sf-btn-primary text-xs font-semibold inline-flex items-center justify-center gap-2"
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
                className="min-h-[44px] px-5 rounded-xl bg-[#172B36] hover:bg-[#0F1E26] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition active:scale-[0.97]"
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
                className="min-h-[44px] px-4 rounded-xl sf-btn-secondary text-xs font-semibold"
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
      <main className="max-w-xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-10 sm:py-14 flex-1 sf-fade-up">
        <div className="sf-card rounded-xl p-8 sm:p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl sf-surface-mint border border-[var(--sf-primary-border)] flex items-center justify-center mx-auto sf-text-brand">
            <ShoppingBagIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h1 className="sf-heading text-xl font-extrabold text-[#111827]">Your Cart Is Empty</h1>
            <p className="text-sm text-[#6B7280]">
              Select medicines or healthcare supplies from {displayName} to proceed to checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectView("shop")}
            className="min-h-[44px] px-6 rounded-xl sf-btn-primary text-sm font-semibold"
          >
            Browse Medicines
          </button>
        </div>
      </main>
    );
  }

  const deliveryEnabled = deliveryConfig?.delivery_enabled !== false;
  const pickupEnabled = deliveryConfig?.pickup_enabled !== false;

  const renderCartItemLines = () => (
    <div className="divide-y divide-[#E8EFEA] max-h-[340px] overflow-y-auto pr-1">
      {cart.map((cartItem) => {
        const { cartKey, product, selectedUnit, qty } = cartItem;
        const unitPrice = Number(selectedUnit.price_pkr ?? 0);
        const lineTotal = Number((unitPrice * qty).toFixed(2));
        const itemCap = getCartItemMaxCap(cartItem, cart);

        return (
          <div key={cartKey} className="py-3 flex items-start gap-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-[#E5E7EB] bg-white overflow-hidden flex items-center justify-center shrink-0 p-1">
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
                  <p className="sf-heading text-xs font-bold text-[#111827] line-clamp-2">
                    {product.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-[#F3F6F4] text-[#4B5563] text-[10.5px] font-semibold">
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
                  className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition active:scale-95 shrink-0"
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
                    onShowToast(`Maximum ${cap} ${selectedUnit.unit_name} available.`)
                  }
                />
                <span className="sf-heading text-xs font-bold text-[#111827] tabular-nums whitespace-nowrap">
                  PKR {lineTotal.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTotalsBreakdown = () => (
    <div className="rounded-xl sm:rounded-2xl sf-surface-ivory border border-[#E5E7EB] p-3.5 sm:p-4 space-y-2.5 text-xs tabular-nums">
      <div className="flex justify-between text-[#4B5563]">
        <span>Items Subtotal ({cartCalculations.totalItems})</span>
        <span className="font-semibold text-[#111827]">
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

      <div className="flex justify-between text-[#4B5563]">
        <span>{fulfillmentType === "pickup" ? "Counter Pickup" : "Delivery Fee"}</span>
        <span className="font-semibold text-[#111827]">
          {cartCalculations.deliveryFeePkr === 0
            ? "Free"
            : `PKR ${cartCalculations.deliveryFeePkr.toLocaleString()}`}
        </span>
      </div>

      <div className="flex justify-between items-baseline text-base font-extrabold text-[#111827] border-t border-[#E2D6C3] pt-3">
        <span className="sf-heading">Total Payable</span>
        <span className="sf-heading text-lg sm:text-xl">
          PKR {cartCalculations.totalPkr.toLocaleString()}
        </span>
      </div>
    </div>
  );

  const renderPromoSection = (isDesktop: boolean) => (
    <div className="pt-2 border-t border-[#E8EFEA] space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <TagIcon className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            data-testid={isDesktop ? "checkout-promo-input" : "mobile-checkout-promo-input"}
            className="w-full min-h-[44px] sm:h-10 rounded-xl sf-input pl-8 pr-3 text-base sm:text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans"
          />
        </div>
        <button
          type="button"
          data-testid={isDesktop ? "checkout-apply-promo-btn" : "mobile-checkout-apply-promo-btn"}
          onClick={() => onApplyPromoCode(promoCodeInput.trim())}
          className="min-h-[44px] sm:h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold shrink-0"
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
              <strong className="font-mono font-bold">{appliedPromoCode}</strong> applied —{" "}
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
            className="hover:opacity-75 p-1 shrink-0"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {appliedPromoCode && cartCalculations.promoStatus === "below_min" && (
        <div
          data-testid="promo-below-min-banner"
          className="rounded-xl sf-surface-ivory border border-[#E5E7EB] px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#7C4A12]"
        >
          <span>
            Code <strong className="font-mono">{appliedPromoCode}</strong> needs min order{" "}
            <strong>PKR {Number(cartCalculations.promoMinOrderPkr || 0).toLocaleString()}</strong>{" "}
            (add PKR {Number(cartCalculations.promoRemainingMinPkr || 0).toLocaleString()} more).
          </span>
          <button
            type="button"
            onClick={() => {
              onChangePromoCodeInput("");
              onApplyPromoCode("");
            }}
            className="hover:opacity-75 p-1 shrink-0"
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
            Promo code <strong className="font-mono">{appliedPromoCode}</strong> is invalid or
            expired.
          </span>
          <button
            type="button"
            onClick={() => {
              onChangePromoCodeInput("");
              onApplyPromoCode("");
            }}
            className="text-rose-700 hover:text-rose-950 p-1 shrink-0"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  // 3. Active Mobile-First 1-Col / Desktop 2-Col Checkout
  return (
    <main className="flex-1 sf-fade-up">
      {/* Compact Deep Forest Checkout Header */}
      <section className="sf-surface-forest border-b border-white/10">
        <div className="max-w-7xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-emerald-400 block truncate">
              {displayName} • Online Order
            </span>
            <h1 className="sf-heading text-xl sm:text-3xl font-extrabold text-white mt-0.5 leading-tight">
              Checkout &amp; Fulfillment
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onSelectView("shop")}
            className="min-h-[40px] px-3.5 sm:px-4 rounded-xl sf-btn-ghost-light text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Add More</span>
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-10">
        {/* Mobile Collapsible Order Summary Accordion (At Top for Instant Clarity) */}
        <div className="lg:hidden sf-card rounded-xl overflow-hidden mb-4">
          <button
            type="button"
            onClick={() => setMobileSummaryOpen((v) => !v)}
            aria-expanded={mobileSummaryOpen}
            data-testid="mobile-checkout-summary-toggle"
            className="w-full min-h-[54px] px-4 py-3 bg-[#F9FAFB] flex items-center justify-between gap-3 text-left transition active:bg-[#F3F4F6]"
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <ShoppingBagIcon className="w-4 h-4 sf-text-brand shrink-0" />
              <span className="sf-heading text-sm font-extrabold text-[#111827] truncate">
                {mobileSummaryOpen ? "Hide" : "Show"} Order Summary ({cartCalculations.totalItems})
              </span>
              <ChevronDownIcon
                className={`w-4 h-4 text-[#6B7280] shrink-0 transition-transform duration-200 ${
                  mobileSummaryOpen ? "rotate-180" : ""
                }`}
              />
            </span>
            <span className="sf-heading text-base font-extrabold text-[#111827] tabular-nums shrink-0">
              PKR {cartCalculations.totalPkr.toLocaleString()}
            </span>
          </button>

          {mobileSummaryOpen && (
            <div className="p-4 border-t border-[#E5E7EB] space-y-4 bg-white">
              {cartCalculations.remainingForFreeDelivery > 0 && fulfillmentType === "delivery" && (
                <div className="rounded-xl sf-surface-mint border border-[#C5DFD7] p-3 text-xs text-[#111827] flex items-center gap-2">
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

              {renderCartItemLines()}
              {renderTotalsBreakdown()}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
          {/* Left Column: Customer, Fulfillment & Payment Form */}
          <form
            id="checkout-form"
            onSubmit={onSubmitOrder}
            className="lg:col-span-7 space-y-4 sm:space-y-6"
          >
            {checkoutError && (
              <div className="rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-200 p-3.5 sm:p-4 flex items-start gap-2.5 text-xs font-medium text-rose-800">
                <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Section 1: Contact Information */}
            <section className="sf-card rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full sf-surface-forest text-white text-xs font-bold inline-flex items-center justify-center shrink-0">
                  1
                </span>
                <h2 className="sf-heading text-base font-bold text-[#111827]">
                  Contact Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                    Customer / Patient Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={customerName}
                    onChange={(e) => onChangeCustomerName(e.target.value)}
                    placeholder="Full name"
                    data-testid="checkout-name-input"
                    className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                    Mobile / WhatsApp Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => onChangeCustomerPhone(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    data-testid="checkout-phone-input"
                    className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                    Email Address{" "}
                    <span className="text-[#8899A4] font-normal">
                      (Optional — receives official 80mm PDF receipt)
                    </span>
                  </label>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={customerEmail}
                    onChange={(e) => onChangeCustomerEmail(e.target.value)}
                    placeholder="name@example.com"
                    data-testid="checkout-email-input"
                    className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Delivery or Counter Pickup */}
            <section className="sf-card rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full sf-surface-forest text-white text-xs font-bold inline-flex items-center justify-center shrink-0">
                  2
                </span>
                <h2 className="sf-heading text-base font-bold text-[#111827]">
                  Delivery or Counter Pickup
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {deliveryEnabled && (
                  <button
                    type="button"
                    onClick={() => onChangeFulfillmentType("delivery")}
                    className={`p-3 sm:p-4 rounded-xl border text-left flex flex-col sm:flex-row items-start gap-2.5 sm:gap-3 transition active:scale-[0.98] min-h-[76px] ${
                      fulfillmentType === "delivery"
                        ? "border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] ring-1 ring-[var(--sf-primary)]"
                        : "border-[#E5E7EB] bg-white hover:border-[var(--sf-primary)]"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center sf-text-brand shrink-0">
                      <TruckIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="sf-heading text-[13px] sm:text-sm font-bold text-[#111827]">
                        Home Delivery
                      </div>
                      <div className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 tabular-nums leading-snug">
                        PKR{" "}
                        {Number(deliveryConfig?.standard_delivery_fee_pkr ?? 150).toLocaleString()}
                        {Number(deliveryConfig?.estimated_delivery_minutes || 0) > 0
                          ? ` • ~${deliveryConfig.estimated_delivery_minutes}m`
                          : ""}
                      </div>
                    </div>
                  </button>
                )}

                {pickupEnabled && (
                  <button
                    type="button"
                    onClick={() => onChangeFulfillmentType("pickup")}
                    className={`p-3 sm:p-4 rounded-xl border text-left flex flex-col sm:flex-row items-start gap-2.5 sm:gap-3 transition active:scale-[0.98] min-h-[76px] ${
                      fulfillmentType === "pickup"
                        ? "border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] ring-1 ring-[var(--sf-primary)]"
                        : "border-[#E5E7EB] bg-white hover:border-[var(--sf-primary)]"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center sf-text-brand shrink-0">
                      <StoreIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="sf-heading text-[13px] sm:text-sm font-bold text-[#111827]">
                        Counter Pickup
                      </div>
                      <div className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 leading-snug">
                        Free at counter
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {fulfillmentType === "delivery" ? (
                <div className="space-y-3.5 sm:space-y-4 pt-1">
                  {deliveryZones.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                        Delivery Area / Zone
                      </label>
                      <select
                        value={selectedZoneId}
                        onChange={(e) => onChangeSelectedZoneId(e.target.value)}
                        className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                        Complete Street / House Address <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="street-address"
                        value={deliveryAddress}
                        onChange={(e) => onChangeDeliveryAddress(e.target.value)}
                        placeholder="House #, Street, Sector / Area, Landmark"
                        data-testid="checkout-address-input"
                        className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                        City
                      </label>
                      <input
                        type="text"
                        value={deliveryCity}
                        onChange={(e) => onChangeDeliveryCity(e.target.value)}
                        placeholder={sf.city}
                        className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                      Delivery Landmark / Rider Note{" "}
                      <span className="text-[#8899A4] font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={deliveryInstructions}
                      onChange={(e) => onChangeDeliveryInstructions(e.target.value)}
                      placeholder="Optional gate, floor, or nearby landmark instructions"
                      className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="pt-1 space-y-2">
                  {branchesList.length > 0 ? (
                    <div>
                      <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                        Pickup Pharmacy Location
                      </label>
                      <select
                        value={selectedBranchId}
                        onChange={(e) => onChangeSelectedBranchId(e.target.value)}
                        className="w-full min-h-[46px] sm:h-11 rounded-xl sf-input px-3.5 text-base sm:text-sm"
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
                    <div className="p-3.5 rounded-xl sf-surface-ivory border border-[#E5E7EB] text-xs text-[#4B5563]">
                      Pickup Counter: <strong className="text-[#111827]">{displayName}</strong>
                      {sf.address_line ? ` — ${sf.address_line}, ${sf.city}` : ` (${sf.city})`}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Conditional Prescription Confirmation */}
            {cartCalculations.hasPrescriptionItems && (
              <section className="rounded-xl sm:rounded-2xl bg-rose-50/80 border border-rose-200 p-4 sm:p-6 space-y-3.5">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-900">
                  <PrescriptionIcon className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>Prescription Verification Required</span>
                </div>
                <label className="flex items-start gap-3 text-xs text-rose-900 leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rxAcknowledged}
                    onChange={(e) => onChangeRxAcknowledged(e.target.checked)}
                    data-testid="checkout-rx-checkbox"
                    className="mt-0.5 w-5 h-5 sm:w-4 sm:h-4 rounded border-rose-400 accent-rose-600 shrink-0"
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
                  className="w-full min-h-[44px] sm:h-10 rounded-xl border border-rose-200 bg-white px-3.5 text-base sm:text-xs text-[#111827] focus:outline-none focus:border-rose-400"
                />
              </section>
            )}

            {/* Payment Method & Notes */}
            <section className="sf-card rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full sf-surface-forest text-white text-xs font-bold inline-flex items-center justify-center shrink-0">
                  {cartCalculations.hasPrescriptionItems ? "4" : "3"}
                </span>
                <h2 className="sf-heading text-base font-bold text-[#111827]">
                  Payment &amp; Order Notes
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
                      className={`min-h-[54px] p-3.5 rounded-xl border text-left transition active:scale-[0.98] ${
                        active
                          ? "border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] ring-1 ring-[var(--sf-primary)]"
                          : "border-[#E5E7EB] bg-white hover:border-[var(--sf-primary)]"
                      }`}
                    >
                      <div className="sf-heading text-xs font-bold text-[#111827]">{pm.label}</div>
                      <div className="text-[11px] text-[#6B7280] mt-0.5">{pm.sub}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1.5">
                  Order Note for Pharmacy{" "}
                  <span className="text-[#8899A4] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={customerNotes}
                  onChange={(e) => onChangeCustomerNotes(e.target.value)}
                  placeholder="Any specific note for the pharmacy team…"
                  className="w-full rounded-xl sf-input px-3.5 py-2.5 text-base sm:text-sm"
                />
              </div>
            </section>

            {/* Mobile Promo Code & Totals Breakdown Card (Always Visible Before Sticky Submit) */}
            <section className="lg:hidden sf-card rounded-xl p-4 space-y-3.5">
              <h2 className="sf-heading text-sm font-extrabold text-[#111827]">
                Promo Code &amp; Bill Summary
              </h2>
              {renderPromoSection(false)}
              {renderTotalsBreakdown()}
              <p className="text-[11.5px] text-[#6B7280] text-center leading-relaxed">
                Orders are received directly at {displayName}&apos;s POS counter for live stock
                verification.
              </p>
            </section>
          </form>

          {/* Right Column: Desktop Sticky Order Summary */}
          <div className="hidden lg:block lg:col-span-5">
            <div className="sf-card rounded-2xl overflow-hidden lg:sticky lg:top-24">
              <div className="px-5 sm:px-6 py-4 bg-[#F9FAFB] border-b border-[#E5E7EB] flex items-center justify-between">
                <h2 className="sf-heading text-base font-extrabold text-[#111827]">
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
                    <div className="rounded-xl sf-surface-mint border border-[#C5DFD7] p-3 text-xs text-[#111827] flex items-center gap-2">
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

                {renderCartItemLines()}
                {renderPromoSection(true)}
                {renderTotalsBreakdown()}

                <button
                  type="submit"
                  form="checkout-form"
                  disabled={checkoutSubmitting}
                  data-testid="place-order-submit-btn"
                  className="w-full h-12 px-4 rounded-xl sf-btn-primary font-bold text-sm shadow-xs tabular-nums inline-flex items-center justify-center gap-2"
                >
                  {checkoutSubmitting && (
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  )}
                  <span>
                    {checkoutSubmitting
                      ? "Submitting Order…"
                      : `Place Order • PKR ${cartCalculations.totalPkr.toLocaleString()}`}
                  </span>
                </button>

                <p className="text-[11.5px] text-[#6B7280] text-center leading-relaxed">
                  Orders are received directly at {displayName}&apos;s POS counter for live stock
                  verification.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Mobile Bottom Place Order Bar (Prevents Double-Submit with In-Flight Spinner) */}
      <div
        data-testid="mobile-checkout-submit-bar"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] px-3.5 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="min-w-0 shrink-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#6B7280] leading-none">
              Total Payable
            </span>
            <span className="sf-heading text-base font-extrabold text-[#111827] tabular-nums leading-tight block mt-0.5">
              PKR {cartCalculations.totalPkr.toLocaleString()}
            </span>
          </div>
          <button
            type="submit"
            form="checkout-form"
            disabled={checkoutSubmitting}
            data-testid="mobile-place-order-submit-btn"
            className="flex-1 min-h-[46px] px-4 rounded-xl sf-btn-primary font-extrabold text-sm shadow-xs inline-flex items-center justify-center gap-2"
          >
            {checkoutSubmitting && (
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
            )}
            <span>{checkoutSubmitting ? "Submitting Order…" : "Place Order"}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
