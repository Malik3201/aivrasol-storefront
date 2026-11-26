import React from "react";
import type { PublicStorefrontProduct } from "../../shared/types";
import { cleanProductText } from "../design/theme";
import type { CartItem, ResolvedSellingUnit } from "../types-ui";
import { MedicinePlaceholderIllustration } from "./Icons";

interface ProductCardProps {
  product: PublicStorefrontProduct;
  units: ResolvedSellingUnit[];
  activeUnit: ResolvedSellingUnit;
  activeCartKey: string;
  inCartItem?: CartItem;
  cardDraftQty: number;
  cardUnitCap: number;
  inCartCap: number;
  convertedStockText: string | null;
  onSelectUnit: (productId: string, unitId: string) => void;
  onChangeDraftQty: (productId: string, qty: number) => void;
  onAddToCart: (
    product: PublicStorefrontProduct,
    qty: number,
    openDrawer: boolean,
    unit: ResolvedSellingUnit
  ) => void;
  onUpdateCartQty: (cartKey: string, nextQty: number) => void;
  onRemoveFromCart: (cartKey: string) => void;
  onOpenProductDetail: (product: PublicStorefrontProduct) => void;
  onShowToast: (msg: string) => void;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  units,
  activeUnit,
  activeCartKey,
  inCartItem,
  inCartCap,
  onSelectUnit,
  onAddToCart,
  onUpdateCartQty,
  onRemoveFromCart,
  onOpenProductDetail,
  onShowToast,
}: ProductCardProps) {
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
  }, [product.primary_image_url]);

  const isProductOut =
    product.availability_status === "out_of_stock" ||
    product.availability_status === "unavailable";
  const isUnitOut = isProductOut || activeUnit.in_stock === false;

  const effectivePrice = Number(activeUnit.price_pkr ?? 0);
  const comparePrice = Number(product.compare_at_price_pkr || 0);
  const hasDiscount = activeUnit.is_default && comparePrice > effectivePrice;
  const discountPct = hasDiscount
    ? Math.max(1, Math.round(((comparePrice - effectivePrice) / comparePrice) * 100))
    : 0;

  const cleanBrand = cleanProductText(product.brand_name);
  const cleanCategory =
    cleanProductText(product.category_name) || cleanBrand || "Pharmacy";
  const cleanGeneric = cleanProductText(product.generic_name);
  const cleanStrength = cleanProductText(product.strength);
  const cleanForm = cleanProductText(product.dosage_form);

  const eyebrow = cleanBrand || cleanCategory;
  const subtitle =
    [cleanGeneric, cleanStrength].filter(Boolean).join(" · ") ||
    cleanForm ||
    cleanCategory;

  return (
    <article
      data-testid="public-product-card"
      className="h-full flex flex-col bg-white rounded-xl border border-[#E5E7EB] hover:border-[#CBD5E1] hover:shadow-[0_10px_24px_-14px_rgba(17,24,39,0.2)] transition-all duration-150 overflow-hidden group"
    >
      {/* 1. Pure-White Full-Size Unobstructed Product Media Stage */}
      <div
        onClick={() => onOpenProductDetail(product)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenProductDetail(product);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${product.name}`}
        className="relative w-full aspect-square sm:aspect-auto sm:h-[192px] bg-white border-b border-[#F3F4F6] cursor-pointer overflow-hidden flex items-center justify-center p-2 sm:p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sf-primary)]"
      >
        {/* Minimal Retail Corner Ribbons (Only when Discounted or Rx) */}
        {hasDiscount && (
          <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-10 px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-extrabold tracking-tight tabular-nums">
            -{discountPct}%
          </span>
        )}
        {product.requires_prescription && (
          <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[9.5px] font-extrabold tracking-wide">
            Rx
          </span>
        )}

        {product.primary_image_url && !imgFailed ? (
          <img
            src={product.primary_image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-contain transition-transform duration-200 ease-out group-hover:scale-[1.04] ${
              isUnitOut ? "opacity-60 grayscale-[20%]" : ""
            }`}
          />
        ) : (
          <MedicinePlaceholderIllustration
            name={product.name}
            dosageForm={product.dosage_form}
            categoryName={product.category_name}
            brandName={product.brand_name}
            packingLabel={product.packing_label}
            requiresPrescription={product.requires_prescription}
            availabilityStatus={product.availability_status}
            showSpecBadge={false}
            className="w-full h-full"
          />
        )}
      </div>

      {/* 2. Disciplined Commercial Typography & Controls */}
      <div className="p-2.5 sm:p-3.5 flex-1 flex flex-col justify-between gap-2 sm:gap-2.5 min-w-0">
        <div className="space-y-1 min-w-0">
          {/* Subtle Brand / Department Micro-Label */}
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] truncate">
            {eyebrow}
          </p>

          {/* Clean 2-Line Product Name */}
          <h3 className="sf-heading text-[13px] sm:text-[14px] font-bold text-[#111827] leading-[1.3] sm:leading-[1.35] line-clamp-2 min-h-[34px] sm:min-h-[37px]">
            <button
              type="button"
              onClick={() => onOpenProductDetail(product)}
              className="text-left w-full hover:text-[var(--sf-primary-ink)] transition-colors focus:outline-none focus-visible:underline"
            >
              {product.name}
            </button>
          </h3>

          {/* Single-Line Generic Salt / Strength */}
          <p className="text-[11px] text-[#6B7280] truncate" title={subtitle}>
            {subtitle}
          </p>

          {/* Sleek Inline Segmented Unit Selector (Only When Multiple Selling Units Exist) */}
          {units.length > 1 && (
            <div
              className="flex flex-wrap items-center gap-1 pt-1"
              data-testid="product-unit-selector"
            >
              {units.map((u) => {
                const selected = u.unit_id === activeUnit.unit_id;
                const uOut = isProductOut || u.in_stock === false;
                return (
                  <button
                    key={u.unit_id}
                    type="button"
                    onClick={() => onSelectUnit(product.id, u.unit_id)}
                    title={`${u.label || u.unit_name} — Rs. ${Number(u.price_pkr).toLocaleString()}`}
                    className={`min-h-[26px] sm:h-6 px-2 rounded text-[10.5px] font-bold max-w-full truncate transition active:scale-[0.96] ${
                      selected
                        ? "bg-[#111827] text-white"
                        : uOut
                          ? "bg-[#F9FAFB] text-[#9CA3AF] border border-[#E5E7EB] line-through"
                          : "bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]"
                    }`}
                  >
                    {u.unit_name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Crisp Commercial Price + Live Cart Action */}
        <div className="pt-2 space-y-2 border-t border-[#F3F4F6] min-w-0">
          <div className="flex items-baseline justify-between gap-1 min-w-0">
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="sf-heading sf-price text-[14.5px] sm:text-[17px] font-extrabold text-[#111827] tracking-tight whitespace-nowrap">
                Rs. {effectivePrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="text-[10px] sm:text-[10.5px] text-[#9CA3AF] line-through tabular-nums truncate">
                  {comparePrice.toLocaleString()}
                </span>
              )}
            </div>

            <span
              className={`inline-flex items-center gap-1 text-[10px] sm:text-[10.5px] font-semibold shrink-0 ${
                isUnitOut
                  ? "text-rose-600"
                  : product.availability_status === "low_stock"
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isUnitOut
                    ? "bg-rose-500"
                    : product.availability_status === "low_stock"
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                }`}
              />
              <span className="hidden sm:inline">
                {isUnitOut
                  ? "Out"
                  : product.availability_status === "low_stock"
                    ? "Low"
                    : "In Stock"}
              </span>
            </span>
          </div>

          {inCartItem ? (
            <div
              className="min-h-[42px] sm:min-h-0 sm:h-9 rounded-lg border border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] flex items-center justify-between px-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  if (inCartItem.qty <= 1) {
                    onRemoveFromCart(activeCartKey);
                  } else {
                    onUpdateCartQty(activeCartKey, inCartItem.qty - 1);
                  }
                }}
                aria-label="Decrease quantity"
                data-testid="card-remove-cart-btn"
                className="w-9 h-9 sm:w-7 sm:h-7 rounded-md bg-white hover:bg-[#F3F4F6] text-[#111827] font-extrabold text-base sm:text-sm flex items-center justify-center shadow-2xs transition active:scale-95"
              >
                −
              </button>
              <span
                data-testid="qty-stepper-input"
                className="text-xs font-extrabold sf-text-brand tabular-nums"
              >
                {inCartItem.qty}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (inCartItem.qty >= inCartCap) {
                    onShowToast(`Maximum ${inCartCap} ${activeUnit.unit_name} available.`);
                    return;
                  }
                  onUpdateCartQty(activeCartKey, inCartItem.qty + 1);
                }}
                aria-label="Increase quantity"
                className="w-9 h-9 sm:w-7 sm:h-7 rounded-md sf-btn-primary font-extrabold text-base sm:text-sm flex items-center justify-center transition active:scale-95"
              >
                +
              </button>
            </div>
          ) : isUnitOut ? (
            <button
              type="button"
              onClick={() => onOpenProductDetail(product)}
              data-testid="add-to-cart-btn"
              className="w-full min-h-[42px] sm:min-h-0 sm:h-9 rounded-lg text-[11.5px] font-bold bg-[#F9FAFB] hover:bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] transition active:scale-[0.97]"
            >
              Alternatives
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAddToCart(product, 1, false, activeUnit)}
              data-testid="add-to-cart-btn"
              className="w-full min-h-[42px] sm:min-h-0 sm:h-9 px-2 rounded-lg sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1 min-w-0"
            >
              <span className="truncate">
                {units.length > 1 ? `Add ${activeUnit.unit_name}` : "Add to Cart"}
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
});
