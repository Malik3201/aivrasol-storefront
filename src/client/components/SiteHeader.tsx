import { useEffect, useState } from "react";
import type {
  StorefrontBrandingRecord,
  StorefrontPublicContext,
  StorefrontSettingsRecord,
} from "../../shared/types";
import { getPharmacyMonogram, sanitizePublicCopy } from "../design/theme";
import type { StorefrontView } from "../types-ui";
import {
  CloseIcon,
  MapPinIcon,
  MenuIcon,
  PackageTrackIcon,
  PharmacyCrossIcon,
  PhoneIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  WhatsAppIcon,
} from "./Icons";

interface SiteHeaderProps {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  settings?: Partial<StorefrontSettingsRecord> | Record<string, any> | null;
  displayName: string;
  activeView: StorefrontView;
  onSelectView: (view: StorefrontView) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSubmitSearch: () => void;
  cartTotalItems: number;
  cartSubtotalPkr: number;
  onOpenCartDrawer: () => void;
}

const NAV_ITEMS: Array<{ id: StorefrontView; label: string }> = [
  { id: "home", label: "Home" },
  { id: "shop", label: "Medicines" },
  { id: "delivery", label: "Delivery" },
  { id: "branches", label: "Locations" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
];

export function SiteHeader({
  sf,
  branding,
  settings,
  displayName,
  activeView,
  onSelectView,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  cartTotalItems,
  cartSubtotalPkr,
  onOpenCartDrawer,
}: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [branding?.logo_url]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  const hasVerifiedLicense = Boolean(sf.drug_sale_license_no && sf.drug_sale_license_no.trim());
  const showLicenseBadge =
    hasVerifiedLicense && Number(branding?.show_verified_license_badge ?? 1) === 1;

  const rawTagline = branding?.tagline?.trim();
  const safeSubtitle = rawTagline
    ? sanitizePublicCopy(rawTagline, sf, `${sf.city} Community Pharmacy`)
    : `${sf.city} Community Pharmacy`;

  const announcementEnabled = Number(settings?.announcement_bar_enabled ?? 1) === 1;
  const announcementText = sanitizePublicCopy(
    settings?.announcement_bar_text,
    sf,
    `${displayName} (${sf.city}) — Local home delivery & counter pickup`
  );

  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  return (
    <>
      {/* Refined Top Utility Bar */}
      {announcementEnabled && (
        <div
          className="text-white/90 text-xs border-b border-white/10"
          style={{ backgroundColor: "var(--sf-forest-deep)" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[36px] py-1.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--sf-warm-accent)" }}
              />
              <p className="truncate font-medium text-white/90">{announcementText}</p>
            </div>
            <div className="hidden sm:flex items-center gap-5 shrink-0 text-xs">
              {hasVerifiedLicense && (
                <span className="inline-flex items-center gap-1.5 font-mono text-emerald-200">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  <span>Lic: {sf.drug_sale_license_no}</span>
                </span>
              )}
              {sf.contact_phone && (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="hidden md:inline-flex items-center gap-1.5 text-white/80 hover:text-white transition"
                >
                  <PhoneIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                  <span className="tabular-nums">{sf.contact_phone}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onSelectView("track")}
                className="inline-flex items-center gap-1.5 text-[#FFF8ED] hover:text-[#E6A65B] font-semibold transition whitespace-nowrap"
              >
                <PackageTrackIcon className="w-3.5 h-3.5" />
                <span>Track Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Sticky Global Header (Lightweight Solid Surface — Zero GPU Scroll Lag) */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E1EAE5] shadow-[0_1px_4px_rgba(15,35,44,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[76px] flex items-center justify-between gap-3 lg:gap-6">
          {/* Left: Pharmacy Brand Lockup */}
          <button
            type="button"
            onClick={() => onSelectView("home")}
            className="flex items-center gap-3 min-w-0 text-left group focus:outline-none"
          >
            {branding?.logo_url && !logoFailed ? (
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-[#DBE5E0] bg-white p-1 flex items-center justify-center shrink-0 shadow-2xs group-hover:border-[var(--sf-primary)] transition-colors">
                <img
                  src={branding.logo_url}
                  alt={displayName}
                  onError={() => setLogoFailed(true)}
                  className="max-h-full max-w-full object-contain"
                  data-testid="pharmacy-header-logo"
                />
              </div>
            ) : (
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 relative shadow-2xs"
                style={{
                  backgroundColor: "var(--sf-forest)",
                  color: "#FFFFFF",
                }}
              >
                <span className="text-sm font-bold tracking-tight sf-heading">
                  {getPharmacyMonogram(displayName)}
                </span>
                <span
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md flex items-center justify-center text-[#172B36]"
                  style={{ backgroundColor: "var(--sf-warm-accent)" }}
                >
                  <PharmacyCrossIcon className="w-2.5 h-2.5" />
                </span>
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="sf-heading text-[16px] sm:text-[19px] font-bold text-[#172B36] tracking-tight leading-tight truncate max-w-[165px] sm:max-w-[240px] xl:max-w-none"
                  data-testid="pharmacy-display-name"
                >
                  {displayName}
                </span>
                {showLicenseBadge && (
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold sf-badge-brand whitespace-nowrap">
                    <ShieldCheckIcon className="w-3 h-3" />
                    <span>Licensed</span>
                  </span>
                )}
              </div>
              <p className="hidden md:block text-xs text-[#607481] truncate max-w-[230px] xl:max-w-[280px]">
                {safeSubtitle}
              </p>
            </div>
          </button>

          {/* Center: Balanced Desktop Navigation */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-1 bg-[#F4F7F5] p-1 rounded-xl border border-[#E3ECE8]"
          >
            {NAV_ITEMS.map((item) => {
              const isActive =
                activeView === item.id ||
                (item.id === "shop" && activeView === "product");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  className={`px-3.5 h-9 rounded-lg text-[13.5px] whitespace-nowrap transition ${
                    isActive
                      ? "bg-white text-[var(--sf-primary-ink)] font-semibold shadow-2xs"
                      : "text-[#4D616E] hover:text-[#172B36] font-medium"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right: Live Instant Search, Cart & Mobile Menu */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Inline Desktop Instant Medicine Search */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (activeView !== "shop") {
                  onSubmitSearch();
                }
              }}
              className="hidden md:flex items-center relative"
            >
              <SearchIcon className="w-4 h-4 text-[#0E5146] absolute left-3 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  onSearchChange(val);
                  if (activeView !== "shop" && val.trim().length > 0) {
                    onSelectView("shop");
                  }
                }}
                placeholder="Search medicines…"
                aria-label="Search medicines"
                className="h-[40px] w-44 xl:w-56 pl-9 pr-8 rounded-xl bg-[#F4F7F6] hover:bg-[#EDF3F0] focus:bg-white border border-[#DCE6E1] focus:border-[var(--sf-primary)] focus:ring-2 focus:ring-[var(--sf-primary-soft)] focus:outline-none text-xs font-medium text-[#0F232C] placeholder:text-[#6B7F8B] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Clear header search"
                  className="absolute right-2 w-6 h-6 rounded-md hover:bg-[#E6EFEA] flex items-center justify-center text-[#546A76]"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </form>

            {/* Mobile Search Toggle */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label="Toggle medicine search"
              className="md:hidden w-10 h-10 rounded-xl sf-btn-secondary flex items-center justify-center"
            >
              <SearchIcon className="w-4 h-4 text-[#172B36]" />
            </button>

            {/* Cart Button */}
            <button
              type="button"
              onClick={onOpenCartDrawer}
              data-testid="header-cart-button"
              className="inline-flex items-center gap-2 h-10 sm:h-[42px] px-3 sm:px-4 rounded-xl sf-btn-primary text-xs font-semibold shadow-2xs whitespace-nowrap"
            >
              <ShoppingBagIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Cart</span>
              <span
                className="min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center tabular-nums"
                style={{
                  backgroundColor:
                    cartTotalItems > 0 ? "var(--sf-warm-accent)" : "rgba(255,255,255,0.2)",
                  color: cartTotalItems > 0 ? "#172B36" : "#FFFFFF",
                }}
              >
                {cartTotalItems}
              </span>
              {cartSubtotalPkr > 0 && (
                <span className="hidden md:inline font-semibold border-l border-white/25 pl-2.5 tabular-nums">
                  PKR {cartSubtotalPkr.toLocaleString()}
                </span>
              )}
            </button>

            {/* Mobile Accessible Menu Trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden w-10 h-10 rounded-xl sf-btn-secondary flex items-center justify-center"
            >
              <MenuIcon className="w-5 h-5 text-[#172B36]" />
            </button>
          </div>
        </div>

        {/* Expandable Mobile Search Bar */}
        {mobileSearchOpen && (
          <div className="md:hidden border-t border-[#DBE5E0] bg-[#FAF8F4] px-4 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMobileSearchOpen(false);
                onSubmitSearch();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <SearchIcon className="w-4 h-4 text-[#607481] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={`Search medicines at ${displayName}…`}
                  autoFocus
                  className="w-full h-11 pl-10 pr-3 rounded-xl sf-input text-sm"
                />
              </div>
              <button
                type="submit"
                className="h-11 px-4 rounded-xl sf-btn-primary text-xs font-semibold shrink-0"
              >
                Search
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Polished Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0F2028]/55 backdrop-blur-xs flex justify-end lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="sf-drawer-enter w-full max-w-[320px] bg-white h-full shadow-2xl border-l border-[#DBE5E0] flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* Branded Mobile Drawer Header */}
              <div
                className="p-5 text-white flex items-center justify-between gap-3"
                style={{ backgroundColor: "var(--sf-forest)" }}
              >
                <div className="min-w-0">
                  <p className="sf-heading text-base font-bold truncate">{displayName}</p>
                  <p className="text-xs text-white/75 truncate">{sf.city}, Pakistan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>

              <nav className="p-4 space-y-1" aria-label="Mobile Navigation">
                {[...NAV_ITEMS, { id: "track" as StorefrontView, label: "Track Online Order" }].map(
                  (item) => {
                    const active = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelectView(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full px-4 h-11 rounded-xl text-sm text-left flex items-center justify-between transition ${
                          active
                            ? "bg-[var(--sf-primary-soft)] sf-text-brand font-semibold"
                            : "text-[#172B36] font-medium hover:bg-[#F3F6F4]"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.id === "track" && <PackageTrackIcon className="w-4 h-4 opacity-75" />}
                      </button>
                    );
                  }
                )}
              </nav>
            </div>

            <div className="p-5 border-t border-[#DBE5E0] bg-[#FAF8F4] space-y-3 text-xs">
              {sf.address_line && (
                <div className="flex items-start gap-2 text-[#607481]">
                  <MapPinIcon className="w-4 h-4 shrink-0 mt-0.5 sf-text-brand" />
                  <span>
                    {sf.address_line}, {sf.city}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                {sf.contact_phone && (
                  <a
                    href={`tel:${sf.contact_phone}`}
                    className="h-10 rounded-xl sf-btn-secondary inline-flex items-center justify-center gap-1.5 font-semibold text-xs"
                  >
                    <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                    <span>Call</span>
                  </a>
                )}
                {whatsappDigits && (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-10 rounded-xl sf-btn-primary inline-flex items-center justify-center gap-1.5 font-semibold text-xs"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
