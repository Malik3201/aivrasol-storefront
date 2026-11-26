import React, { useEffect, useState } from "react";
import type {
  PublicStorefrontProduct,
  StorefrontPublicContext,
} from "../../shared/types";
import { cleanProductText } from "../design/theme";
import type { CartItem, ResolvedSellingUnit, StorefrontView } from "../types-ui";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  MedicinePlaceholderIllustration,
  PrescriptionIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StoreIcon,
  TrashIcon,
  TruckIcon,
} from "../components/Icons";
import { QuantityStepperInput } from "../components/QuantityStepperInput";

type DetailedProduct = PublicStorefrontProduct & {
  images?: Array<{ id: string; image_url: string; alt_text?: string }>;
};

interface ProductDetailViewProps {
  sf: StorefrontPublicContext;
  displayName: string;
  product: DetailedProduct;
  units: ResolvedSellingUnit[];
  activeUnit: ResolvedSellingUnit;
  activeCartKey: string;
  inCartItem?: CartItem;
  detailQty: number;
  detailUnitCap: number;
  inCartCap: number;
  convertedStockText: string | null;
  relatedProducts: PublicStorefrontProduct[];
  genericAlternatives?: PublicStorefrontProduct[];
  onChangeDetailQty: (qty: number) => void;
  onSelectUnit: (productId: string, unitId: string) => void;
  onAddToCart: (
    product: PublicStorefrontProduct,
    qty: number,
    openDrawer: boolean,
    unit: ResolvedSellingUnit
  ) => void;
  onBuyNow: (
    product: PublicStorefrontProduct,
    qty: number,
    unit: ResolvedSellingUnit
  ) => void;
  onUpdateCartQty: (cartKey: string, nextQty: number) => void;
  onRemoveFromCart: (cartKey: string) => void;
  onSelectView: (view: StorefrontView) => void;
  onBackToCatalog?: () => void;
  onSelectCategory: (cat: string) => void;
  onShowToast: (msg: string) => void;
  renderProductCard: (prod: PublicStorefrontProduct) => React.ReactNode;
}

