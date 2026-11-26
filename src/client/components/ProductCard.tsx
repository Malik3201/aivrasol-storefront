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

  return (
    <article
      data-testid="public-product-card"
      className="h-full flex flex-col sf-product-card-v2 rounded-2xl overflow-hidden group"
    >
      {/* 1. Solid Top Status Bar — Sits ABOVE Image (ZERO Overlays Covering Medicine Packaging!) */}
      <div className="px-3.5 py-2 bg-[#F8FAFC] border-b border-[#EDF2F7] flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`inline-flex items-center gap-1.5 font-bold ${
            isUnitOut
              ? "text-slate-500"
              : product.availability_status === "low_stock"
                ? "text-amber-700"
                : "text-emerald-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
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
                  ? "Counter Check"
                  : "In Stock"}
          </span>
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {product.requires_prescription && (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-extrabold">
              Rx
            </span>
          )}
          {hasDiscount && (
            <span className="px-1.5 py-0.5 rounded bg-[#0F172A] text-white text-[10px] font-extrabold tabular-nums">
              -{discountPct}%
            </span>
          )}
          {!product.requires_prescription && !hasDiscount && cleanStrength && (
            <span className="px-1.5 py-0.5 rounded bg-white border border-[#E2E8F0] text-[#334155] font-mono text-[10px] font-bold">
              {cleanStrength}
            </span>
          )}
        </div>
      </div>

      {/* 2. Pure-White Full-Size Unobstructed Image Frame (Zero Badges/Overlays on Top of Photo) */}
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
        className="w-full aspect-[4/3] bg-white border-b border-[#EDF2F7] cursor-pointer overflow-hidden flex items-center justify-center p-1.5 sm:p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sf-primary)]"
      >
        {product.primary_image_url && !imgFailed ? (
          <img
            src={product.primary_image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain transition-transform duration-200 ease-out group-hover:scale-[1.04]"
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

      {/* 3. Solid E-Commerce Product Body */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-3 bg-white">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold uppercase tracking-wider text-[10.5px] sf-text-brand truncate">
              {cleanCategory}
            </span>
            {(product.requires_prescription || hasDiscount) && cleanStrength && (
              <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#334155] font-mono text-[10px] font-bold shrink-0">
                {cleanStrength}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="sf-heading text-[15px] sm:text-[15.5px] font-bold text-[#0F172A] leading-snug line-clamp-2 min-h-[2.6rem]">
              <button
                type="button"
                onClick={() => onOpenProductDetail(product)}
                className="text-left w-full hover:text-[var(--sf-primary-ink)] transition-colors focus:outline-none focus-visible:underline"
              >
                {product.name}
              </button>
            </h3>
            <p className="text-[12px] text-[#64748B] truncate" title={readablePackLine}>
              {readablePackLine}
            </p>
          </div>

          {/* Selling Units Selector / Pack Stock Row */}
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
                            : "sf-glass-unit text-[#1E293B]"
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
                    isUnitOut ? "text-rose-600" : "text-[#475569]"
                  }`}
                >
                  {!isUnitOut && (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span>{convertedStockText}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="pt-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center h-6 px-2 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] text-[#334155] font-bold truncate">
                {activeUnit.unit_name}
              </span>
              {convertedStockText && (
                <span
                  className={`font-semibold inline-flex items-center gap-1 truncate ${
                    isUnitOut ? "text-rose-600" : "text-[#475569]"
                  }`}
                >
                  {!isUnitOut && (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span className="truncate">{convertedStockText}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 4. Solid Price & Cart Action Row */}
        <div className="pt-3 border-t border-[#EDF2F7] space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="sf-heading sf-price text-[18px] sm:text-[19px] font-extrabold text-[#0F172A] tracking-tight">
                PKR {effectivePrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="text-[11.5px] text-[#94A3B8] line-through tabular-nums">
                  PKR {comparePrice.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-[11.5px] font-medium text-[#64748B] shrink-0">
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
                <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold sf-badge-brand whitespace-nowrap">
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
              onClick={() => onOpenProductDetail(product)}
              data-testid="add-to-cart-btn"
              className="w-full h-9 rounded-xl text-xs font-bold bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] transition"
            >
              Out of Stock • View Alternatives
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
                className="flex-1 min-w-0 h-[36px] px-3 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 truncate"
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
