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
    <main className="flex-1 sf-fade-up">
      {/* Subtle Mint Breadcrumb Bar */}
      <div className="sf-surface-mint border-b border-[#CDE2DA]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4D616E]">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSelectView("home")}
              className="hover:text-[#172B36] transition font-medium"
            >
              Home
            </button>
            <ChevronRightIcon className="w-3.5 h-3.5 text-[#8899A4]" />
            <button
              type="button"
              onClick={handleBack}
              className="hover:text-[#0F232C] transition font-medium"
            >
              Medicines
            </button>
            {cleanProductText(product.category_name) && (
              <>
                <ChevronRightIcon className="w-3.5 h-3.5 text-[#8899A4]" />
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory(cleanCategory);
                    onSelectView("shop");
                  }}
                  className="hover:text-[#0F232C] transition font-medium"
                >
                  {cleanCategory}
                </button>
              </>
            )}
            <ChevronRightIcon className="w-3.5 h-3.5 text-[#8899A4]" />
            <span className="text-[#0F232C] font-semibold truncate max-w-[190px] sm:max-w-xs">
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
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-7 sm:py-9 space-y-10">
        <div className="sf-card rounded-3xl p-5 sm:p-7 lg:p-9 grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-10">
          {/* Left Column: Pure-White Full-Preview Media Stage + Zoom Lightbox */}
          <div className="lg:col-span-5 space-y-4">
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
              className={`relative w-full aspect-[4/3] sm:aspect-square max-h-[420px] rounded-2xl bg-white border border-[#DCE7E2] overflow-hidden flex items-center justify-center group ${
                selectedImageUrl ? "cursor-zoom-in hover:border-[#9EC6B8] transition-colors" : ""
              }`}
            >
              {selectedImageUrl ? (
                <div className="w-full h-full p-3 sm:p-4 flex items-center justify-center bg-white">
                  <img
                    src={selectedImageUrl}
                    alt={product.name}
                    onError={() => setSelectedImageUrl(null)}
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
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

              <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${
                    isUnitOut
                      ? "bg-slate-50 text-slate-600 border-slate-200"
                      : product.availability_status === "low_stock"
                        ? "bg-[#FFF8EB] text-[#92580E] border-[#F3D9A4]"
                        : "bg-[#EDFAF4] text-[#0C684C] border-[#BCEAD5]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isUnitOut
                        ? "bg-slate-400"
                        : product.availability_status === "low_stock"
                          ? "bg-[#D98E2B]"
                          : "bg-[#128761]"
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

                {product.requires_prescription && (
                  <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 shadow-2xs">
                    <PrescriptionIcon className="w-3.5 h-3.5" />
                    <span>Rx Required</span>
                  </span>
                )}
              </div>

              {selectedImageUrl && (
                <span className="pointer-events-none absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-[#0F232C]/80 text-white text-[11px] font-semibold opacity-85 group-hover:opacity-100 transition-opacity">
                  Click to zoom
                </span>
              )}
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
            <div className="rounded-2xl sf-surface-ivory border border-[#EADFCE] p-4 grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <TruckIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#172B36] block">Home Delivery</span>
                  <span className="text-[#607481]">Local dispatch in {sf.city}</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <StoreIcon className="w-4 h-4 sf-text-brand shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#172B36] block">Counter Pickup</span>
                  <span className="text-[#607481]">Collect at {displayName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Identity, Selling-Unit Selector, Purchase Controls & Specs */}
          <div className="lg:col-span-7 space-y-6">
            {/* Product Identity */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-full font-semibold sf-badge-brand">
                  {cleanCategory}
                </span>
                {cleanStrength && (
                  <span className="px-2.5 py-1 rounded-full bg-[#F3F6F4] border border-[#DBE5E0] font-mono font-semibold text-[#172B36]">
                    {cleanStrength}
                  </span>
                )}
                {cleanBrand && cleanBrand.toLowerCase() !== cleanCategory.toLowerCase() && (
                  <span className="text-[#607481] font-medium">• {cleanBrand}</span>
                )}
              </div>

              <h1 className="sf-heading text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-[#172B36] tracking-tight leading-tight">
                {product.name}
              </h1>

              {(cleanGeneric || cleanForm || cleanPacking) && (
                <p className="text-sm text-[#607481]">
                  {[
                    cleanGeneric ? `Composition: ${cleanGeneric}` : null,
                    cleanForm,
                    cleanPacking,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              )}
            </div>

            {/* Structured Purchase Surface */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#FAF8F4] border border-[#E2E8E4] space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="sf-heading sf-price text-3xl sm:text-[34px] font-extrabold text-[#172B36] tracking-tight">
                    PKR {effectivePrice.toLocaleString()}
                  </span>
                  {hasDiscount && (
                    <span className="text-sm text-[#8899A4] line-through tabular-nums">
                      PKR {comparePrice.toLocaleString()}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-[#607481]">
                    per {activeUnit.label || activeUnit.unit_name}
                  </span>
                </div>

                {convertedStockText && (
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
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

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="sf-heading text-xl font-extrabold text-[#172B36]">
                More Items from {displayName}
              </h2>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory("all");
                  onSelectView("shop");
                }}
                className="text-xs font-semibold sf-text-brand hover:underline"
              >
                View Full Catalog
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
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