export function ProductDetailView({
  sf,
  displayName,
  product,
  units,
  activeUnit,
  activeCartKey,
  inCartItem,
  detailQty,
  detailUnitCap,
  inCartCap,
  convertedStockText,
  relatedProducts,
  genericAlternatives = [],
  onChangeDetailQty,
  onSelectUnit,
  onAddToCart,
  onBuyNow,
  onUpdateCartQty,
  onRemoveFromCart,
  onSelectView,
  onBackToCatalog,
  onSelectCategory,
  onShowToast,
  renderProductCard,
}: ProductDetailViewProps) {
  const galleryImages = React.useMemo(() => {
    const list: Array<{ id: string; url: string; alt: string }> = [];
    if (product.primary_image_url) {
      list.push({
        id: "primary",
        url: product.primary_image_url,
        alt: product.name,
      });
    }
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (img.image_url && !list.some((existing) => existing.url === img.image_url)) {
          list.push({
            id: img.id,
            url: img.image_url,
            alt: img.alt_text || product.name,
          });
        }
      }
    }
    return list;
  }, [product]);

  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(
    galleryImages[0]?.url || null
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setSelectedImageUrl(galleryImages[0]?.url || null);
    setLightboxOpen(false);
  }, [product.id, galleryImages]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  const handleBack = () => {
    if (onBackToCatalog) {
      onBackToCatalog();
    } else {
      onSelectView("shop");
    }
  };

  const isProductOut =
    product.availability_status === "out_of_stock" ||
    product.availability_status === "unavailable";
  const isUnitOut =
    isProductOut ||
    activeUnit.in_stock === false ||
    (activeUnit.available_unit_qty !== undefined && activeUnit.available_unit_qty <= 0);

  const effectivePrice = Number(activeUnit.price_pkr ?? 0);
  const comparePrice = Number(product.compare_at_price_pkr || 0);
  const hasDiscount = activeUnit.is_default && comparePrice > effectivePrice;

  const cleanBrand = cleanProductText(product.brand_name);
  const cleanCategory =
    cleanProductText(product.category_name) || cleanBrand || "Pharmacy Supply";
  const cleanGeneric = cleanProductText(product.generic_name);
  const cleanStrength =
    cleanProductText(product.strength) || cleanProductText(product.sku_code);
  const cleanForm = cleanProductText(product.dosage_form);
  const cleanPacking =
    cleanProductText(product.packing_label) ||
    cleanProductText(activeUnit.label) ||
    cleanProductText(product.unit_label);
  const cleanDescription = cleanProductText(product.public_description);

  return (
    <main className="flex-1 bg-[#F6F7F9] sf-fade-up">
      {/* Crisp White Breadcrumb Bar */}
      <div className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#6B7280]">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSelectView("home")}
              className="hover:text-[#111827] transition font-medium"
            >
              Home
            </button>
            <ChevronRightIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <button
              type="button"
              onClick={handleBack}
              className="hover:text-[#111827] transition font-medium"
            >
              Medicines
            </button>
            {cleanProductText(product.category_name) && (
              <>
                <ChevronRightIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory(cleanCategory);
                    onSelectView("shop");
                  }}
                  className="hover:text-[#111827] transition font-medium"
                >
                  {cleanCategory}
                </button>
              </>
            )}
            <ChevronRightIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span className="text-[#111827] font-semibold truncate max-w-[190px] sm:max-w-xs">
              {product.name}
            </span>
          </nav>

          <button
            type="button"
            onClick={handleBack}
            data-testid="product-back-to-catalog"
            className="inline-flex items-center gap-1.5 font-bold sf-text-brand hover:underline"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Back to Catalog</span>
          </button>
        </div>
      </div>

      {/* Main Product Showcase */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-9">
          {/* Left Column: Unobstructed Pure-White Full-Preview Media Stage + Click-to-Zoom Lightbox */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
              {/* Clean Status Strip Above Photo — Zero Overlays Covering Medicine Packaging */}
              <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#EDF2F7] flex items-center justify-between gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 font-bold ${
                    isUnitOut
                      ? "text-slate-600"
                      : product.availability_status === "low_stock"
                        ? "text-amber-700"
                        : "text-emerald-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isUnitOut
                        ? "bg-slate-400"
                        : product.availability_status === "low_stock"
                          ? "bg-amber-500"
                          : "bg-emerald-600"
                    }`}
                  />
                  <span>
                    {isUnitOut
                      ? "Out of Stock"
                      : product.availability_status === "low_stock"
                        ? "Low Stock"
                        : product.availability_unconfirmed
                          ? "Confirm at Counter"
                          : "In Stock"}
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  {product.requires_prescription && (
                    <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold inline-flex items-center gap-1">
                      <PrescriptionIcon className="w-3 h-3" />
                      <span>Rx Required</span>
                    </span>
                  )}
                  {selectedImageUrl && (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="text-[11px] font-bold sf-text-brand hover:underline"
                    >
                      Zoom Image
                    </button>
                  )}
                </div>
              </div>

              <div
                onClick={() => {
                  if (selectedImageUrl) setLightboxOpen(true);
                }}
                onKeyDown={(e) => {
                  if (selectedImageUrl && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setLightboxOpen(true);
                  }
                }}
                role={selectedImageUrl ? "button" : undefined}
                tabIndex={selectedImageUrl ? 0 : undefined}
                aria-label={selectedImageUrl ? `Zoom image of ${product.name}` : undefined}
                className={`w-full aspect-[4/3] sm:aspect-square max-h-[420px] bg-white flex items-center justify-center p-3 sm:p-4 ${
                  selectedImageUrl ? "cursor-zoom-in" : ""
                }`}
              >
                {selectedImageUrl ? (
                  <img
                    src={selectedImageUrl}
                    alt={product.name}
                    onError={() => setSelectedImageUrl(null)}
                    className="w-full h-full object-contain transition-transform duration-200 hover:scale-[1.03]"
                  />
                ) : (
                  <MedicinePlaceholderIllustration
                    name={product.name}
                    dosageForm={product.dosage_form}
                    categoryName={product.category_name}
                    brandName={product.brand_name}
                    packingLabel={product.packing_label}
                    className="w-full h-full"
                  />
                )}
              </div>
            </div>

            {galleryImages.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
                {galleryImages.map((img: { id: string; url: string; alt: string }) => {
                  const active = img.url === selectedImageUrl;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedImageUrl(img.url)}
                      className={`w-16 h-16 rounded-xl border bg-white p-1.5 flex items-center justify-center shrink-0 transition ${
                        active
                          ? "border-[var(--sf-primary)] ring-2 ring-[var(--sf-primary-soft)]"
                          : "border-[#DBE5E0] hover:border-[var(--sf-primary)]"
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={img.alt}
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pharmacy Fulfillment Card */}
            <div className="rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-3.5 grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <TruckIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#111827] block">Home Delivery</span>
                  <span className="text-[#6B7280]">Local dispatch in {sf.city}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <StoreIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#111827] block">Counter Pickup</span>
                  <span className="text-[#6B7280]">Collect at {displayName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Identity, Selling-Unit Selector, Purchase Controls & Specs */}
          <div className="lg:col-span-7 space-y-5">
            {/* Product Identity */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-md font-bold sf-badge-brand">
                  {cleanCategory}
                </span>
                {cleanStrength && (
                  <span className="px-2 py-0.5 rounded-md bg-[#F3F4F6] border border-[#E5E7EB] font-mono font-bold text-[#111827]">
                    {cleanStrength}
                  </span>
                )}
                {cleanBrand && cleanBrand.toLowerCase() !== cleanCategory.toLowerCase() && (
                  <span className="text-[#6B7280] font-medium">• {cleanBrand}</span>
                )}
              </div>

              <h1 className="sf-heading text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight leading-tight">
                {product.name}
              </h1>

              {(cleanGeneric || cleanForm || cleanPacking) && (
                <p className="text-sm text-[#4B5563]">
                  {[
                    cleanGeneric ? `Formula: ${cleanGeneric}` : null,
                    cleanForm,
                    cleanPacking,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Structured Purchase Surface */}
            <div className="p-4 sm:p-5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="sf-heading sf-price text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
                    Rs. {effectivePrice.toLocaleString()}
                  </span>
                  {hasDiscount && (
                    <span className="text-sm text-[#9CA3AF] line-through tabular-nums">
                      Rs. {comparePrice.toLocaleString()}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-[#6B7280]">
                    per {activeUnit.label || activeUnit.unit_name}
                  </span>
                </div>

                {convertedStockText && (
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                      isUnitOut
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "sf-badge-brand"
                    }`}
                  >
                    {convertedStockText}
                  </span>
                )}
              </div>

              {/* Selling Unit Selector */}
              {units.length > 1 ? (
                <div className="space-y-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#4D616E] block">
                    Choose Selling Unit
                  </label>
                  <div
                    className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
                    data-testid="detail-unit-selector"
                  >
                    {units.map((u) => {
                      const selected = u.unit_id === activeUnit.unit_id;
                      const uOut =
                        isProductOut ||
                        u.in_stock === false ||
                        (u.available_unit_qty !== undefined && u.available_unit_qty <= 0);
                      return (
                        <button
                          key={u.unit_id}
                          type="button"
                          onClick={() => {
                            onSelectUnit(product.id, u.unit_id);
                            onChangeDetailQty(1);
                          }}
                          className={`p-3.5 rounded-xl border text-left transition ${
                            selected
                              ? "sf-pill-active shadow-xs"
                              : uOut
                                ? "bg-white/60 text-slate-400 border-slate-200"
                                : "bg-white text-[#172B36] border-[#DBE5E0] hover:border-[var(--sf-primary)]"
                          }`}
                        >
                          <div className="sf-heading text-xs font-bold truncate">
                            {u.label || u.unit_name}
                          </div>
                          <div
                            className={`text-xs mt-0.5 font-semibold tabular-nums ${
                              selected ? "text-white/90" : "text-[#607481]"
                            }`}
                          >
                            PKR {Number(u.price_pkr).toLocaleString()}
                            {uOut
                              ? " • Out"
                              : u.available_unit_qty !== undefined
                                ? ` • ${Number(u.available_unit_qty).toLocaleString()} avail.`
                                : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                cleanPacking && (
                  <div className="text-xs text-[#607481]">
                    Selling Unit:{" "}
                    <strong className="text-[#172B36] font-semibold">{cleanPacking}</strong>
                  </div>
                )
              )}

              {/* Quantity & Primary Actions */}
              <div className="pt-1 flex flex-wrap items-center gap-3">
                <QuantityStepperInput
                  value={detailQty}
                  min={1}
                  max={detailUnitCap}
                  disabled={isUnitOut}
                  size="md"
                  onChange={onChangeDetailQty}
                  onCapReached={(cap) =>
                    onShowToast(`Maximum ${cap} ${activeUnit.unit_name} available.`)
                  }
                />

                <button
                  type="button"
                  disabled={isUnitOut}
                  onClick={() => onAddToCart(product, detailQty, true, activeUnit)}
                  className="flex-1 min-w-[200px] h-12 px-5 rounded-xl sf-btn-primary text-sm font-semibold shadow-xs inline-flex items-center justify-center gap-2 tabular-nums"
                >
                  <ShoppingBagIcon className="w-4 h-4" />
                  <span>
                    {isUnitOut
                      ? "Currently Out of Stock"
                      : `Add ${detailQty} ${activeUnit.unit_name} • PKR ${Number(
                          effectivePrice * detailQty
                        ).toLocaleString()}`}
                  </span>
                </button>

                {!isUnitOut && (
                  <button
                    type="button"
                    onClick={() => onBuyNow(product, detailQty, activeUnit)}
                    className="h-12 px-5 rounded-xl sf-btn-warm text-sm font-bold"
                  >
                    Order Now
                  </button>
                )}
              </div>

              {/* Active Cart Line Indicator */}
              {inCartItem && (
                <div className="pt-3 border-t border-[#E2E8E4] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#4D616E]">
                    In your cart:{" "}
                    <strong className="text-[#172B36] tabular-nums">
                      {inCartItem.qty} {activeUnit.unit_name}
                    </strong>{" "}
                    (PKR {Number(inCartItem.qty * effectivePrice).toLocaleString()})
                  </span>
                  <div className="flex items-center gap-2">
                    <QuantityStepperInput
                      value={inCartItem.qty}
                      min={1}
                      max={inCartCap}
                      size="sm"
                      onChange={(q) => onUpdateCartQty(activeCartKey, q)}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveFromCart(activeCartKey)}
                      className="h-8 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-medium inline-flex items-center gap-1 transition"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Product Details Ledger */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-white border border-[#DBE5E0] space-y-0.5">
                <span className="text-[#607481] block">Supplier / Category</span>
                <span className="font-bold text-[#172B36]">{cleanBrand || cleanCategory}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#DBE5E0] space-y-0.5">
                <span className="text-[#607481] block">Pack Configuration</span>
                <span className="font-bold text-[#172B36]">
                  {cleanPacking || activeUnit.unit_name}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#DBE5E0] space-y-0.5 col-span-2 sm:col-span-1">
                <span className="text-[#607481] block">Dispensed By</span>
                <span className="font-bold text-[#172B36] truncate block">{displayName}</span>
              </div>
            </div>

            {cleanDescription && (
              <div className="space-y-1.5 pt-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#4D616E]">
                  Product Information
                </h2>
                <p className="text-sm text-[#4D616E] leading-relaxed">{cleanDescription}</p>
              </div>
            )}

            {product.requires_prescription && (
              <div className="rounded-2xl bg-rose-50/75 border border-rose-200 p-4 flex items-start gap-3 text-xs text-rose-900">
                <PrescriptionIcon className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Prescription Verification Required</p>
                  <p className="text-rose-800/90 leading-relaxed">
                    This medicine requires a valid prescription from a registered medical
                    practitioner. Place your order online and{" "}
                    {sf.pharmacist_name ? (
                      <>
                        supervising pharmacist <strong>{sf.pharmacist_name}</strong> at{" "}
                        {displayName}
                      </>
                    ) : (
                      <>the pharmacy counter at {displayName}</>
                    )}{" "}
                    will verify it prior to dispensing.
                  </p>
                </div>
              </div>
            )}

            {sf.drug_sale_license_no && (
              <div className="flex items-center gap-2 text-xs text-[#607481] pt-1">
                <ShieldCheckIcon className="w-4 h-4 sf-text-brand shrink-0" />
                <span>
                  Dispensed by <strong className="text-[#172B36]">{displayName}</strong> • Drug Sale
                  License{" "}
                  <span className="font-mono text-[#172B36]">{sf.drug_sale_license_no}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Same-Formula / Generic Salt Alternatives (Automatically Highlighted When Out of Stock!) */}
        {genericAlternatives.length > 0 && (
          <section
            className={`rounded-2xl p-5 sm:p-6 space-y-5 border ${
              isUnitOut
                ? "bg-[#ECFDF5] border-emerald-300"
                : "bg-white border-[#E2E8F0]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider sf-text-brand block">
                  {isUnitOut
                    ? "Currently Out of Stock — In-Stock Substitute Available"
                    : "Same Generic Composition"}
                </span>
                <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#0F172A]">
                  {cleanGeneric
                    ? `Same-Formula Alternatives (${cleanGeneric})`
                    : "Available Generic Alternatives"}
                </h2>
              </div>
              <span className="px-3 py-1 rounded-lg bg-white border border-[#CBD5E1] text-xs font-bold text-[#0F172A]">
                {genericAlternatives.length} available now
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {genericAlternatives.slice(0, 4).map((alt) => renderProductCard(alt))}
            </div>
          </section>
        )}

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
                More Items from {displayName}
              </h2>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory("all");
                  onSelectView("shop");
                }}
                className="text-xs font-bold sf-text-brand hover:underline"
              >
                View Full Catalog
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {relatedProducts.slice(0, 4).map((rel) => renderProductCard(rel))}
            </div>
          </section>
        )}
      </div>

      {/* Full-Screen High-Clarity Image Zoom Lightbox */}
      {lightboxOpen && selectedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full preview of ${product.name}`}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-[#08171D]/85 flex items-center justify-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sf-zoom-in relative bg-white rounded-3xl max-w-3xl w-full max-h-[88vh] p-4 sm:p-6 shadow-2xl flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="sf-heading text-sm sm:text-base font-bold text-[#0F232C] truncate">
                  {product.name}
                </p>
                {cleanStrength && (
                  <p className="text-xs text-[#546A76] truncate">{cleanStrength}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close full image preview"
                className="w-9 h-9 rounded-xl sf-btn-secondary flex items-center justify-center shrink-0"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center bg-white rounded-2xl border border-[#E6EEEA] p-3 overflow-hidden">
              <img
                src={selectedImageUrl}
                alt={product.name}
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

interface QuickProductModalProps {
  product: PublicStorefrontProduct | null;
  units: ResolvedSellingUnit[];
  activeUnit: ResolvedSellingUnit | null;
  modalQty: number;
  modalUnitCap: number;
  convertedStockText: string | null;
  onChangeModalQty: (qty: number) => void;
  onSelectUnit: (productId: string, unitId: string) => void;
  onClose: () => void;
  onOpenFullDetails: (product: PublicStorefrontProduct) => void;
  onAddToCart: (
    product: PublicStorefrontProduct,
    qty: number,
    openDrawer: boolean,
    unit: ResolvedSellingUnit
  ) => void;
  onShowToast: (msg: string) => void;
}

export function QuickProductModal({
  product,
  units,
  activeUnit,
  modalQty,
  modalUnitCap,
  convertedStockText,
  onChangeModalQty,
  onSelectUnit,
  onClose,
  onOpenFullDetails,
  onAddToCart,
  onShowToast,
}: QuickProductModalProps) {
  if (!product || !activeUnit) return null;

  const isOut =
    product.availability_status === "out_of_stock" ||
    product.availability_status === "unavailable" ||
    activeUnit.in_stock === false ||
    (activeUnit.available_unit_qty !== undefined && activeUnit.available_unit_qty <= 0);

  const cleanCategory =
    cleanProductText(product.category_name) || cleanProductText(product.brand_name) || "General";
  const cleanGeneric = cleanProductText(product.generic_name);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F2028]/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="sf-fade-up bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#DBE5E0] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider sf-text-brand">
              {cleanCategory}
            </span>
            <h3 className="sf-heading text-lg font-extrabold text-[#172B36] mt-0.5">
              {product.name}
            </h3>
            {cleanGeneric && (
              <p className="text-xs text-[#607481] mt-0.5">Composition: {cleanGeneric}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="w-8 h-8 rounded-lg sf-btn-secondary flex items-center justify-center"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {units.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {units.map((u) => {
              const selected = u.unit_id === activeUnit.unit_id;
              return (
                <button
                  key={u.unit_id}
                  type="button"
                  onClick={() => onSelectUnit(product.id, u.unit_id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition tabular-nums ${
                    selected
                      ? "sf-pill-active"
                      : "bg-[#FAF8F4] text-[#4D616E] border-[#DBE5E0]"
                  }`}
                >
                  {u.label || u.unit_name} • PKR {Number(u.price_pkr).toLocaleString()}
                </button>
              );
            })}
          </div>
        )}

        <div className="pt-3 border-t border-[#E8EFEA] flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="sf-heading text-xl font-extrabold text-[#172B36] tabular-nums">
              PKR {Number(activeUnit.price_pkr).toLocaleString()}
            </span>
            {convertedStockText && (
              <span
                className={`block text-xs font-medium ${
                  isOut ? "text-rose-600" : "text-[#607481]"
                }`}
              >
                {convertedStockText}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <QuantityStepperInput
              value={modalQty}
              min={1}
              max={modalUnitCap}
              disabled={isOut}
              size="sm"
              onChange={onChangeModalQty}
              onCapReached={(cap) =>
                onShowToast(`Maximum ${cap} ${activeUnit.unit_name} available.`)
              }
            />
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullDetails(product);
              }}
              className="h-9 px-3.5 rounded-xl sf-btn-secondary text-xs font-semibold"
            >
              Details
            </button>
            <button
              type="button"
              disabled={isOut}
              onClick={() => {
                onAddToCart(product, modalQty, true, activeUnit);
                onClose();
              }}
              className="h-9 px-4 rounded-xl sf-btn-primary text-xs font-semibold"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
