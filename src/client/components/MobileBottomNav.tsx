import type { StorefrontView } from "../types-ui";
import {
  GridCatalogIcon,
  HomeIcon,
  PackageTrackIcon,
  SearchIcon,
  ShoppingBagIcon,
} from "./Icons";

interface MobileBottomNavProps {
  activeView: StorefrontView;
  cartTotalItems: number;
  cartDrawerOpen: boolean;
  onSelectHome: () => void;
  onSelectShop: () => void;
  onFocusSearch: () => void;
  onSelectTrack: () => void;
  onOpenCart: () => void;
}

export function MobileBottomNav({
  activeView,
  cartTotalItems,
  cartDrawerOpen,
  onSelectHome,
  onSelectShop,
  onFocusSearch,
  onSelectTrack,
  onOpenCart,
}: MobileBottomNavProps) {
  const isHome = activeView === "home" && !cartDrawerOpen;
  const isShop = (activeView === "shop" || activeView === "product") && !cartDrawerOpen;
  const isTrack = activeView === "track" && !cartDrawerOpen;
  const isCart = cartDrawerOpen || activeView === "cart" || activeView === "checkout";

  return (
    <nav
      aria-label="Mobile Primary Navigation"
      data-testid="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-2px_12px_rgba(15,23,42,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-[62px] max-w-lg mx-auto">
        <button
          type="button"
          onClick={onSelectHome}
          aria-current={isHome ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition active:scale-[0.95] ${
            isHome ? "text-[var(--sf-primary-ink)] font-bold" : "text-[#4B5563] font-medium"
          }`}
        >
          <span
            className={`w-8 h-6 rounded-full flex items-center justify-center transition-colors ${
              isHome ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary)]" : ""
            }`}
          >
            <HomeIcon className="w-[19px] h-[19px]" />
          </span>
          <span className="text-[10.5px] leading-tight">Home</span>
        </button>

        <button
          type="button"
          onClick={onSelectShop}
          aria-current={isShop ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition active:scale-[0.95] ${
            isShop ? "text-[var(--sf-primary-ink)] font-bold" : "text-[#4B5563] font-medium"
          }`}
        >
          <span
            className={`w-8 h-6 rounded-full flex items-center justify-center transition-colors ${
              isShop ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary)]" : ""
            }`}
          >
            <GridCatalogIcon className="w-[18px] h-[18px]" />
          </span>
          <span className="text-[10.5px] leading-tight">Shop</span>
        </button>

        <button
          type="button"
          onClick={onFocusSearch}
          className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[#4B5563] font-medium transition active:scale-[0.95]"
        >
          <span className="w-8 h-6 rounded-full flex items-center justify-center">
            <SearchIcon className="w-[19px] h-[19px]" />
          </span>
          <span className="text-[10.5px] leading-tight">Search</span>
        </button>

        <button
          type="button"
          onClick={onSelectTrack}
          aria-current={isTrack ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition active:scale-[0.95] ${
            isTrack ? "text-[var(--sf-primary-ink)] font-bold" : "text-[#4B5563] font-medium"
          }`}
        >
          <span
            className={`w-8 h-6 rounded-full flex items-center justify-center transition-colors ${
              isTrack ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary)]" : ""
            }`}
          >
            <PackageTrackIcon className="w-[19px] h-[19px]" />
          </span>
          <span className="text-[10.5px] leading-tight">Track</span>
        </button>

        <button
          type="button"
          onClick={onOpenCart}
          data-testid="mobile-nav-cart-btn"
          aria-label={`Open shopping cart (${cartTotalItems} items)`}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition active:scale-[0.95] ${
            isCart ? "text-[var(--sf-primary-ink)] font-bold" : "text-[#4B5563] font-medium"
          }`}
        >
          <span
            className={`relative w-8 h-6 rounded-full flex items-center justify-center transition-colors ${
              isCart ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary)]" : ""
            }`}
          >
            <ShoppingBagIcon className="w-[19px] h-[19px]" />
            {cartTotalItems > 0 && (
              <span
                data-testid="mobile-nav-cart-badge"
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-extrabold leading-none inline-flex items-center justify-center tabular-nums shadow-2xs border border-white"
                style={{ backgroundColor: "var(--sf-primary)" }}
              >
                {cartTotalItems > 99 ? "99+" : cartTotalItems}
              </span>
            )}
          </span>
          <span className="text-[10.5px] leading-tight">Cart</span>
        </button>
      </div>
    </nav>
  );
}
