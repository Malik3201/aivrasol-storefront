import React from "react";
import type { PublicStorefrontProduct } from "../../shared/types";
import { resolveProductStudioVisual } from "../design/editorialAssets";
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

export function ProductCard({
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

  const isProductOut =
    product.availability_status === "out_of_stock" ||
    product.availability_status === "unavailable";
  const isUnitOut = isProductOut || activeUnit.in_stock === false;

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

  const rawPackLine =
    [cleanForm, cleanGeneric, cleanPacking].filter(Boolean).join(" • ") ||
    activeUnit.unit_name;
  const readablePackLine = formatReadablePackSubtitle(rawPackLine);

  const studioSpec = resolveProductStudioVisual({
    name: product.name,
    dosageForm: product.dosage_form,
    categoryName: product.category_name || product.brand_name,
    packingLabel: product.packing_label,
    requiresPrescription: product.requires_prescription,
    availabilityStatus: product.availability_status,
  });

  const isGenericPosGroupBrand =
    !!cleanBrand && /^(surgical items|general|general medicines|medicines)$/i.test(cleanBrand);
  const distinctBrand =
    cleanBrand &&
    !isGenericPosGroupBrand &&
    cleanBrand.toLowerCase() !== cleanCategory.toLowerCase()
      ? cleanBrand
      : null;

  // Top-right media pill: Rx takes clinical priority, else strength/SKU or distinct brand
  const topMediaRightBadge = product.requires_prescription
    ? "Rx Required"
    : cleanStrength || distinctBrand || null;

  return (
    <article
      data-testid="public-product-card"
      className="h-full flex flex-col sf-product-card-v2 rounded-[26px] overflow-hidden group"
    >
      {/* 1. Inset Frosted Glass Media Frame */}
      <div className="p-2 pb-0 relative z-10">
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
          style={{ backgroundColor: studioSpec.stageBg }}
          className="relative aspect-[4/3] w-full rounded-[19px] ring-1 ring-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_16px_-8px_rgba(14,81,70,0.12)] cursor-pointer overflow-hidden flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
        >
          {product.primary_image_url && !imgFailed ? (
            <div className="w-full h-full p-5 pt-11 pb-7 flex items-center justify-center">
              <img
                src={product.primary_image_url}
                alt={product.name}
                loading="lazy"
                decoding="async"
                onError={() => setImgFailed(true)}
                className="max-h-full max-w-full object-contain rounded-xl drop-shadow-[0_10px_18px_rgba(17,36,45,0.13)] transition-transform duration-300 group-hover:scale-[1.04]"
              />
            </div>
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

          {/* Soft Glass Specular & Bottom Mist Blend */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-white/40"
          />

          {/* Top Frosted Glass Status & Spec Pills */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border shadow-[0_2px_8px_rgba(14,81,70,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] ${
                isUnitOut
                  ? "bg-white/75 text-slate-600 border-white/90"
                  : product.availability_status === "low_stock"
                    ? "bg-[#FFF4E0]/82 text-[#8F5B14] border-white/90"
                    : "bg-[#E2F7EE]/80 text-[#0D674B] border-white/90"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isUnitOut
                    ? "bg-slate-400"
                    : product.availability_status === "low_stock"
                      ? "bg-[#D9912B]"
                      : "bg-[#12805C]"
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

            {topMediaRightBadge && (
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border shadow-[0_2px_8px_rgba(14,81,70,0.07),inset_0_1px_0_rgba(255,255,255,0.92)] truncate max-w-[120px] ${
                  product.requires_prescription
                    ? "bg-rose-50/85 text-rose-700 border-white/90"
                    : "bg-white/70 text-[#1B333E] border-white/90"
                }`}
              >
                {topMediaRightBadge}
              </span>
            )}
          </div>
        </div>

        {/* Floating Frosted Spec Pill Overlapping Media Seam */}
        <span
          className={`pointer-events-none absolute -bottom-2.5 right-4 z-20 px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wide backdrop-blur-md border border-white/95 shadow-[0_4px_12px_rgba(14,81,70,0.1),inset_0_1px_0_#ffffff] ${
            studioSpec.specBadgeTone === "warm"
              ? "bg-[#FFF3DE]/86 text-[#7D4E14]"
              : studioSpec.specBadgeTone === "teal"
                ? "bg-[#E2F5F1]/86 text-[#0E5146]"
                : "bg-white/82 text-[#155749]"
          }`}
        >
          {studioSpec.specBadge}
        </span>
      </div>

      {/* 2. Translucent Frosted Glass Card Body */}
      <div className="px-4 sm:px-5 pt-4 pb-4 sm:pb-5 flex-1 flex flex-col justify-between gap-4 relative z-10">
        <div className="space-y-2.5">
          {/* Category Eyebrow & Strength Pill */}
          <div className="flex items-center justify-between gap-2 pr-1">
            <span className="font-bold uppercase tracking-wider text-[11px] text-[#15443D] truncate">
              {cleanCategory}
            </span>
            {cleanStrength && (
              <span className="px-2.5 py-0.5 rounded-md sf-glass-pill text-[#1B333E] font-mono text-[10.5px] font-bold shrink-0">
                {cleanStrength}
              </span>
            )}
          </div>

          {/* Product Name & Pack Subtitle */}
          <div className="space-y-1">
            <h3
              onClick={() => onOpenProductDetail(product)}
              className="sf-heading text-[18px] sm:text-[19px] font-extrabold text-[#0F222B] leading-snug line-clamp-2 min-h-[2.8rem] cursor-pointer group-hover:text-[var(--sf-primary-ink)] transition-colors"
            >
              {product.name}
            </h3>
            <p className="text-[12.5px] font-medium text-[#465E6A] truncate">
              {readablePackLine}
            </p>
          </div>

          {/* 3. Glassy Selling-Unit Selection Zone */}
          <div className="pt-1 min-h-[68px] flex flex-col justify-between space-y-1.5">
            <span className="text-[11px] font-semibold text-[#4E6672] block">
              {units.length > 1 ? "Select Selling Unit" : "Selling Unit"}
            </span>

            {units.length > 1 ? (
              <div className="space-y-1.5" data-testid="product-unit-selector">
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
                        className={`h-8 px-3.5 rounded-xl text-xs font-bold transition ${
                          selected
                            ? "sf-glass-unit-active"
                            : uOut
                              ? "bg-white/40 text-slate-400 border border-white/60 line-through"
                              : "sf-glass-unit text-[#18313C]"
                        }`}
                      >
                        {u.unit_name}
                      </button>
                    );
                  })}
                </div>
                {convertedStockText && (
                  <p
                    className={`text-[11.5px] font-semibold inline-flex items-center gap-1 ${
                      isUnitOut ? "text-rose-600" : "text-[#2F4B57]"
                    }`}
                  >
                    <span>{convertedStockText}</span>
                    {!isUnitOut && (
                      <CheckCircleIcon className="w-3.5 h-3.5 text-[#12805C] shrink-0" />
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="inline-flex items-center h-8 px-3.5 rounded-xl bg-[#CFEAE2]/75 backdrop-blur-sm border border-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(128,190,174,0.45)] text-[#0D4B41] text-xs font-bold truncate">
                  {activeUnit.unit_name}
                </span>
                {convertedStockText && (
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                      isUnitOut
                        ? "bg-rose-50/85 text-rose-600 border border-rose-200"
                        : "sf-glass-pill text-[#243F4B]"
                    }`}
                  >
                    <span>{convertedStockText}</span>
                    {!isUnitOut && (
                      <CheckCircleIcon className="w-3.5 h-3.5 text-[#12805C] shrink-0" />
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 4. Frosted Hairline + Price + Glassy Stepper + Glossy CTA */}
        <div className="pt-3.5 border-t border-white/80 shadow-[0_-1px_0_rgba(14,81,70,0.06)] space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="sf-heading sf-price text-[20px] sm:text-[21px] font-extrabold text-[#0F222B] tracking-tight">
                PKR {effectivePrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="text-xs text-[#7D919D] line-through tabular-nums">
                  PKR {comparePrice.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-[#4B636F] truncate">
              per {activeUnit.unit_name}
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
                <span className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold sf-glass-pill text-[#0E5146] whitespace-nowrap">
                  In Cart
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFromCart(activeCartKey)}
                  title="Remove from cart"
                  aria-label={`Remove ${product.name} from cart`}
                  data-testid="card-remove-cart-btn"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 bg-rose-50/85 hover:bg-rose-100 border border-white/90 shadow-2xs transition shrink-0"
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
              className="w-full h-10 rounded-full text-xs font-bold bg-white/55 text-[#8899A4] border border-white/80 cursor-not-allowed"
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
                className="flex-1 min-w-0 h-[38px] px-3.5 rounded-full sf-glass-cta text-xs font-bold inline-flex items-center justify-center gap-1.5 truncate"
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
}
