import React from "react";
import type { PublicStorefrontProduct } from "../../shared/types";
import { cleanProductText } from "../design/theme";
import type { CartItem, ResolvedSellingUnit } from "../types-ui";
import {
  MedicinePlaceholderIllustration,
  ShoppingBagIcon,
  TrashIcon,
} from "./Icons";

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
  convertedStockText,
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
  const cleanStrength =
    cleanProductText(product.strength) || cleanProductText(product.sku_code);
  const cleanForm = cleanProductText(product.dosage_form);

  const metaLine = [cleanForm, cleanGeneric].filter(Boolean).join(" · ") || cleanCategory;

  return (
    <article
      data-testid="public-product-card"
      className="h-full flex flex-col bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#94A3B8] hover:shadow-[0_10px_24px_-12px_rgba(15,23,42,0.14)] transition-all duration-150 overflow-hidden group"
    >
      {/* 1. Clean Full-Size Unobstructed Product Image Stage (MeriPharmacy-Crisp + Full Visibility) */}
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
        className="w-full aspect-[4/3] bg-white border-b border-[#F1F5F9] cursor-pointer overflow-hidden flex items-center justify-center p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sf-primary)]"
      >
        {product.primary_image_url && !imgFailed ? (
          <img
            src={product.primary_image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain transition-transform duration-200 ease-out group-hover:scale-[1.05]"
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

      {/* 2. Ultra-Clean Scannable E-Commerce Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
        <div className="space-y-1.5">
          {/* Compact Inline Status + Clinical Tags (Never Overlays Image!) */}
          <div className="flex items-center justify-between gap-1.5 text-[10.5px]">
            <span
              className={`inline-flex items-center gap-1 font-bold truncate ${
                isUnitOut
                  ? "text-rose-600"
                  : product.availability_status === "low_stock"
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isUnitOut
                    ? "bg-rose-500"
                    : product.availability_status === "low_stock"
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                }`}
              />
              <span className="truncate">
                {isUnitOut
                  ? "Sold Out"
                  : convertedStockText || (product.availability_status === "low_stock" ? "Low Stock" : "In Stock")}
              </span>
            </span>

            <div className="flex items-center gap-1 shrink-0">
              {product.requires_prescription && (
                <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-extrabold text-[9.5px]">
                  Rx
                </span>
              )}
              {hasDiscount && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-extrabold text-[9.5px] tabular-nums">
                  -{discountPct}%
                </span>
              )}
              {cleanStrength && (
                <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#334155] font-mono font-bold text-[9.5px]">
                  {cleanStrength}
                </span>
              )}
            </div>
          </div>

          {/* Crisp Product Title */}
          <h3 className="sf-heading text-[14.5px] font-bold text-[#0F172A] leading-snug line-clamp-2 min-h-[2.45rem]">
            <button
              type="button"
              onClick={() => onOpenProductDetail(product)}
              className="text-left w-full hover:text-[var(--sf-primary-ink)] transition-colors focus:outline-none focus-visible:underline"
            >
              {product.name}
            </button>
          </h3>

          {/* Concise Generic / Form Subtitle */}
          <p className="text-[11.5px] text-[#64748B] truncate" title={metaLine}>
            {metaLine}
          </p>

          {/* Compact Multi-Unit Pills (Shown Only When Multiple Units Exist!) */}
          {units.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5" data-testid="product-unit-selector">
              {units.map((u) => {
                const selected = u.unit_id === activeUnit.unit_id;
                const uOut = isProductOut || u.in_stock === false;
                return (
                  <button
                    key={u.unit_id}
                    type="button"
                    onClick={() => onSelectUnit(product.id, u.unit_id)}
                    title={`${u.label || u.unit_name} — PKR ${Number(u.price_pkr).toLocaleString()}`}
                    className={`h-6 px-2 rounded-md text-[11px] font-bold transition ${
                      selected
                        ? "sf-pill-active"
                        : uOut
                          ? "bg-slate-50 text-slate-400 border border-slate-200 line-through"
                          : "bg-[#F8FAFC] text-[#334155] border border-[#CBD5E1] hover:border-[var(--sf-primary)]"
                    }`}
                  >
                    {u.unit_name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Clean Price + Single Seamless Add-to-Cart / Live In-Cart Stepper */}
        <div className="pt-2.5 border-t border-[#F1F5F9] space-y-2">
          <div className="flex items-baseline justify-between gap-1.5">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="sf-heading sf-price text-[17px] font-extrabold text-[#0F172A] tracking-tight">
                Rs. {effectivePrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="text-[11px] text-[#94A3B8] line-through tabular-nums">
                  Rs. {comparePrice.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-[#64748B] shrink-0">
              / {activeUnit.unit_name}
            </span>
          </div>

          {inCartItem ? (
            <div className="flex items-center gap-1.5">
              <div
                className="flex-1 h-9 rounded-xl border border-[var(--sf-primary)] bg-[var(--sf-primary-soft)] flex items-center justify-between px-1"
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
                  className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-[#0F172A] font-extrabold text-sm flex items-center justify-center shadow-2xs transition"
                >
                  −
                </button>
                <span
                  data-testid="qty-stepper-input"
                  className="text-xs font-extrabold sf-text-brand tabular-nums"
                >
                  {inCartItem.qty} in cart
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
                  className="w-7 h-7 rounded-lg sf-btn-primary font-extrabold text-sm flex items-center justify-center transition"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFromCart(activeCartKey)}
                title="Remove from cart"
                aria-label={`Remove ${product.name} from cart`}
                data-testid="card-remove-cart-btn"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shrink-0"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : isUnitOut ? (
            <button
              type="button"
              onClick={() => onOpenProductDetail(product)}
              data-testid="add-to-cart-btn"
              className="w-full h-9 rounded-xl text-xs font-bold bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] transition"
            >
              Sold Out • See Alternatives
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAddToCart(product, 1, false, activeUnit)}
              data-testid="add-to-cart-btn"
              className="w-full h-9 px-3 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5"
            >
              <ShoppingBagIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{units.length > 1 ? `Add ${activeUnit.unit_name}` : "Add to Cart"}</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
});
