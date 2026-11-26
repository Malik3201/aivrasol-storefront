import React, { useState } from "react";
import type {
  StorefrontBrandingRecord,
  StorefrontPublicContext,
  StorefrontSettingsRecord,
} from "../../shared/types";
import { CATEGORY_3D_MEDIA, EDITORIAL_MEDIA } from "../design/editorialAssets";
import { sanitizePublicCopy } from "../design/theme";
import type { StorefrontView } from "../types-ui";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  MailIcon,
  MapPinIcon,
  PackageTrackIcon,
  PhoneIcon,
  PrescriptionIcon,
  ReceiptDownloadIcon,
  ShieldCheckIcon,
  StoreIcon,
  TruckIcon,
  WhatsAppIcon,
} from "../components/Icons";
import { downloadStorefront80mmInvoicePdf } from "../utils/invoicePdf80mm";
import { submitOrderReview } from "../api";

interface OrderTrackingViewProps {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  displayName: string;
  trackOrderNumber: string;
  onChangeTrackOrderNumber: (v: string) => void;
  trackPhone?: string;
  onChangeTrackPhone?: (v: string) => void;
  trackingLoading: boolean;
  trackedOrder: any | null;
  trackingError: string | null;
  onSubmitTrack: (e: React.FormEvent) => void;
  onSelectView: (view: StorefrontView) => void;
}

