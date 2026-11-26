import React, { useState } from "react";
import type { PublicStorefrontProduct } from "../../shared/types";
import type { CartItem } from "../types-ui";
import {
  CloseIcon,
  MedicinePlaceholderIllustration,
  ShoppingBagIcon,
  TrashIcon,
  TruckIcon,
} from "./Icons";
import { QuantityStepperInput } from "./QuantityStepperInput";

interface CartDrawerProps {
  open: boolean;
  displayName: string;
  cart: CartItem[];
  totalItems: number;
  subtotalPkr: number;
  remainingForFreeDelivery: number;
  freeThreshold: number;
  deliveryEnabled: boolean;
  getCartItemMaxCap: (item: CartItem, allCart: CartItem[]) => number;
  onUpdateCartQty: (cartKey: string, nextQty: number) => void;
  onRemoveFromCart: (cartKey: string) => void;
  onClearCart: () => void;
  onClose: () => void;
  onProceedToCheckout: () => void;
  onBrowseMedicines: () => void;
  onOpenProductDetail?: (product: PublicStorefrontProduct) => void;
  onShowToast: (msg: string) => void;
}

function CartItemThumb({
  product,
  onClick,
}: {
  product: PublicStorefrontProduct;
  onClick?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Inspect ${product.name}`}
      className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border border-[#DCE7E2] bg-white overflow-hidden flex items-center justify-center shrink-0 p-0.5 hover:border-[var(--sf-primary)] hover:shadow-xs transition group/thumb"
    >
      {product.primary_image_url && !imgFailed ? (
        <img
          src={product.primary_image_url}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain transition-transform duration-200 group-hover/thumb:scale-105"
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
    </button>
  );
}

export function CartDrawer({
  open,
  displayName,
  cart,
  totalItems,
  subtotalPkr,
  remainingForFreeDelivery,
  freeThreshold,
  deliveryEnabled,
  getCartItemMaxCap,
  onUpdateCartQty,
  onRemoveFromCart,
  onClearCart,
  onClose,
  onProceedToCheckout,
  onBrowseMedicines,
  onOpenProductDetail,
  onShowToast,
}: CartDrawerProps) {
  if (!open) return null;

  const progressPct =
    freeThreshold > 0 ? Math.min(100, Math.round((subtotalPkr / freeThreshold) * 100)) : 100;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1220]/55 flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Cart"
    >
      <aside
        className="sf-drawer-enter bg-white w-full sm:max-w-md h-[100dvh] sm:h-full shadow-2xl border-l border-[#E5E7EB] flex flex-col justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crisp Branded Cart Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 bg-[#0B1220] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: "var(--sf-primary)" }}
            >
              <ShoppingBagIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="sf-heading text-base font-bold text-white leading-tight">
                Shopping Cart ({totalItems})
              </h2>
              <p className="text-xs text-slate-300 truncate">{displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  onShowToast("Shopping cart cleared");
                }}
                title="Clear entire cart"
                className="min-h-[40px] sm:h-8 px-2.5 rounded-lg bg-white/12 hover:bg-white/20 text-white border border-white/20 text-xs font-medium inline-flex items-center gap-1 transition active:scale-95"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close cart drawer"
              className="min-w-[40px] min-h-[40px] sm:w-8 sm:h-8 rounded-lg bg-white/12 hover:bg-white/20 text-white flex items-center justify-center transition active:scale-95"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Free Delivery Progress Strip */}
        {cart.length > 0 && deliveryEnabled && freeThreshold > 0 && (
          <div className="px-4 sm:px-5 py-2.5 sm:py-3 bg-[#F9FAFB] border-b border-[#E5E7EB] space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-[#111827]">
              <span className="inline-flex items-center gap-1.5 font-medium min-w-0">
                <TruckIcon className="w-3.5 h-3.5 sf-text-brand shrink-0" />
                {remainingForFreeDelivery > 0 ? (
                  <span className="truncate">
                    Add{" "}
                    <strong className="font-bold tabular-nums">
                      Rs. {remainingForFreeDelivery.toLocaleString()}
                    </strong>{" "}
                    for free delivery
                  </span>
                ) : (
                  <span className="font-bold sf-text-brand truncate">Unlocked Free Home Delivery</span>
                )}
              </span>
              <span className="text-[11px] font-bold sf-text-brand tabular-nums shrink-0">
                {progressPct}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: "var(--sf-primary)",
                }}
              />
            </div>
          </div>
        )}

        {/* Items List with Large Full-Preview Product Images & 40x40 Touch Steppers */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 divide-y divide-[#F3F4F6]">
          {cart.length === 0 ? (
            <div className="py-16 sm:py-20 text-center space-y-3.5">
              <div className="w-14 h-14 rounded-2xl bg-[#EEF7F4] border border-[#CDE3DB] flex items-center justify-center mx-auto sf-text-brand">
                <ShoppingBagIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="sf-heading text-base font-bold text-[#0F232C]">Your cart is empty</p>
                <p className="text-xs text-[#546A76] max-w-xs mx-auto leading-relaxed">
                  Browse medicines, surgical items, and healthcare essentials from {displayName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBrowseMedicines();
                }}
                className="mt-2 min-h-[44px] px-5 rounded-xl sf-btn-primary text-xs font-semibold"
              >
                Browse Medicines
              </button>
            </div>
          ) : (
            cart.map((cartItem) => {
              const { cartKey, product, selectedUnit, qty } = cartItem;
              const unitPrice = Number(selectedUnit.price_pkr ?? 0);
              const lineTotal = Number((unitPrice * qty).toFixed(2));
              const itemCap = getCartItemMaxCap(cartItem, cart);

              return (
                <div key={cartKey} className="py-3.5 sm:py-4 flex items-start gap-3">
                  <CartItemThumb
                    product={product}
                    onClick={onOpenProductDetail ? () => onOpenProductDetail(product) : undefined}
                  />

                  {/* Item Details & Controls */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={
                            onOpenProductDetail ? () => onOpenProductDetail(product) : undefined
                          }
                          className="sf-heading text-sm font-bold text-[#0F232C] hover:text-[var(--sf-primary-ink)] leading-snug line-clamp-2 text-left transition-colors"
                        >
                          {product.name}
                        </button>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-[#EEF6F3] text-[#0E5146] text-[10.5px] font-bold">
                            {selectedUnit.label || selectedUnit.unit_name}
                          </span>
                          <span className="text-xs text-[#546A76] tabular-nums">
                            PKR {unitPrice.toLocaleString()} / {selectedUnit.unit_name}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveFromCart(cartKey)}
                        title="Remove item from cart"
                        aria-label={`Remove ${product.name} from cart`}
                        data-testid="drawer-remove-item-btn"
                        className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition active:scale-95 shrink-0"
                      >
                        <TrashIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <QuantityStepperInput
                        value={qty}
                        min={1}
                        max={itemCap}
                        size="touch"
                        onChange={(q) => onUpdateCartQty(cartKey, q)}
                        onCapReached={(cap) =>
                          onShowToast(`Maximum ${cap} ${selectedUnit.unit_name} available.`)
                        }
                      />
                      <span className="sf-heading text-sm font-extrabold text-[#0F232C] tabular-nums whitespace-nowrap">
                        PKR {lineTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Clean Safe-Area Sticky Summary Footer */}
        {cart.length > 0 && (
          <div className="px-4 sm:px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#E2EAE6] bg-[#F8FAF9] space-y-3">
            <div className="space-y-1 text-xs text-[#546A76]">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-[#0F232C]">Items Subtotal</span>
                <span className="sf-heading text-lg font-extrabold text-[#0F232C] tabular-nums">
                  PKR {subtotalPkr.toLocaleString()}
                </span>
              </div>
              <p className="text-[11.5px] text-[#546A76]">
                Delivery zone fee, promo code, or free counter pickup is finalized at checkout.
              </p>
            </div>

            <button
              type="button"
              onClick={onProceedToCheckout}
              data-testid="drawer-proceed-checkout-btn"
              className="w-full min-h-[48px] rounded-xl sf-btn-primary text-sm font-bold shadow-xs"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
