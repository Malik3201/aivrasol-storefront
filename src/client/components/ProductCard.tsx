import React from "react";
import type { PublicStorefrontProduct } from "../../shared/types";
import { cleanProductText } from "../design/theme";
import type { CartItem, ResolvedSellingUnit } from "../types-ui";
import {
  CheckCircleIcon,
  MedicinePlaceholderIllustration,
  ShoppingBagIcon,
  TrashIcon,
} from "./Icons";
import { QuantityStepperInput } from "./QuantityStepperInput";

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

function formatReadablePackSubtitle(rawPack: string): string {
  const trimmed = rawPack.trim();
  if (!trimmed) return "Standard Pharmacy Pack";

  const parenMatch = trimmed.match(/^([A-Za-z]+)\s*(?:\(|of\s+)\s*(\d+)\s*([A-Za-z]+)\s*\)?$/i);
  if (parenMatch) {
    const outer = parenMatch[1];
    const count = parenMatch[2];
    const innerRaw = parenMatch[3].toLowerCase();
    const innerExpanded =
      innerRaw === "tab" || innerRaw === "tabs"
        ? "tablets"
        : innerRaw === "cap" || innerRaw === "caps"
          ? "capsules"
          : innerRaw === "amp"
            ? "ampoules"
            : innerRaw.endsWith("s")
              ? innerRaw
              : `${innerRaw}s`;
    return `${outer} of ${count} ${innerExpanded}`;
  }

  if (/^1?\s*unit$/i.test(trimmed)) return "Unit Pack";
  if (/^1?\s*general$/i.test(trimmed)) return "Standard Healthcare Pack";
  if (/^1\s+machine$/i.test(trimmed)) return "Machine";
  return trimmed;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  units,
  activeUnit,
  activeCartKey,
  inCartItem,
  cardDraftQty,
  cardUnitCap,
  inCartCap,
  convertedStockText,
  onSelectUnit,
  onChangeDraftQty,
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
    cleanProductText(product.category_name) || cleanBrand || "Pharmacy Supply";
  const cleanGeneric = cleanProductText(product.generic_name);
  const cleanStrength =
    cleanProductText(product.strength) || cleanProductText(product.sku_code);
  const cleanForm = cleanProductText(product.dosage_form);
  const cleanPacking =
    cleanProductText(product.packing_label) ||
    cleanProductText(activeUnit.label) ||
    cleanProductText(product.unit_label);

  const rawPackLine =
    [cleanForm, cleanGeneric, cleanPacking].filter(Boolean).join(" · ") ||
    activeUnit.unit_name;
  const readablePackLine = formatReadablePackSubtitle(rawPackLine);

  const isGenericPosGroupBrand =
    !!cleanBrand && /^(surgical items|general|general medicines|medicines)$/i.test(cleanBrand);
  const distinctBrand =
    cleanBrand &&
    !isGenericPosGroupBrand &&
    cleanBrand.toLowerCase() !== cleanCategory.toLowerCase()
      ? cleanBrand
      : null;

  return (
    <article
      data-testid="public-product-card"
      className="h-full flex flex-col sf-product-card-v2 rounded-2xl overflow-hidden group"
    >
      {/* 1. Pure-White Full-Preview Media Stage (Zero Nested Box, Crisp Full Recognition) */}
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
        className="relative aspect-[4/3] w-full bg-white border-b border-[#EDF3F0] cursor-pointer overflow-hidden flex items-center justify-center p-2 sm:p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sf-primary)]"
      >
        {product.primary_image_url && !imgFailed ? (
          <img
            src={product.primary_image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.06]"
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

        {/* Top-Left Compact Availability Indicator */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-1.5 pointer-events-none">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border shadow-2xs ${
              isUnitOut
                ? "bg-slate-50 text-slate-600 border-slate-200"
                : product.availability_status === "low_stock"
                  ? "bg-[#FFF8EB] text-[#92580E] border-[#F3D9A4]"
                  : "bg-[#EDFAF4] text-[#0C684C] border-[#BCEAD5]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
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
                    ? "Counter Check"
                    : "In Stock"}
            </span>
          </span>

          {/* Top-Right Priority Clinical / Savings Badge Only */}
          {product.requires_prescription ? (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
              Rx
            </span>
          ) : hasDiscount ? (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#0E5146] text-white shadow-2xs tabular-nums">
              -{discountPct}%
            </span>
          ) : null}
        </div>

        {/* Subtle Hover View Cue */}
        <span
          aria-hidden="true"
          className="pointer-events-none hidden sm:inline-flex items-center px-3 py-1 rounded-full bg-[#0F232C]/85 text-white text-[11px] font-semibold absolute bottom-2.5 left-1/2 -translate-x-1/2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
        >
          View Details
        </span>
      </div>

      {/* 2. Clean Structured Card Body */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-2">
          {/* Category Eyebrow & Strength Chip */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold uppercase tracking-wider text-[10.5px] text-[#0E5146] truncate">
              {cleanCategory}
              {distinctBrand ? ` · ${distinctBrand}` : ""}
            </span>
            {cleanStrength && (
              <span className="px-2 py-0.5 rounded-md bg-[#F2F6F4] border border-[#DCE7E2] text-[#28414C] font-mono text-[10px] font-bold shrink-0">
                {cleanStrength}
              </span>
            )}
          </div>

          {/* Product Title & Composition / Pack Subtitle */}
          <div className="space-y-1">
            <h3 className="sf-heading text-[15.5px] sm:text-[16px] font-bold text-[#0F232C] leading-[1.32] line-clamp-2 min-h-[2.65rem]">
              <button
                type="button"
                onClick={() => onOpenProductDetail(product)}
                className="text-left w-full hover:text-[var(--sf-primary-ink)] transition-colors focus:outline-none focus-visible:underline"
              >
                {product.name}
              </button>
            </h3>
            <p className="text-[12px] text-[#5B717D] truncate" title={readablePackLine}>
              {readablePackLine}
            </p>
          </div>

          {/* 3. Compact Selling-Unit & Stock Row */}
          {units.length > 1 ? (
            <div className="pt-1 space-y-1.5" data-testid="product-unit-selector">
              <div className="flex flex-wrap items-center gap-1.5">
                {units.map((u) => {
                  const selected = u.unit_id === activeUnit.unit_id;
                  const uOut = isProductOut || u.in_stock === false;
                  return (
                    <button
                      key={u.unit_id}
                      type="button"
                      onClick={() => onSelectUnit(product.id, u.unit_id)}
                      title={`${u.label || u.unit_name} — PKR ${Number(u.price_pkr).toLocaleString()}`}
                      className={`h-7 px-2.5 rounded-lg text-[11.5px] font-bold transition ${
                        selected
                          ? "sf-glass-unit-active"
                          : uOut
                            ? "bg-slate-50 text-slate-400 border border-slate-200 line-through"
                            : "sf-glass-unit text-[#17303B]"
                      }`}
                    >
                      {u.unit_name}
                    </button>
                  );
                })}
              </div>
              {convertedStockText && (
                <p
                  className={`text-[11px] font-semibold inline-flex items-center gap-1 ${
                    isUnitOut ? "text-rose-600" : "text-[#496370]"
                  }`}
                >
                  {!isUnitOut && (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-[#128761] shrink-0" />
                  )}
                  <span>{convertedStockText}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="pt-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center h-6 px-2.5 rounded-md bg-[#EEF6F3] border border-[#D3E7DF] text-[#0E5146] font-bold truncate">
                {activeUnit.unit_name}
              </span>
              {convertedStockText && (
                <span
                  className={`font-semibold inline-flex items-center gap-1 truncate ${
                    isUnitOut ? "text-rose-600" : "text-[#4A6370]"
                  }`}
                >
                  {!isUnitOut && (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-[#128761] shrink-0" />
                  )}
                  <span className="truncate">{convertedStockText}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 4. Price + Fast Add-to-Cart Footer */}
        <div className="pt-3 border-t border-[#EDF3F0] space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="sf-heading sf-price text-[18px] sm:text-[19px] font-extrabold text-[#0F232C] tracking-tight">
                PKR {effectivePrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="text-[11.5px] text-[#8396A1] line-through tabular-nums">
                  PKR {comparePrice.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-[11.5px] font-medium text-[#5A707C] shrink-0">
              / {activeUnit.unit_name}
            </span>
          </div>

          {inCartItem ? (
            <div className="flex items-center justify-between gap-2">
              <QuantityStepperInput
                value={inCartItem.qty}
                min={1}
                max={inCartCap}
                size="sm"
                onChange={(q) => onUpdateCartQty(activeCartKey, q)}
                onCapReached={(cap) =>
                  onShowToast(`Maximum ${cap} ${activeUnit.unit_name} available.`)
                }
              />
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#EAF5F1] text-[#0E5146] border border-[#C6E1D7] whitespace-nowrap">
                  In Cart
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFromCart(activeCartKey)}
                  title="Remove from cart"
                  aria-label={`Remove ${product.name} from cart`}
                  data-testid="card-remove-cart-btn"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shrink-0"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : isUnitOut ? (
            <button
              type="button"
              disabled
              data-testid="add-to-cart-btn"
              className="w-full h-9 rounded-xl text-xs font-bold bg-[#F3F6F5] text-[#8698A3] border border-[#E2EAE6] cursor-not-allowed"
            >
              Out of Stock
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <QuantityStepperInput
                value={cardDraftQty}
                min={1}
                max={cardUnitCap}
                size="sm"
                onChange={(q) => onChangeDraftQty(product.id, q)}
                onCapReached={(cap) =>
                  onShowToast(`Maximum ${cap} ${activeUnit.unit_name} available.`)
                }
              />
              <button
                type="button"
                onClick={() => {
                  onAddToCart(product, cardDraftQty, false, activeUnit);
                  onChangeDraftQty(product.id, 1);
                }}
                data-testid="add-to-cart-btn"
                className="flex-1 min-w-0 h-[36px] px-3 rounded-xl sf-glass-cta text-xs font-bold inline-flex items-center justify-center gap-1.5 truncate"
              >
                <ShoppingBagIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {`Add ${units.length > 1 ? activeUnit.unit_name : "to Cart"}`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
});