export function OrderTrackingView({
  sf,
  branding,
  displayName,
  trackOrderNumber,
  onChangeTrackOrderNumber,
  trackingLoading,
  trackedOrder,
  trackingError,
  onSubmitTrack,
  onSelectView,
}: OrderTrackingViewProps) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewName, setReviewName] = useState<string>("");
  const [reviewComment, setReviewComment] = useState<string>("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewFeedbackMsg, setReviewFeedbackMsg] = useState<string | null>(null);
  const [submittedReview, setSubmittedReview] = useState<any | null>(null);
  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  const activeReview = submittedReview || trackedOrder?.existing_review || null;

  const stageGuide = [
    {
      code: "01",
      title: "Order Received",
      desc: `Your online medicine request is logged instantly for ${displayName}'s counter queue.`,
    },
    {
      code: "02",
      title: "Counter Confirmed",
      desc: "Our pharmacy staff confirms live stock availability, pack units, and prescription notes.",
    },
    {
      code: "03",
      title: "Preparing & Batch Check",
      desc: "Items are picked from temperature-monitored shelves, expiry-checked, and sealed.",
    },
    {
      code: "04",
      title: "Dispatch / Ready to Collect",
      desc: "Handed to a local delivery rider or staged at our pickup desk for zero-wait collection.",
    },
    {
      code: "05",
      title: "Completed & 80mm Receipt",
      desc: "Order fulfilled with an official itemized 80mm thermal PDF bill available anytime.",
    },
  ];

  return (
    <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-10">
      {/* Photo-Led Aurora Forest Masthead */}
      <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-3.5">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
              <PackageTrackIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
              <span>Single-Reference Live Tracking • {displayName}</span>
            </span>
            <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-tight">
              Track Your Online Order &amp; Download Receipt
            </h1>
            <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-xl">
              Enter your order reference number (for example, <code className="font-mono text-[#FFE3BA]">ORD-...</code>)
              to view live counter confirmation, packing status, itemized billing, and your official
              80mm PDF receipt — no account login required.
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="sf-hero-glass-frame rounded-[26px] p-2.5">
              <img
                src={EDITORIAL_MEDIA.careParcelWebp}
                alt={`Prepared pharmacy order parcel at ${displayName}`}
                loading="eager"
                decoding="async"
                className="w-full aspect-[16/10] object-cover rounded-[18px]"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Main Lookup & Result Card */}
        <div className="sf-card-elevated rounded-3xl p-5 sm:p-8 space-y-6">
          <form
            onSubmit={onSubmitTrack}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end"
          >
            <div className="sm:col-span-8">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#4A606D] mb-2">
                Order Reference / Tracking Number
              </label>
              <input
                type="text"
                required
                value={trackOrderNumber}
                onChange={(e) => onChangeTrackOrderNumber(e.target.value.toUpperCase())}
                placeholder="e.g. ORD-261111-3017"
                data-testid="track-order-number-input"
                className="w-full h-12 rounded-xl sf-input px-4 text-sm font-mono font-semibold uppercase placeholder:normal-case placeholder:font-sans"
              />
            </div>

            <div className="sm:col-span-4">
              <button
                type="submit"
                disabled={trackingLoading}
                data-testid="track-order-submit-btn"
                className="w-full h-12 px-5 rounded-xl sf-glass-cta text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <PackageTrackIcon className="w-4 h-4" />
                <span>{trackingLoading ? "Checking Status…" : "Check Order Status"}</span>
              </button>
            </div>
          </form>

          {trackingError && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-xs sm:text-sm font-medium text-rose-800">
              <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{trackingError}</span>
            </div>
          )}

          {trackedOrder && (
            <div
              className="space-y-6 pt-6 border-t border-[#E2ECE7]"
              data-testid="tracked-order-result"
            >
              {/* Warm Ivory Status & Invoice Header */}
              <div className="sf-surface-ivory rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border border-[#EADBC4]">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A5B2B] block">
                    Order Reference
                  </span>
                  <span className="text-lg sm:text-xl font-mono font-bold text-[#172B36] block">
                    {trackedOrder.order_number}
                  </span>
                  {trackedOrder.pos_invoice_number && (
                    <span className="text-xs font-mono text-[#607481] block">
                      POS Invoice Ref: {trackedOrder.pos_invoice_number}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {trackedOrder.payment_status && (
                    <span
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${trackedOrder.payment_status === "paid"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : trackedOrder.payment_status === "partially_paid"
                          ? "bg-sky-50 text-sky-800 border-sky-200"
                          : trackedOrder.payment_status === "refunded"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-white text-[#4A606D] border-[#D6E2DC]"
                        }`}
                    >
                      Payment: {String(trackedOrder.payment_status).replace(/_/g, " ")}
                      {trackedOrder.payment_status === "partially_paid" &&
                        trackedOrder.cod_balance_due_pkr !== undefined &&
                        trackedOrder.cod_balance_due_pkr !== null
                        ? ` (Due: PKR ${Number(trackedOrder.cod_balance_due_pkr).toLocaleString()})`
                        : ""}
                    </span>
                  )}

                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${trackedOrder.status === "cancelled" || trackedOrder.status === "rejected"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "sf-badge-brand"
                      }`}
                  >
                    {String(trackedOrder.status).replace(/_/g, " ")}
                  </span>

                  <button
                    type="button"
                    disabled={downloadingPdf}
                    data-testid="track-download-80mm-invoice-btn"
                    onClick={async () => {
                      setDownloadingPdf(true);
                      try {
                        await downloadStorefront80mmInvoicePdf({
                          sf,
                          branding,
                          displayName,
                          order: trackedOrder,
                        });
                      } finally {
                        setDownloadingPdf(false);
                      }
                    }}
                    className="h-9 px-3.5 rounded-xl sf-btn-secondary text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <ReceiptDownloadIcon className="w-3.5 h-3.5 sf-text-brand" />
                    <span>{downloadingPdf ? "Preparing…" : "80mm Invoice (PDF)"}</span>
                  </button>
                </div>
              </div>

              {/* 5-Step Progress Timeline */}
              {(() => {
                const isPickup = trackedOrder.fulfillment_type === "pickup";
                const steps = isPickup
                  ? [
                    { key: "pending_confirmation", label: "Received" },
                    { key: "confirmed", label: "Confirmed" },
                    { key: "preparing", label: "Preparing" },
                    { key: "ready_for_pickup", label: "Ready for Pickup" },
                    { key: "collected", label: "Collected" },
                  ]
                  : [
                    { key: "pending_confirmation", label: "Received" },
                    { key: "confirmed", label: "Confirmed" },
                    { key: "preparing", label: "Preparing" },
                    { key: "out_for_delivery", label: "Out for Delivery" },
                    { key: "delivered", label: "Delivered" },
                  ];
                const rawSt = String(trackedOrder.status || "");
                const normalizedSt =
                  rawSt === "completed"
                    ? isPickup
                      ? "collected"
                      : "delivered"
                    : rawSt === "pending"
                      ? "pending_confirmation"
                      : rawSt;
                const stepKeys = steps.map((s) => s.key);
                const currentIdx = stepKeys.indexOf(normalizedSt);
                const isTerminalCancel =
                  rawSt === "cancelled" || rawSt === "rejected" || rawSt === "returned";

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                    {steps.map((step, idx) => {
                      const done = !isTerminalCancel && currentIdx >= idx;
                      const isCurrent = !isTerminalCancel && currentIdx === idx;
                      return (
                        <div
                          key={step.key}
                          className={`p-3.5 rounded-2xl border flex sm:flex-col items-center sm:justify-center gap-2 text-xs font-semibold transition-colors ${done
                            ? isCurrent
                              ? "sf-pill-active shadow-sm"
                              : "bg-[#E9F5F1] border-[#CBE4DC] text-[#0E5146]"
                            : "bg-[#FAF8F4] border-[#DCE7E2] text-[#8A9BA6]"
                            }`}
                        >
                          <CheckCircleIcon className="w-4 h-4 shrink-0" />
                          <span className="text-center leading-tight">{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Ordered Items Summary */}
              {trackedOrder.items && trackedOrder.items.length > 0 && (
                <div className="border border-[#D8E5DF] rounded-2xl divide-y divide-[#E8F0EC] overflow-hidden text-xs sm:text-sm bg-white">
                  <div className="px-5 py-3 bg-[#E9F5F1]/65 font-bold text-xs uppercase tracking-wider text-[#0E5146]">
                    Ordered Medicines &amp; Bill Summary
                  </div>
                  {trackedOrder.items.map((it: any, i: number) => (
                    <div key={i} className="px-5 py-3.5 flex justify-between items-center gap-3">
                      <div>
                        <strong className="text-[#172B36] font-semibold">
                          {it.product_name_snapshot ||
                            it.product_name ||
                            it.name ||
                            "Medicine Item"}
                        </strong>
                        <span className="text-[#607481] ml-2">
                          × {it.qty}{" "}
                          {it.selling_unit_name ||
                            it.unit_label_snapshot ||
                            it.unit_label ||
                            ""}
                        </span>
                      </div>
                      <span className="sf-num font-bold text-[#172B36] shrink-0">
                        PKR {Number(it.line_total_pkr).toLocaleString()}
                      </span>
                    </div>
                  ))}

                  {trackedOrder.subtotal_pkr !== undefined &&
                    trackedOrder.subtotal_pkr !== null && (
                      <div className="px-5 py-2.5 bg-[#FAF8F4] flex justify-between text-[#4A606D] text-xs sm:text-sm">
                        <span>Items Subtotal</span>
                        <span className="sf-num font-semibold text-[#172B36]">
                          PKR {Number(trackedOrder.subtotal_pkr).toLocaleString()}
                        </span>
                      </div>
                    )}

                  {Number(trackedOrder.discount_pkr || 0) > 0 && (
                    <div className="px-5 py-2.5 bg-[#E9F5F1]/75 flex justify-between text-[#0E5146] font-semibold text-xs sm:text-sm">
                      <span>Promotional Discount</span>
                      <span className="sf-num">
                        − PKR {Number(trackedOrder.discount_pkr).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {Number(trackedOrder.delivery_fee_pkr || 0) > 0 && (
                    <div className="px-5 py-2.5 bg-[#FAF8F4] flex justify-between text-[#4A606D] text-xs sm:text-sm">
                      <span>Delivery Fee</span>
                      <span className="sf-num">
                        PKR {Number(trackedOrder.delivery_fee_pkr).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="px-5 py-3.5 bg-[#FFF8ED] flex justify-between font-bold text-sm sm:text-base text-[#172B36]">
                    <span>Order Total</span>
                    <span className="sf-num">
                      PKR {Number(trackedOrder.total_pkr).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Verified Customer Order Feedback & Review Box */}
              <div className="rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider sf-text-brand block">
                      Verified Order Feedback
                    </span>
                    <h3 className="sf-heading text-base font-extrabold text-[#0F172A]">
                      Rate Your Experience with {displayName}
                    </h3>
                  </div>
                  {activeReview && (
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        activeReview.status === "published"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      {activeReview.status === "published"
                        ? "Published on Website"
                        : "Submitted — Awaiting Owner Publish"}
                    </span>
                  )}
                </div>

                {activeReview ? (
                  <div className="rounded-xl bg-white border border-[#E2E8F0] p-4 space-y-2">
                    <div className="flex items-center gap-1 text-amber-500 text-base leading-none">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star}>{star <= Number(activeReview.rating || 5) ? "★" : "☆"}</span>
                      ))}
                      <span className="ml-2 text-xs font-bold text-[#0F172A]">
                        {activeReview.customer_name || trackedOrder.customer_name}
                      </span>
                    </div>
                    <p className="text-sm text-[#334155] leading-relaxed">{activeReview.comment}</p>
                    {activeReview.owner_reply && (
                      <div className="mt-2 pt-2 border-t border-[#F1F5F9] text-xs text-[#475569]">
                        <strong className="text-[#0F172A]">{displayName} replied:</strong>{" "}
                        {activeReview.owner_reply}
                      </div>
                    )}
                    {reviewFeedbackMsg && (
                      <p className="text-xs font-semibold text-emerald-700 pt-1">
                        {reviewFeedbackMsg}
                      </p>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setReviewFeedbackMsg(null);
                      if (reviewComment.trim().length < 4) {
                        setReviewFeedbackMsg("Please write a short review (at least 4 characters).");
                        return;
                      }
                      setReviewSubmitting(true);
                      try {
                        const res = await submitOrderReview({
                          order_number: trackedOrder.order_number,
                          rating: reviewRating,
                          comment: reviewComment.trim(),
                          customer_name:
                            reviewName.trim() || trackedOrder.customer_name || "Verified Customer",
                        });
                        if (res.ok && res.review) {
                          setSubmittedReview(res.review);
                          setReviewFeedbackMsg(
                            res.message || "Thank you! Your review was submitted."
                          );
                        } else {
                          setReviewFeedbackMsg(res.message || "Could not submit review right now.");
                        }
                      } catch {
                        setReviewFeedbackMsg("Network error while submitting your feedback.");
                      } finally {
                        setReviewSubmitting(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-bold text-[#334155]">Your Rating:</span>
                      <div className="inline-flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewRating(star)}
                            aria-label={`Rate ${star} stars`}
                            className={`text-2xl leading-none transition-transform hover:scale-110 ${
                              star <= reviewRating ? "text-amber-500" : "text-slate-300"
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-semibold text-[#64748B]">
                        {reviewRating} / 5
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder={trackedOrder.customer_name || "Your name (optional)"}
                        className="h-10 rounded-xl sf-input px-3 text-xs sm:text-sm"
                      />
                      <input
                        type="text"
                        required
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="How was delivery speed, packaging & medicine quality?"
                        className="sm:col-span-2 h-10 rounded-xl sf-input px-3 text-xs sm:text-sm"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {reviewFeedbackMsg ? (
                        <p className="text-xs font-semibold text-rose-600">{reviewFeedbackMsg}</p>
                      ) : (
                        <p className="text-[11px] text-[#64748B]">
                          Your feedback goes directly to {displayName} and appears on the website once published.
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={reviewSubmitting}
                        data-testid="submit-order-review-btn"
                        className="h-10 px-5 rounded-xl sf-btn-primary text-xs font-bold shrink-0"
                      >
                        {reviewSubmitting ? "Submitting…" : "Submit Verified Review"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5-Stage Fulfillment Guide + Digital Receipt Info */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 sf-card rounded-3xl p-6 sm:p-7 space-y-5">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0E5146]">
                Understanding Order Statuses
              </span>
              <h2 className="sf-display text-xl font-extrabold text-[#172B36]">
                How Your Order Progresses at {displayName}
              </h2>
            </div>

            <div className="space-y-3">
              {stageGuide.map((st) => (
                <div
                  key={st.code}
                  className="p-3.5 rounded-2xl bg-[#FAF8F4] border border-[#E3ECE7] flex items-start gap-3.5"
                >
                  <span className="w-8 h-8 rounded-xl bg-[#0E5146] text-[#FFF8ED] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                    {st.code}
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-[#172B36]">{st.title}</h3>
                    <p className="text-xs text-[#5A6F7B] leading-relaxed">{st.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 sf-catalog-showcase-bg rounded-3xl border border-[#CBE2DA] p-6 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden border border-white/80 shadow-sm aspect-[16/9]">
                <img
                  src={EDITORIAL_MEDIA.conciergeSupportWebp}
                  alt={`${displayName} concierge counter`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0E5146]">
                  <ReceiptDownloadIcon className="w-3.5 h-3.5" />
                  <span>Official 80mm Pharmacy Receipt</span>
                </span>
                <h3 className="sf-display text-lg font-extrabold text-[#132630]">
                  Download Your Itemized Bill Anytime
                </h3>
                <p className="text-xs sm:text-sm text-[#4F6470] leading-relaxed">
                  Once your order is submitted, you can generate an authentic 80mm thermal-format
                  PDF receipt showing exact selling units, promotional discounts, delivery charges,
                  and {displayName} counter details.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#C9E0D8] flex flex-wrap items-center gap-2.5">
              {sf.contact_phone && (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                  <span>{sf.contact_phone}</span>
                </a>
              )}
              {whatsappDigits && (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 px-4 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  <span>WhatsApp Counter</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onSelectView("shop")}
                className="h-10 px-4 rounded-xl sf-btn-soft text-xs font-bold inline-flex items-center gap-1.5"
              >
                <span>Browse Catalog</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

interface InfoPagesViewProps {
  activeView: "about" | "branches" | "delivery" | "hours" | "contact" | "privacy" | "terms";
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  settings?: Partial<StorefrontSettingsRecord> | Record<string, any> | null;
  displayName: string;
  deliveryConfig: any;
  deliveryZones: Array<any>;
  branchesList: Array<any>;
  openingHours: Record<string, any>;
  onSelectView: (view: StorefrontView) => void;
}

export function InfoPagesView({
  activeView,
  sf,
  branding,
  settings,
  displayName,
  deliveryConfig,
  deliveryZones,
  branchesList,
  openingHours,
  onSelectView,
}: InfoPagesViewProps) {
  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");
  const deliveryEnabled = deliveryConfig?.delivery_enabled !== false;
  const pickupEnabled = deliveryConfig?.pickup_enabled !== false;
  const standardFeePkr = Number(deliveryConfig?.standard_delivery_fee_pkr ?? 150);
  const freeThresholdPkr = Number(deliveryConfig?.free_delivery_threshold_pkr ?? 2000);
  const minOrderPkr = Number(
    deliveryConfig?.min_order_amount_pkr ?? deliveryConfig?.minimum_order_value_pkr ?? 0
  );
  const estimatedMinutes = Number(deliveryConfig?.estimated_delivery_minutes || 0);

  const scheduleSummary = openingHours?.is_24_hours
    ? "Open 24 Hours, 7 Days a Week"
    : openingHours?.mon_sat || "09:00 AM – 11:00 PM";

  const fullAddress = sf.address_line
    ? `${sf.address_line}, ${sf.city}, Pakistan`
    : `${sf.city}, Pakistan`;

  // =========================================================================
  // 1. ABOUT US — COMPREHENSIVE MULTI-SECTION EDITORIAL PAGE
  // =========================================================================
  if (activeView === "about") {
    const aboutHeading = sanitizePublicCopy(
      branding?.about_title,
      sf,
      `About ${displayName} — Community Healthcare & Online Dispensing`
    );
    const aboutParagraph = sanitizePublicCopy(
      branding?.about_content,
      sf,
      `${displayName} serves patients, caregivers, and households across ${sf.city} with authentic counter-synced medicines, surgical supplies, and family wellness essentials — combining trusted neighbourhood pharmacy care with seamless online ordering.`
    );

    const qualityPillars = [
      {
        title: "Counter-Synced Live Inventory",
        desc: `Unlike generic online aggregators, every product published on this storefront is linked directly to ${displayName}'s active pharmacy POS shelves, ensuring real stock visibility and accurate pack configurations.`,
        icon: CATEGORY_3D_MEDIA.medicines,
      },
      {
        title: "Flexible Unit-Level Dispensing",
        desc: "Patients often need a single blister strip or an exact tablet count rather than an entire carton. Our catalog supports clear unit selection (Box, Strip, Tablet, or Unit) with transparent unit pricing.",
        icon: CATEGORY_3D_MEDIA.general,
      },
      {
        title: "Responsible Prescription Care",
        desc: "Prescription-only medications are clearly marked across the storefront and undergo verification against a registered medical practitioner's prescription prior to final dispensing.",
        icon: CATEGORY_3D_MEDIA.prescription,
      },
      {
        title: "Clinical Hygiene & Sealed Packing",
        desc: "From sterile surgical blades and respiratory nebulizer accessories to everyday pediatric and dental care, items are stored cleanly, expiry-inspected, and packed securely.",
        icon: CATEGORY_3D_MEDIA.surgical,
      },
    ];

    const dispensingWorkflow = [
      {
        step: "01",
        title: "Live Shelf & Batch Verification",
        text: `As soon as an online order arrives at ${displayName}, our counter staff verifies the requested strength, dosage form, and active batch expiry directly on our pharmacy shelves.`,
      },
      {
        step: "02",
        title: "Prescription & Dosage Cross-Check",
        text: "Where an item requires medical authorization, our counter team reviews prescription details or contacts the customer directly by phone or WhatsApp before packing.",
      },
      {
        step: "03",
        title: "Itemized POS Billing & 80mm Receipt",
        text: "Every fulfilled order generates a transparent itemized pharmacy bill reflecting exact unit quantities, active promotional discounts, and delivery fees — downloadable as an 80mm PDF.",
      },
      {
        step: "04",
        title: "Protected Local Dispatch or Express Pickup",
        text: `Orders are sealed in protective outer wrapping for doorstep Cash-on-Delivery across ${sf.city} or held ready at our counter for immediate zero-fee collection.`,
      },
    ];

    return (
      <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-12 sm:space-y-16">
        {/* Section A: Flagship Aurora Hero */}
        <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-11 sm:py-16 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-7 space-y-4">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
                <StoreIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                <span>Neighbourhood Pharmacy • {sf.city}</span>
              </span>
              <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-[1.12]">
                {aboutHeading}
              </h1>
              <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-2xl">
                {aboutParagraph}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="h-11 px-6 rounded-xl sf-btn-warm text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-md"
                >
                  <span>Explore Medicines Catalog</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectView("branches")}
                  className="h-11 px-5 rounded-xl sf-btn-ghost-light text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
                >
                  <MapPinIcon className="w-4 h-4 text-[#9AF0DF]" />
                  <span>Counter Location</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="sf-hero-glass-frame rounded-[28px] p-2.5">
                <img
                  src={EDITORIAL_MEDIA.heroFlagshipDesktopWebp}
                  alt={`${displayName} sunlit apothecary interior`}
                  loading="eager"
                  decoding="async"
                  className="w-full aspect-[4/3] object-cover rounded-[20px]"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
          {/* Section B: Verified Pharmacy Identity Matrix */}
          <section className="sf-surface-ivory rounded-3xl p-6 sm:p-8 border border-[#EADBC4] space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#7A5B2B]">
                  Official Pharmacy Profile
                </span>
                <h2 className="sf-display text-xl sm:text-2xl font-extrabold text-[#172B36]">
                  Verified Counter Identity — {displayName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onSelectView("contact")}
                className="h-9 px-4 rounded-xl bg-white border border-[#DECBAE] text-xs font-bold text-[#172B36] hover:bg-[#FAF3E8] transition inline-flex items-center gap-1.5"
              >
                <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                <span>Contact Pharmacy Desk</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-white border border-[#EADBC4] space-y-1">
                <span className="text-[#607481] font-medium block">Operating Pharmacy</span>
                <span className="text-sm font-extrabold text-[#172B36] block">{displayName}</span>
                <span className="text-[11px] text-[#0E5146] font-semibold block">
                  POS Counter-Connected Storefront
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#EADBC4] space-y-1">
                <span className="text-[#607481] font-medium block">Physical Counter Address</span>
                <span className="text-sm font-bold text-[#172B36] block leading-snug">
                  {fullAddress}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#EADBC4] space-y-1">
                <span className="text-[#607481] font-medium block">Direct Counter Hours</span>
                <span className="text-sm font-bold text-[#172B36] block">{scheduleSummary}</span>
                {sf.contact_phone && (
                  <a
                    href={`tel:${sf.contact_phone}`}
                    className="text-xs font-bold text-[#0E5146] hover:underline block pt-0.5 tabular-nums"
                  >
                    Tel: {sf.contact_phone}
                  </a>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#EADBC4] space-y-1">
                <span className="text-[#607481] font-medium block">
                  {sf.drug_sale_license_no ? "Regulatory Registration" : "Fulfillment Modes"}
                </span>
                {sf.drug_sale_license_no ? (
                  <>
                    <span className="text-sm font-mono font-bold text-[#172B36] block">
                      {sf.drug_sale_license_no}
                    </span>
                    {sf.pharmacist_name && (
                      <span className="text-[11px] text-[#5B6E7A] block">
                        Pharmacist: {sf.pharmacist_name}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold text-[#172B36] block">
                      {deliveryEnabled && pickupEnabled
                        ? "Home Delivery & Free Pickup"
                        : deliveryEnabled
                          ? "Local Home Delivery"
                          : "In-Store Counter Pickup"}
                    </span>
                    <span className="text-[11px] text-[#5B6E7A] block">
                      80mm Digital &amp; Printed Billing
                    </span>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Section C: Editorial Story + Dispensing Desk Photography */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Our Dispensing Philosophy
              </span>
              <h2 className="sf-display text-2xl sm:text-3xl font-extrabold text-[#11242D] leading-tight">
                Real Neighbourhood Pharmacy Accountability — Now Accessible Online
              </h2>
              <div className="space-y-3.5 text-sm sm:text-[15px] text-[#4E6370] leading-relaxed">
                <p>
                  Ordering healthcare products online should never mean guessing where your
                  medicines come from or how they were stored. At{" "}
                  <strong className="text-[#172B36]">{displayName}</strong>, this website serves as
                  a direct digital window into our physical retail counter in{" "}
                  <strong className="text-[#172B36]">{sf.city}</strong>.
                </p>
                <p>
                  Every published tablet box, oral liquid, sterile surgical instrument, respiratory
                  device, and personal-care item reflects real counter pricing and real selling
                  units configured inside our pharmacy management system. Whether a household needs
                  everyday fever relief, chronic therapy refills, surgical dressings, or infant care
                  essentials, orders are prepared by the same counter team serving walk-in patients
                  daily.
                </p>
                <p>
                  By uniting live inventory synchronization, straightforward Cash-on-Delivery,
                  single-ID order tracking, and instant 80mm thermal PDF invoices, we make routine
                  and urgent healthcare access simpler, clearer, and more dependable.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-3">
              <div className="sf-card-elevated rounded-3xl p-3">
                <img
                  src={EDITORIAL_MEDIA.dispensingDeskWebp}
                  alt={`Clinical dispensing desk and prescription verification at ${displayName}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[16/9] object-cover rounded-2xl"
                />
                <div className="px-3 pt-3 pb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#546975]">
                  <span className="font-semibold text-[#172B36]">
                    Direct Counter Preparation &amp; Expiry Inspection
                  </span>
                  <span className="text-[#0E5146] font-bold">{sf.city}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Section D: 4 Core Healthcare Pillars (Glassmorphic Band + 3D Icons) */}
        <section className="sf-catalog-showcase-bg border-y border-[#CDE2DA] py-12 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="space-y-1.5 max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Why Families Choose {displayName}
              </span>
              <h2 className="sf-display text-2xl sm:text-3xl font-extrabold text-[#11242D]">
                Four Standards Behind Every Online Order
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {qualityPillars.map((p) => (
                <div
                  key={p.title}
                  className="sf-glass-surface-card rounded-[26px] p-6 flex items-start gap-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-white/90 border border-[#D8E8E2] p-2 flex items-center justify-center shrink-0 shadow-2xs">
                    <img
                      src={p.icon}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain mix-blend-multiply"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="sf-display text-base sm:text-lg font-extrabold text-[#11242D]">
                      {p.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#516673] leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section E: 4-Step Counter Quality Protocol + Concierge CTA */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <section className="space-y-6">
            <div className="space-y-1.5 max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Inside Our Workflow
              </span>
              <h2 className="sf-display text-2xl sm:text-3xl font-extrabold text-[#172B36]">
                From Digital Cart to Sealed Handover
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dispensingWorkflow.map((w) => (
                <div key={w.step} className="sf-card rounded-2xl p-5 space-y-3">
                  <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-[#E9F5F1] border border-[#C6E2D9] text-xs font-mono font-extrabold text-[#0E5146]">
                    Stage {w.step}
                  </span>
                  <h3 className="sf-display text-base font-bold text-[#172B36]">{w.title}</h3>
                  <p className="text-xs sm:text-[13.5px] text-[#5B6F7B] leading-relaxed">
                    {w.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="sf-surface-forest rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-xl">
            <div className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-between gap-5">
              <div className="space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-widest text-[#E6A65B]">
                  Ready to Order or Visit?
                </span>
                <h2 className="sf-display text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  Browse Live Stock or Speak Directly with {displayName}
                </h2>
                <p className="text-sm text-[#D4EAE3] leading-relaxed max-w-xl">
                  Explore available medicines by department, track an existing order, or reach our
                  counter team in {sf.city} for personalized assistance.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="h-11 px-5 rounded-xl sf-btn-warm text-xs sm:text-sm font-extrabold inline-flex items-center gap-2"
                >
                  <span>Browse Medicines</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectView("contact")}
                  className="h-11 px-5 rounded-xl sf-btn-ghost-light text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
                >
                  <PhoneIcon className="w-4 h-4 text-[#E6A65B]" />
                  <span>Contact Counter</span>
                </button>
              </div>
            </div>
            <div className="lg:col-span-5 min-h-[240px] bg-[#08352E] relative overflow-hidden">
              <img
                src={EDITORIAL_MEDIA.counterInteriorWebp}
                alt={`${displayName} pharmacy shelves`}
                decoding="async"
                className="w-full h-full lg:absolute lg:inset-0 object-cover"
              />
            </div>
          </section>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 2. LOCATIONS / BRANCHES — DETAILED BRANCH & IN-STORE PICKUP GUIDE
  // =========================================================================
  if (activeView === "branches") {
    const normalizedBranches =
      branchesList.length > 0
        ? branchesList
        : [
          {
            id: "main",
            name: `${displayName} — Main Pharmacy Counter`,
            address_line: sf.address_line,
            city: sf.city,
            phone: sf.contact_phone,
            whatsapp_phone: sf.whatsapp_phone,
            latitude: sf.latitude,
            longitude: sf.longitude,
            delivery_enabled: deliveryEnabled ? 1 : 0,
            pickup_enabled: pickupEnabled ? 1 : 0,
          },
        ];

    const visitChecklist = [
      {
        title: "Keep Your Order Reference Handy",
        desc: "For online pickup orders, share your ORD-... reference number at the counter for immediate parcel handover.",
      },
      {
        title: "Carry Valid Prescriptions for Rx Items",
        desc: "If your order includes prescription-regulated medicines, bring the original prescription or have a clear image ready.",
      },
      {
        title: "Zero Pickup Fees & Fast Collection",
        desc: "Reserving online locks in live shelf stock so your strips, boxes, or surgical supplies are packed before you arrive.",
      },
      {
        title: "Printed & 80mm Digital Receipts",
        desc: "Collect your official POS receipt at the counter or download the identical 80mm PDF bill directly on your phone.",
      },
    ];

    return (
      <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-12">
        {/* Section A: Photo-Led Locations Hero */}
        <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-3.5">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
                <MapPinIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                <span>Verified Retail Counter • {sf.city}</span>
              </span>
              <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-tight">
                {displayName} Locations &amp; Pickup Desk
              </h1>
              <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-xl">
                Find our verified pharmacy street address, operating schedule, direct telephone
                lines, and express counter collection details in {sf.city}.
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="sf-hero-glass-frame rounded-[26px] p-2.5">
                <img
                  src={EDITORIAL_MEDIA.counterInteriorWebp}
                  alt={`${displayName} retail branch interior`}
                  loading="eager"
                  decoding="async"
                  className="w-full aspect-[16/10] object-cover rounded-[18px]"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section B: Detailed Architectural Branch Cards */}
          <section className="space-y-5">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Authorized Dispensing Counters
              </span>
              <h2 className="sf-display text-2xl font-extrabold text-[#172B36]">
                Active Pharmacy Branches ({normalizedBranches.length})
              </h2>
            </div>

            <div
              className={
                normalizedBranches.length === 1
                  ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
                  : "grid grid-cols-1 md:grid-cols-2 gap-6"
              }
            >
              {normalizedBranches.map((b: any) => {
                const rawBranchName = String(b.branch_name || b.name || displayName);
                const cleanBranchName = rawBranchName.includes("ABDUL REHMAN")
                  ? rawBranchName.replace(/ABDUL REHMAN/gi, displayName)
                  : rawBranchName;
                const branchAddress = b.address_line || sf.address_line;
                const branchCity = b.city || sf.city;
                const branchPhone = b.contact_phone || b.phone || sf.contact_phone;
                const branchWhatsApp = (
                  b.whatsapp_phone ||
                  sf.whatsapp_phone ||
                  branchPhone ||
                  ""
                ).replace(/[^0-9]/g, "");
                const hasCoords =
                  b.latitude !== null &&
                  b.latitude !== undefined &&
                  b.longitude !== null &&
                  b.longitude !== undefined;
                const mapsHref = hasCoords
                  ? `https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`
                  : branchAddress
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${displayName}, ${branchAddress}, ${branchCity}`
                    )}`
                    : null;

                return (
                  <div
                    key={b.id}
                    className={`${
                      normalizedBranches.length === 1 ? "lg:col-span-7" : ""
                    } sf-card-elevated rounded-3xl p-6 sm:p-7 space-y-5 flex flex-col justify-between`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="sf-display text-xl font-extrabold text-[#172B36]">
                            {cleanBranchName}
                          </h3>
                          <p className="text-xs font-semibold text-[#607481]">
                            {branchCity}, Pakistan
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[11px] font-bold sf-badge-brand shrink-0">
                          Active Counter
                        </span>
                      </div>

                      {/* Service Capability Badges */}
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                        <span className="px-2.5 py-1 rounded-lg bg-[#E9F5F1] text-[#0E5146] border border-[#C6E2D9]">
                          Walk-In Dispensing
                        </span>
                        {Number(b.pickup_enabled ?? 1) === 1 && (
                          <span className="px-2.5 py-1 rounded-lg bg-[#FFF8ED] text-[#7A5B2B] border border-[#EADBC4]">
                            Free Online Pickup
                          </span>
                        )}
                        {Number(b.delivery_enabled ?? 1) === 1 && (
                          <span className="px-2.5 py-1 rounded-lg bg-[#EAF4F3] text-[#087E78] border border-[#BFE0DD]">
                            Local Delivery Dispatch
                          </span>
                        )}
                      </div>

                      <div className="rounded-2xl bg-[#FAF8F4] border border-[#E2ECE7] p-4 space-y-3 text-xs sm:text-sm text-[#4A606D]">
                        <div className="flex items-start gap-2.5">
                          <MapPinIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px] uppercase tracking-wider font-bold text-[#607481] block">
                              Street Location
                            </span>
                            <span className="font-semibold text-[#172B36]">
                              {branchAddress
                                ? `${branchAddress}, ${branchCity}`
                                : `${branchCity}, Pakistan`}
                            </span>
                          </div>
                        </div>

                        {branchPhone && (
                          <div className="flex items-start gap-2.5">
                            <PhoneIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[11px] uppercase tracking-wider font-bold text-[#607481] block">
                                Direct Counter Line
                              </span>
                              <a
                                href={`tel:${branchPhone}`}
                                className="font-bold text-[#0E5146] hover:underline tabular-nums"
                              >
                                {branchPhone}
                              </a>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start gap-2.5">
                          <ClockIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px] uppercase tracking-wider font-bold text-[#607481] block">
                              Operating Schedule
                            </span>
                            <span className="font-medium text-[#172B36]">{scheduleSummary}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E6EFEA] flex flex-wrap items-center gap-2.5">
                      {branchPhone && (
                        <a
                          href={`tel:${branchPhone}`}
                          className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                          <span>Call Counter</span>
                        </a>
                      )}

                      {branchWhatsApp && (
                        <a
                          href={`https://wa.me/${branchWhatsApp}`}
                          target="_blank"
                          rel="noreferrer"
                          className="h-10 px-4 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      )}

                      {mapsHref && (
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="h-10 px-4 rounded-xl sf-btn-soft text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <span>Open in Maps</span>
                          <ExternalLinkIcon className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {normalizedBranches.length === 1 && (
                <div className="lg:col-span-5 sf-surface-ivory rounded-3xl border border-[#EADBC4] overflow-hidden flex flex-col justify-between">
                  <img
                    src={EDITORIAL_MEDIA.heroFlagshipDesktopWebp}
                    alt={`${displayName} consultation counter`}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[16/10] object-cover"
                  />
                  <div className="p-6 space-y-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#7A5B2B] block">
                      On-Site Counter Services
                    </span>
                    <h3 className="sf-display text-lg font-extrabold text-[#172B36]">
                      Direct Dispensing &amp; Express Order Handover
                    </h3>
                    <ul className="space-y-2 text-xs text-[#4E6370]">
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0" />
                        <span>Walk-in prescription &amp; OTC medicine dispensing</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0" />
                        <span>Sterile surgical &amp; respiratory equipment stock</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0" />
                        <span>Printed &amp; digital 80mm itemized POS receipts</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section C: Visual Counter Pickup Walkthrough */}
          <section className="sf-catalog-showcase-bg rounded-3xl border border-[#CBE2DA] p-6 sm:p-9 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Express In-Store Collection
              </span>
              <h2 className="sf-display text-2xl sm:text-3xl font-extrabold text-[#11242D] leading-tight">
                Reserve Online &amp; Collect at the Counter Without Waiting
              </h2>
              <p className="text-sm text-[#4D626E] leading-relaxed">
                Need medicines on your commute or prefer picking up in person? Select{" "}
                <strong className="text-[#11242D]">Counter Pickup</strong> during online checkout at{" "}
                {displayName}. Our pharmacy team checks shelf stock, packs your exact units, and
                marks your order <strong className="text-[#0E5146]">Ready for Pickup</strong> so you
                can step up and collect immediately.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="h-11 px-5 rounded-xl sf-glass-cta text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                >
                  <span>Start a Pickup Order</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectView("track")}
                  className="h-11 px-5 rounded-xl bg-white border border-[#C7DFD7] text-xs sm:text-sm font-bold text-[#132630] inline-flex items-center gap-2"
                >
                  <PackageTrackIcon className="w-4 h-4 sf-text-brand" />
                  <span>Check Pickup Status</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="sf-glass-surface-card rounded-[24px] p-3">
                <img
                  src={EDITORIAL_MEDIA.conciergeSupportWebp}
                  alt={`Counter pickup parcels prepared at ${displayName}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[16/9] object-cover rounded-[16px]"
                />
              </div>
            </div>
          </section>

          {/* Section D: Walk-In & Pickup Checklist */}
          <section className="space-y-5">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A5B2B] block">
                Visitor Guide
              </span>
              <h2 className="sf-display text-2xl font-extrabold text-[#172B36]">
                Helpful Tips When Visiting {displayName}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {visitChecklist.map((item) => (
                <div key={item.title} className="sf-card rounded-2xl p-5 space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-[#E9F5F1] text-[#0E5146] flex items-center justify-center">
                    <CheckCircleIcon className="w-5 h-5" />
                  </div>
                  <h3 className="sf-display text-sm sm:text-base font-bold text-[#172B36]">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-[#5B6F7B] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 3. DELIVERY INFORMATION — RATES, ZONES, PACKAGING & DISPATCH STANDARDS
  // =========================================================================
  if (activeView === "delivery") {
    const dispatchTimeline = [
      {
        step: "01",
        title: "Checkout & Zone Calculation",
        desc: `Delivery fees (PKR ${standardFeePkr.toLocaleString()}) and free-shipping thresholds${freeThresholdPkr > 0 ? ` (above PKR ${freeThresholdPkr.toLocaleString()})` : ""
          } calculate automatically in your cart.`,
      },
      {
        step: "02",
        title: "Counter Stock & Rx Review",
        desc: `Every medicine, strength, and unit is verified at ${displayName}'s counter before rider assignment.`,
      },
      {
        step: "03",
        title: "Protective Tamper-Safe Packing",
        desc: "Glass syrups, blister strips, and sterile surgical items are cushioned and sealed in discreet outer parcels.",
      },
      {
        step: "04",
        title: "Doorstep Handover & COD Settlement",
        desc: `Pay conveniently on arrival in ${sf.city} and verify your itemized 80mm receipt.`,
      },
    ];

    return (
      <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-12">
        {/* Section A: Photo-Led Fulfillment Hero */}
        <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-3.5">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
                <TruckIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                <span>Local Healthcare Fulfillment • {sf.city}</span>
              </span>
              <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-tight">
                Delivery &amp; Counter Pickup Information
              </h1>
              <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-xl">
                Transparent delivery rates, automatic free-delivery eligibility, protective medicine
                packaging standards, and free in-store counter collection at {displayName}.
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="sf-hero-glass-frame rounded-[26px] p-2.5">
                <img
                  src={EDITORIAL_MEDIA.careParcelWebp}
                  alt="Carefully packed pharmacy delivery parcel"
                  loading="eager"
                  decoding="async"
                  className="w-full aspect-[16/10] object-cover rounded-[18px]"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section B: 4 Fulfillment Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sf-card-elevated rounded-2xl p-5 space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#607481] block">
                Standard Delivery Fee
              </span>
              <span className="sf-display sf-num text-2xl font-extrabold text-[#172B36] block">
                {deliveryEnabled ? `PKR ${standardFeePkr.toLocaleString()}` : "Not Enabled"}
              </span>
              <span className="text-xs text-[#607481] block">Local rider coverage ({sf.city})</span>
            </div>

            <div className="sf-surface-ivory rounded-2xl border border-[#EADBC4] p-5 space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#7A5B2B] block">
                Free Delivery Threshold
              </span>
              <span className="sf-display sf-num text-2xl font-extrabold text-[#0E5146] block">
                {freeThresholdPkr > 0 ? `PKR ${freeThresholdPkr.toLocaleString()}` : "Standard Rates"}
              </span>
              <span className="text-xs text-[#607481] block">
                Waived automatically in checkout
              </span>
            </div>

            <div className="sf-card-elevated rounded-2xl p-5 space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#607481] block">
                Minimum Delivery Order
              </span>
              <span className="sf-display sf-num text-2xl font-extrabold text-[#172B36] block">
                {minOrderPkr > 0 ? `PKR ${minOrderPkr.toLocaleString()}` : "No Minimum"}
              </span>
              <span className="text-xs text-[#607481] block">
                {estimatedMinutes > 0
                  ? `Typical dispatch ~${estimatedMinutes} mins`
                  : "Dispatched promptly after check"}
              </span>
            </div>

            <div className="sf-surface-mint rounded-2xl border border-[#C6E2D9] p-5 space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0E5146] block">
                In-Store Counter Pickup
              </span>
              <span className="sf-display text-2xl font-extrabold text-[#0E5146] block">
                {pickupEnabled ? "PKR 0 (Free)" : "Unavailable"}
              </span>
              <span className="text-xs text-[#4A606D] block">
                Reserve online, collect at {displayName}
              </span>
            </div>
          </div>

          {/* Section C: Active Delivery Zones Table (If Configured) */}
          {deliveryZones.length > 0 && (
            <div className="sf-card-elevated rounded-3xl overflow-hidden">
              <div className="px-6 py-4 bg-[#FAF8F4] border-b border-[#E2ECE7] flex items-center justify-between">
                <h2 className="sf-display text-base sm:text-lg font-extrabold text-[#172B36]">
                  Configured Local Delivery Zones ({sf.city})
                </h2>
                <span className="text-xs font-semibold text-[#0E5146]">Live Rates</span>
              </div>
              <div className="divide-y divide-[#E8F0EC] text-sm">
                {deliveryZones.map((z) => (
                  <div
                    key={z.id}
                    className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className="font-bold text-[#172B36]">{z.zone_name || z.name}</span>
                    <div className="text-xs text-[#607481] flex items-center gap-4">
                      <span>
                        Delivery Fee:{" "}
                        <strong className="sf-num text-[#172B36]">
                          PKR {Number(z.fee_pkr ?? z.delivery_fee_pkr ?? 0).toLocaleString()}
                        </strong>
                      </span>
                      {z.estimated_minutes && <span>Est. Time: ~{z.estimated_minutes} mins</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section D: 4-Stage Dispatch Workflow */}
          <section className="space-y-5">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                How Fulfillment Works
              </span>
              <h2 className="sf-display text-2xl font-extrabold text-[#172B36]">
                Four Steps from Checkout to Doorstep
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dispatchTimeline.map((d) => (
                <div key={d.step} className="sf-card rounded-2xl p-5 space-y-2.5">
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-[#0E5146] text-[#FFF8ED] font-mono text-xs font-bold">
                    {d.step}
                  </span>
                  <h3 className="sf-display text-base font-bold text-[#172B36]">{d.title}</h3>
                  <p className="text-xs sm:text-[13.5px] text-[#586D79] leading-relaxed">
                    {d.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Section E: Packaging, Cold-Chain & Handling Split Showcase */}
          <section className="sf-catalog-showcase-bg rounded-3xl border border-[#CBE2DA] p-6 sm:p-9 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5">
              <div className="sf-glass-surface-card rounded-[24px] p-3">
                <img
                  src={EDITORIAL_MEDIA.dispensingDeskWebp}
                  alt={`Medicine inspection and preparation at ${displayName}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[16/10] object-cover rounded-[16px]"
                />
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0E5146]">
                <ShieldCheckIcon className="w-4 h-4" />
                <span>Pharmaceutical Handling &amp; Care Standards</span>
              </div>
              <h2 className="sf-display text-2xl font-extrabold text-[#11242D]">
                Packed with Clinical Care — Never Tossed in Unmarked Bags
              </h2>
              <ul className="space-y-2.5 text-xs sm:text-sm text-[#4A606D] leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#172B36]">Batch &amp; Expiry Verification:</strong> All
                    units are checked against active counter batches at {displayName} prior to
                    sealing.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#172B36]">Prescription Compliance:</strong>{" "}
                    Prescription-required items are released only after valid medical prescription
                    verification.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#172B36]">Temperature &amp; Fragile Care:</strong>{" "}
                    {deliveryConfig?.cold_chain_notes ||
                      "Oral suspensions, glass bottles, diagnostic devices, and heat-sensitive items are cushioned and dispatched promptly for local transit."}
                  </span>
                </li>
              </ul>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="h-11 px-6 rounded-xl sf-glass-cta text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                >
                  <span>Browse Available Medicines</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectView("terms")}
                  className="h-11 px-5 rounded-xl bg-white border border-[#C7DFD7] text-xs sm:text-sm font-bold text-[#132630] inline-flex items-center gap-2"
                >
                  <span>Dispensing &amp; Return Policy</span>
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. CONTACT & BUSINESS HOURS — CONCIERGE DESKS, SCHEDULE & INQUIRY GUIDE
  // =========================================================================
  if (activeView === "contact" || activeView === "hours") {
    const inquiryTips = [
      {
        title: "Medicine Name & Strength",
        desc: "Mention the exact strength (e.g., 500mg, 250mg/5ml) and dosage form (Tablet, Syrup, Injection, or Device) for instant shelf lookup.",
      },
      {
        title: "Preferred Selling Unit",
        desc: "Let our counter know whether you need full Boxes, individual Blister Strips, single Tablets, or sterile individual Units.",
      },
      {
        title: "Existing Order Reference",
        desc: "Following up on an online order? Share your ORD-... tracking code so we can pull up your live counter ticket immediately.",
      },
      {
        title: "Doctor's Prescription Photo",
        desc: "For Rx-flagged medications, sending a clear photo of your doctor's prescription on WhatsApp speeds up verification.",
      },
    ];

    return (
      <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-12">
        {/* Section A: Photo-Led Concierge Hero */}
        <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
                <PhoneIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                <span>Direct Pharmacy Counter Desk • {sf.city}</span>
              </span>
              <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-tight">
                {activeView === "hours"
                  ? `Operating Hours & Dispatch Schedule — ${displayName}`
                  : `Contact ${displayName} Counter & Support`}
              </h1>
              <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-xl">
                Speak directly with our pharmacy counter team in {sf.city} for stock inquiries,
                prescription review, order updates, or walk-in counter assistance.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {sf.contact_phone && (
                  <a
                    href={`tel:${sf.contact_phone}`}
                    className="h-11 px-5 rounded-xl sf-btn-warm text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 tabular-nums shadow-md"
                  >
                    <PhoneIcon className="w-4 h-4" />
                    <span>Call {sf.contact_phone}</span>
                  </a>
                )}
                {whatsappDigits && (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 px-5 rounded-xl sf-btn-ghost-light text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <WhatsAppIcon className="w-4 h-4 text-[#9AF0DF]" />
                    <span>WhatsApp Counter</span>
                  </a>
                )}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="sf-hero-glass-frame rounded-[26px] p-2.5">
                <img
                  src={EDITORIAL_MEDIA.conciergeSupportWebp}
                  alt={`${displayName} pharmacy telephone and parcel support desk`}
                  loading="eager"
                  decoding="async"
                  className="w-full aspect-[16/10] object-cover rounded-[18px]"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section B: Dedicated Pharmacy Support Channels */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Desk 1: Phone */}
            <div className="sf-card-elevated rounded-3xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-2xl sf-surface-forest text-white flex items-center justify-center">
                  <PhoneIcon className="w-5 h-5 text-[#E6A65B]" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0E5146] block">
                  Voice Assistance
                </span>
                <h2 className="sf-display text-lg font-extrabold text-[#172B36]">
                  Pharmacy Counter Telephone
                </h2>
                <p className="text-xs sm:text-sm text-[#5A6F7B] leading-relaxed">
                  Best for urgent stock availability checks, strength confirmations, and active local
                  delivery coordination.
                </p>
              </div>
              {sf.contact_phone ? (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="h-11 px-4 rounded-xl sf-btn-secondary text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 tabular-nums"
                >
                  <PhoneIcon className="w-4 h-4 sf-text-brand" />
                  <span>{sf.contact_phone}</span>
                </a>
              ) : (
                <span className="text-xs font-semibold text-[#607481]">
                  Available during counter hours
                </span>
              )}
            </div>

            {/* Desk 2: WhatsApp */}
            <div className="sf-catalog-showcase-bg rounded-3xl border border-[#CBE2DA] p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0E5146] text-white flex items-center justify-center">
                  <WhatsAppIcon className="w-5 h-5 text-[#9AF0DF]" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0E5146] block">
                  Messaging &amp; Rx Desk
                </span>
                <h2 className="sf-display text-lg font-extrabold text-[#11242D]">
                  WhatsApp Order &amp; Prescription Desk
                </h2>
                <p className="text-xs sm:text-sm text-[#4D626E] leading-relaxed">
                  Send clear prescription photos, medicine box snapshots, or quick questions for our
                  dispensing counter team.
                </p>
              </div>
              {whatsappDigits ? (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-11 px-4 rounded-xl sf-glass-cta text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Chat on WhatsApp</span>
                </a>
              ) : (
                <span className="text-xs font-semibold text-[#607481]">
                  Visit counter for prescription review
                </span>
              )}
            </div>

            {/* Desk 3: Walk-In & Email */}
            <div className="sf-card-elevated rounded-3xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-[#FFF8ED] border border-[#EADBC4] text-[#8B5719] flex items-center justify-center">
                  <MapPinIcon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A5B2B] block">
                  In-Person Service
                </span>
                <h2 className="sf-display text-lg font-extrabold text-[#172B36]">
                  Walk-In Retail Counter
                </h2>
                <p className="text-xs sm:text-sm text-[#5A6F7B] leading-relaxed">{fullAddress}</p>
                {sf.contact_email && (
                  <a
                    href={`mailto:${sf.contact_email}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E5146] hover:underline break-all"
                  >
                    <MailIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{sf.contact_email}</span>
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelectView("branches")}
                className="h-11 px-4 rounded-xl sf-btn-soft text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <span>View Location &amp; Pickup Guide</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>

          {/* Section C: Operating Hours & Service Windows Split */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 sf-surface-ivory rounded-3xl border border-[#EADBC4] p-6 sm:p-8 space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7A5B2B]">
                  Weekly Schedule
                </span>
                <h2 className="sf-display text-2xl font-extrabold text-[#172B36]">
                  Counter, Pickup &amp; Dispatch Hours
                </h2>
              </div>

              <div className="divide-y divide-[#E7D8C0] bg-white rounded-2xl border border-[#EADBC4] overflow-hidden text-xs sm:text-sm">
                {openingHours?.is_24_hours ? (
                  <div className="p-4 flex items-center justify-between gap-3">
                    <span className="font-bold text-[#172B36]">Monday – Sunday (All Week)</span>
                    <span className="px-3 py-1 rounded-full bg-[#E9F5F1] text-[#0E5146] font-bold text-xs">
                      Open 24 Hours
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="p-4 flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#4A606D]">Monday – Saturday</span>
                      <strong className="sf-num font-extrabold text-[#172B36]">
                        {openingHours?.mon_sat || "09:00 AM – 11:00 PM"}
                      </strong>
                    </div>
                    <div className="p-4 flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#4A606D]">Sunday</span>
                      <strong className="sf-num font-extrabold text-[#172B36]">
                        {openingHours?.sun || "10:00 AM – 10:00 PM"}
                      </strong>
                    </div>
                  </>
                )}
                <div className="p-4 flex items-center justify-between gap-3 bg-[#FAF8F4]">
                  <span className="font-semibold text-[#4A606D]">
                    Online Catalog &amp; Order Placement
                  </span>
                  <strong className="text-[#0E5146] font-bold">24/7 Online Queue</strong>
                </div>
                <div className="p-4 flex items-center justify-between gap-3 bg-[#FAF8F4]">
                  <span className="font-semibold text-[#4A606D]">
                    Order Tracking &amp; 80mm PDF Receipt
                  </span>
                  <strong className="text-[#0E5146] font-bold">Instant Self-Service</strong>
                </div>
              </div>

              <p className="text-xs text-[#607481] leading-relaxed">
                Orders placed outside active counter hours are queued automatically and prioritized
                for stock verification and dispatch as soon as the counter opens.
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="sf-card-elevated rounded-3xl overflow-hidden">
                <img
                  src={EDITORIAL_MEDIA.counterInteriorWebp}
                  alt={`${displayName} pharmacy interior`}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[4/3] object-cover"
                />
                <div className="p-5 space-y-1.5">
                  <p className="sf-display text-base font-bold text-[#172B36]">{displayName}</p>
                  <p className="text-xs text-[#607481]">{fullAddress}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section D: Fast Inquiry Preparation Guide */}
          <section className="space-y-5">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Faster Assistance
              </span>
              <h2 className="sf-display text-2xl font-extrabold text-[#172B36]">
                What to Share When Calling or Messaging Our Counter
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {inquiryTips.map((tip) => (
                <div key={tip.title} className="sf-card rounded-2xl p-5 space-y-2">
                  <h3 className="sf-display text-sm sm:text-base font-bold text-[#172B36]">
                    {tip.title}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-[#5A6F7B] leading-relaxed">
                    {tip.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 5. TERMS & DISPENSING CONDITIONS — LONG-FORM STRUCTURED LEGAL DOCUMENT
  // =========================================================================
  if (activeView === "terms") {
    const customDisclaimer =
      settings?.legal_disclaimer_text ||
      "All prescription-regulated medicines require a valid prescription issued by a registered medical practitioner prior to dispensing.";

    const termsSections = [
      {
        id: "terms-scope",
        num: "01",
        title: "Scope of Storefront & Pharmacy Identity",
        paragraphs: [
          `This online storefront is operated for ${displayName}, located at ${fullAddress}. By browsing the catalog, adding healthcare items to your cart, or submitting an online order request, you agree to these Terms & Dispensing Conditions.`,
          `Unlike third-party courier marketplaces that source from unverified intermediaries, all products listed on this website represent catalog items managed by ${displayName}'s connected pharmacy counter system.`,
        ],
      },
      {
        id: "terms-orders",
        num: "02",
        title: "Online Order Requests & Counter Acceptance",
        paragraphs: [
          `Submitting an order through the checkout page creates a structured online order request (assigned a unique ORD-... reference) queued for review at ${displayName}. An online submission does not constitute final pharmaceutical dispensing until our counter staff verifies live shelf stock, batch integrity, and regulatory eligibility.`,
          `In the rare event that an item experiences a simultaneous walk-in stock depletion, batch recall, or pack update before your order is packed, ${displayName} will contact you promptly by phone or WhatsApp to confirm a quantity adjustment or cancellation prior to dispatch.`,
        ],
      },
      {
        id: "terms-rx",
        num: "03",
        title: "Prescription (Rx) Medicines & Dispensing Compliance",
        paragraphs: [
          customDisclaimer,
          `Products flagged as prescription-required in the catalog are dispensed strictly upon verification of a current, legible prescription from a qualified medical practitioner. ${displayName} reserves the professional right to decline, hold, or limit quantities of regulated, antibiotic, sedative, or controlled preparations where clinical or legal requirements are not met.`,
        ],
      },
      {
        id: "terms-units",
        num: "04",
        title: "Selling Units (Box, Strip, Tablet) & Counter-Synced Pricing",
        paragraphs: [
          `Where supported by manufacturer packaging and pharmacy policy, medicines may be offered in multiple selling units — such as full Boxes, individual Blister Strips, single Tablets, or individual medical Units. The unit price and stock availability displayed on the card correspond directly to the selling unit you select.`,
          `All prices are denominated in Pakistani Rupees (PKR). While our catalog synchronizes continuously with ${displayName}'s POS billing system, regulated maximum retail prices (MRP) printed on active manufacturer batches govern final counter billing.`,
        ],
      },
      {
        id: "terms-promos",
        num: "05",
        title: "Promotional Codes & Checkout Discounts",
        paragraphs: [
          `Owner-configured promotional codes and seasonal campaigns apply only when entered and validated during online checkout within their active validity window and minimum order threshold (if specified).`,
          `Validated promotional discounts are deducted transparently on your checkout summary, tracked order bill, and downloadable 80mm PDF receipt. Promotions cannot be redeemed for cash or retroactively applied to completed counter transactions.`,
        ],
      },
      {
        id: "terms-fulfillment",
        num: "06",
        title: "Local Home Delivery, Counter Pickup & Cash on Delivery",
        paragraphs: [
          `Customers may choose Local Home Delivery within ${sf.city} (standard fee PKR ${standardFeePkr.toLocaleString()}${freeThresholdPkr > 0
            ? `, waived automatically on eligible orders above PKR ${freeThresholdPkr.toLocaleString()}`
            : ""
          }) or complimentary In-Store Counter Pickup at ${displayName}.`,
          `For Cash on Delivery (COD) orders, full payment is due upon parcel handover at the delivery address provided. Please ensure an adult recipient is reachable on the contact phone number submitted at checkout.`,
        ],
      },
      {
        id: "terms-returns",
        num: "07",
        title: "Pharmaceutical Returns, Exchanges & Safety Restrictions",
        paragraphs: [
          `To protect patient safety and medicine integrity, refrigerated/temperature-sensitive items, opened oral liquids/syrups, cut tablet strips, unsealed surgical/sterile supplies, and personal hygiene products cannot be returned or restocked once they leave pharmacy custody.`,
          `If you receive an incorrect item, damaged outer seal, or billing discrepancy, please notify ${displayName} immediately upon delivery or pickup${sf.contact_phone ? ` at ${sf.contact_phone}` : ""
          } with your ORD-... reference and 80mm receipt so our counter team can verify and resolve the issue promptly.`,
        ],
      },
      {
        id: "terms-disclaimer",
        num: "08",
        title: "Product Illustrations & Medical Advice Disclaimer",
        paragraphs: [
          `Where an owner-uploaded pack photograph is not yet attached, neutral studio healthcare illustrations are displayed to indicate dosage category (tablets, liquids, surgical supplies, or medical equipment). Always verify the physical manufacturer label, strength, and dosage instructions upon receipt.`,
          `Catalog descriptions, category labels, and FAQ guides on this website are provided solely for retail ordering convenience and never substitute professional diagnosis, prescription, or medical advice from your physician.`,
        ],
      },
      {
        id: "terms-contact",
        num: "09",
        title: "Customer Support, Inquiries & Governing Framework",
        paragraphs: [
          `These conditions operate in accordance with applicable pharmacy retail and consumer regulations in Pakistan. For any questions regarding an online order, invoice, or dispensing policy, please contact ${displayName} directly at ${fullAddress}${sf.contact_phone ? ` or call ${sf.contact_phone}` : ""
          }.`,
        ],
      },
    ];

    return (
      <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-10">
        {/* Photo-Led Legal & Clinical Masthead */}
        <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-3.5">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                <span>Storefront Governance • {displayName}</span>
              </span>
              <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-tight">
                Terms &amp; Dispensing Conditions
              </h1>
              <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-xl">
                Comprehensive terms governing online medicine ordering, unit-level POS pricing,
                prescription verification, local delivery, and pharmaceutical safety at{" "}
                {displayName} ({sf.city}).
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="sf-hero-glass-frame rounded-[26px] p-2.5">
                <img
                  src={EDITORIAL_MEDIA.dispensingDeskWebp}
                  alt={`Prescription clipboard and medication boxes at ${displayName}`}
                  loading="eager"
                  decoding="async"
                  className="w-full aspect-[16/10] object-cover rounded-[18px]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column Structured Legal Layout */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sticky Table of Contents & Pharmacy Box */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
            <div className="sf-card-elevated rounded-3xl p-5 sm:p-6 space-y-4">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0E5146] block">
                Document Sections
              </span>
              <nav aria-label="Terms sections" className="space-y-1.5 text-xs">
                {termsSections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#4A606D] hover:text-[#0E5146] hover:bg-[#E9F5F1]/70 font-semibold transition"
                  >
                    <span className="font-mono text-[11px] font-bold text-[#0E5146]">
                      {sec.num}
                    </span>
                    <span className="truncate">{sec.title}</span>
                  </a>
                ))}
              </nav>
            </div>

            <div className="sf-surface-ivory rounded-3xl border border-[#EADBC4] p-5 space-y-3 text-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#7A5B2B] block">
                Dispensing Pharmacy
              </span>
              <p className="text-sm font-extrabold text-[#172B36]">{displayName}</p>
              <p className="text-[#5B6F7B] leading-relaxed">{fullAddress}</p>
              {sf.drug_sale_license_no && (
                <p className="font-mono font-bold text-[#0E5146]">
                  License: {sf.drug_sale_license_no}
                </p>
              )}
              <div className="pt-2 border-t border-[#E6D6BC] flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelectView("privacy")}
                  className="h-9 px-3.5 rounded-xl bg-white border border-[#DECBAE] font-bold text-[#172B36] hover:bg-[#FAF3E8] transition inline-flex items-center gap-1.5"
                >
                  <span>Privacy Policy</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </aside>

          {/* Long-Form Clauses */}
          <article className="lg:col-span-8 space-y-5">
            {termsSections.map((sec) => (
              <section
                key={sec.id}
                id={sec.id}
                className="sf-card rounded-3xl p-6 sm:p-8 space-y-3.5 scroll-mt-28"
              >
                <div className="flex items-start gap-3">
                  <span className="px-2.5 py-1 rounded-lg bg-[#E9F5F1] border border-[#C6E2D9] font-mono text-xs font-extrabold text-[#0E5146] shrink-0 whitespace-nowrap mt-0.5">
                    Section {sec.num}
                  </span>
                  <h2 className="sf-display text-lg sm:text-xl font-extrabold text-[#172B36]">
                    {sec.title}
                  </h2>
                </div>
                <div className="space-y-3 text-xs sm:text-[14.5px] text-[#4B606D] leading-relaxed">
                  {sec.paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 6. PRIVACY & CUSTOMER DATA POLICY — LONG-FORM HEALTHCARE PRIVACY POLICY
  // =========================================================================
  const privacySections = [
    {
      id: "privacy-commitment",
      num: "01",
      title: "Patient & Customer Confidentiality Commitment",
      paragraphs: [
        `${displayName} (${sf.city}) treats customer healthcare inquiries, medicine orders, and delivery records with strict pharmacy confidentiality. We collect only the minimum practical information required to verify, bill, dispatch, and support your medicine orders accurately.`,
        `Your personal contact details and healthcare purchase history are never sold, rented, or traded to advertising networks, data brokers, or unauthorized third parties.`,
      ],
    },
    {
      id: "privacy-collected",
      num: "02",
      title: "Information Collected When You Order",
      paragraphs: [
        `When you place an online order on this storefront, we collect your recipient name, active contact telephone number, delivery street address (for Home Delivery orders), optional email address (if you wish to receive an automated 80mm receipt copy), and optional order/prescription notes.`,
        `You can browse our medicine catalog, switch selling units, check delivery zones, and look up live order status without creating a mandatory user password or public profile.`,
      ],
    },
    {
      id: "privacy-usage",
      num: "03",
      title: "How Your Order & Contact Details Are Used",
      paragraphs: [
        `Information submitted during checkout is used exclusively by ${displayName} to: (a) confirm stock availability and selling units at the pharmacy counter; (b) contact you regarding prescription verification or urgent stock clarifications; (c) coordinate local rider delivery in ${sf.city} or prepare in-store counter pickup; and (d) generate your itemized pharmacy invoice.`,
      ],
    },
    {
      id: "privacy-rx",
      num: "04",
      title: "Prescription & Healthcare Data Handling",
      paragraphs: [
        `Where an order involves prescription-regulated medicines, prescription references or images shared with ${displayName} (at the counter or via our official pharmacy WhatsApp/phone desk) are reviewed solely by authorized pharmacy personnel for lawful dispensing verification.`,
        `Outer delivery parcels are packed discreetly to respect household privacy during local transit.`,
      ],
    },
    {
      id: "privacy-tracking",
      num: "05",
      title: "Order Tracking, 80mm PDF Receipts & Email Delivery",
      paragraphs: [
        `Each online order generates a unique order reference code (e.g., ORD-...). Entering this reference on our Track Order page displays the order's fulfillment progress, itemized bill summary, and 80mm PDF invoice download option. Please share your order reference only with trusted household members collecting or receiving your order.`,
        `If you voluntarily enter an email address at checkout, our server's transactional mail service uses that email solely to send your official order receipt — never unsolicited marketing spam.`,
      ],
    },
    {
      id: "privacy-storage",
      num: "06",
      title: "Local Browser Cart Storage & Essential Technical Data",
      paragraphs: [
        `To prevent you from losing selected medicines and unit quantities if you refresh the page, this storefront stores your active shopping cart locally in your browser (localStorage) scoped specifically to ${displayName}. We do not embed invasive cross-site behavioral ad trackers.`,
      ],
    },
    {
      id: "privacy-security",
      num: "07",
      title: "POS Synchronization, Security & Record Retention",
      paragraphs: [
        `Storefront traffic is protected over HTTPS/TLS encryption, and online orders synchronize securely with ${displayName}'s authorized pharmacy POS and billing ledger. Invoice, tax, and regulated dispensing records are retained only as required for pharmacy accounting, audit accuracy, and applicable healthcare regulations.`,
      ],
    },
    {
      id: "privacy-rights",
      num: "08",
      title: "Customer Inquiries & Privacy Contact Desk",
      paragraphs: [
        `If you need to correct a delivery address on an active order, request a copy of an order invoice, or ask a question about how your customer records are handled, please contact ${displayName} directly at ${fullAddress}${sf.contact_phone ? `, call ${sf.contact_phone}` : ""
        }${sf.contact_email ? `, or email ${sf.contact_email}` : ""}.`,
      ],
    },
  ];

  return (
    <main className="flex-1 pb-12 sm:pb-16 sf-fade-up space-y-10">
      {/* Photo-Led Privacy Masthead */}
      <section className="sf-hero-aurora relative overflow-hidden border-b border-white/12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 sf-hero-grid-pattern opacity-55"
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-3.5">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full sf-hero-glass-mini text-xs font-semibold text-[#FFF8ED]">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-[#9AF0DF]" />
              <span>Patient &amp; Customer Confidentiality • {displayName}</span>
            </span>
            <h1 className="sf-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight leading-tight">
              Privacy &amp; Customer Data Policy
            </h1>
            <p className="text-sm sm:text-base text-[#D7EDE7] leading-relaxed max-w-xl">
              How {displayName} protects your personal contact details, prescription records,
              local delivery addresses, and digital pharmacy invoices.
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="sf-hero-glass-frame rounded-[26px] p-2.5">
              <img
                src={EDITORIAL_MEDIA.conciergeSupportWebp}
                alt={`Discreetly wrapped care parcels at ${displayName}`}
                loading="eager"
                decoding="async"
                className="w-full aspect-[16/10] object-cover rounded-[18px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2-Column Structured Privacy Layout */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sticky Sidebar */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
          <div className="sf-card-elevated rounded-3xl p-5 sm:p-6 space-y-4">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0E5146] block">
              Policy Overview
            </span>
            <nav aria-label="Privacy policy sections" className="space-y-1.5 text-xs">
              {privacySections.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#4A606D] hover:text-[#0E5146] hover:bg-[#E9F5F1]/70 font-semibold transition"
                >
                  <span className="font-mono text-[11px] font-bold text-[#0E5146]">{sec.num}</span>
                  <span className="truncate">{sec.title}</span>
                </a>
              ))}
            </nav>
          </div>

          <div className="sf-catalog-showcase-bg rounded-3xl border border-[#CBE2DA] p-5 space-y-3 text-xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0E5146] block">
              Our Core Data Pledge
            </span>
            <ul className="space-y-2 text-[#243B47] font-medium">
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0" />
                <span>Zero resale of customer or health data</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0" />
                <span>No mandatory account to order or track</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0" />
                <span>Encrypted HTTPS &amp; POS-scoped records</span>
              </li>
            </ul>
            <div className="pt-2 border-t border-[#C4DDD5] flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectView("terms")}
                className="h-9 px-3.5 rounded-xl bg-white border border-[#C5DDD5] font-bold text-[#132630] hover:bg-[#F4FAF8] transition inline-flex items-center gap-1.5"
              >
                <span>Terms &amp; Conditions</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Long-Form Privacy Clauses */}
        <article className="lg:col-span-8 space-y-5">
          {privacySections.map((sec) => (
            <section
              key={sec.id}
              id={sec.id}
              className="sf-card rounded-3xl p-6 sm:p-8 space-y-3.5 scroll-mt-28"
            >
              <div className="flex items-start gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-[#E9F5F1] border border-[#C6E2D9] font-mono text-xs font-extrabold text-[#0E5146] shrink-0 whitespace-nowrap mt-0.5">
                  Clause {sec.num}
                </span>
                <h2 className="sf-display text-lg sm:text-xl font-extrabold text-[#172B36]">
                  {sec.title}
                </h2>
              </div>
              <div className="space-y-3 text-xs sm:text-[14.5px] text-[#4B606D] leading-relaxed">
                {sec.paragraphs.map((p, idx) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
