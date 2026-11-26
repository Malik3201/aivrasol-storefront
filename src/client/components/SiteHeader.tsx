import { useEffect, useState } from "react";
import type {
  PublicStorefrontProduct,
  StorefrontBrandingRecord,
  StorefrontCategoryRecord,
  StorefrontPublicContext,
  StorefrontSettingsRecord,
} from "../../shared/types";
import { getPharmacyMonogram, isMeaningfulCategory, sanitizePublicCopy } from "../design/theme";
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
import { SmartSearchBar } from "./SmartSearchBar";

interface SiteHeaderProps {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  settings?: Partial<StorefrontSettingsRecord> | Record<string, any> | null;
  categories?: StorefrontCategoryRecord[];
  displayName: string;
  activeView: StorefrontView;
  selectedCategory?: string;
  onSelectView: (view: StorefrontView) => void;
  onSelectCategory?: (category: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSubmitSearch: (q?: string) => void;
  onOpenProductDetail: (prod: PublicStorefrontProduct) => void;
  onQuickAddToCart: (prod: PublicStorefrontProduct) => void;
  cartTotalItems: number;
  cartSubtotalPkr: number;
  onOpenCartDrawer: () => void;
}

const SECONDARY_LINKS: Array<{ id: StorefrontView; label: string }> = [
  { id: "delivery", label: "Delivery" },
  { id: "branches", label: "Locations" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
];

export function SiteHeader({
  sf,
  branding,
  settings,
  categories = [],
  displayName,
  activeView,
  selectedCategory = "all",
  onSelectView,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  onOpenProductDetail,
  onQuickAddToCart,
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
    ? sanitizePublicCopy(rawTagline, sf, `Online Pharmacy • ${sf.city}`)
    : `Online Pharmacy • ${sf.city}`;

  const announcementEnabled = Number(settings?.announcement_bar_enabled ?? 1) === 1;
  const announcementText = sanitizePublicCopy(
    settings?.announcement_bar_text,
    sf,
    `${displayName} (${sf.city}) — Genuine medicines delivered to your door & free counter pickup`
  );

  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");
  const topCategories = categories.filter(isMeaningfulCategory).slice(0, 4);

  return (
    <>
      {/* 1. Crisp Top Commercial Utility Strip */}
      {announcementEnabled && (
        <div className="bg-[#0F172A] text-slate-200 text-xs border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[34px] py-1.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--sf-primary)" }}
              />
              <p className="truncate font-medium text-slate-200">{announcementText}</p>
            </div>
            <div className="hidden sm:flex items-center gap-4 shrink-0 text-[11.5px]">
              {hasVerifiedLicense && (
                <span className="inline-flex items-center gap-1 font-mono text-emerald-300">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  <span>Lic: {sf.drug_sale_license_no}</span>
                </span>
              )}
              {sf.contact_phone && (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="hidden md:inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition"
                >
                  <PhoneIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="tabular-nums font-medium">{sf.contact_phone}</span>
                </a>
              )}
              {whatsappDigits && (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden lg:inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 font-semibold transition"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  <span>Pharmacist Help</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onSelectView("track")}
                className="inline-flex items-center gap-1 text-white hover:text-emerald-300 font-semibold transition whitespace-nowrap"
              >
                <PackageTrackIcon className="w-3.5 h-3.5" />
                <span>Track Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Solid E-Commerce Sticky Header (Brand + Center Smart Search + Cart) */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] shadow-[0_1px_4px_rgba(15,23,42,0.05)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-3 lg:gap-6">
          {/* Left: Strong Pharmacy Brand Lockup */}
          <button
            type="button"
            onClick={() => onSelectView("home")}
            className="flex items-center gap-2.5 sm:gap-3 min-w-0 text-left group shrink-0"
          >
            {branding?.logo_url && !logoFailed ? (
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-[#E2E8F0] bg-white p-1 flex items-center justify-center shrink-0">
                <img
                  src={branding.logo_url}
                  alt={displayName}
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-contain"
                  data-testid="pharmacy-header-logo"
                />
              </div>
            ) : (
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 relative text-white"
                style={{ backgroundColor: "var(--sf-primary)" }}
              >
                <span className="text-sm font-extrabold tracking-tight sf-heading">
                  {getPharmacyMonogram(displayName)}
                </span>
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md bg-[#0F172A] text-white flex items-center justify-center border border-white">
                  <PharmacyCrossIcon className="w-2.5 h-2.5" />
                </span>
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="sf-heading text-[16px] sm:text-[18px] font-extrabold text-[#0F172A] tracking-tight leading-tight truncate max-w-[155px] sm:max-w-[210px]"
                  data-testid="pharmacy-display-name"
                >
                  {displayName}
                </span>
                {showLicenseBadge && (
                  <span className="hidden xl:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold sf-badge-brand whitespace-nowrap">
                    <ShieldCheckIcon className="w-3 h-3" />
                    <span>Licensed</span>
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-[11.5px] text-[#64748B] truncate max-w-[210px]">
                {safeSubtitle}
              </p>
            </div>
          </button>

          {/* Center: Prominent E-Commerce Live Smart Search Bar (Desktop) */}
          <div className="hidden md:block flex-1 max-w-2xl">
            <SmartSearchBar
              value={searchQuery}
              onChange={onSearchChange}
              onSubmit={(q) => onSubmitSearch(q)}
              onSelectProduct={onOpenProductDetail}
              onQuickAdd={onQuickAddToCart}
              size="header"
              showShortcutHint
              testId={activeView !== "shop" ? "catalog-search-input" : "header-search-input"}
              placeholder={`Search medicines, salts (e.g. Paracetamol) at ${displayName}…`}
            />
          </div>

          {/* Right: Track Order + Cart Button + Mobile Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label="Toggle medicine search"
              className="md:hidden w-10 h-10 rounded-xl sf-btn-secondary flex items-center justify-center"
            >
              <SearchIcon className="w-4 h-4 text-[#0F172A]" />
            </button>

            <button
              type="button"
              onClick={() => onSelectView("track")}
              title="Track Order"
              className="hidden xl:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl sf-btn-secondary text-xs font-bold text-[#334155]"
            >
              <PackageTrackIcon className="w-4 h-4 sf-text-brand" />
              <span>Track Order</span>
            </button>

            <button
              type="button"
              onClick={onOpenCartDrawer}
              data-testid="header-cart-button"
              className="inline-flex items-center gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-xl sf-btn-primary text-xs font-bold whitespace-nowrap"
            >
              <ShoppingBagIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Cart</span>
              <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-white text-[#0F172A] text-[11px] font-extrabold inline-flex items-center justify-center tabular-nums">
                {cartTotalItems}
              </span>
              {cartSubtotalPkr > 0 && (
                <span className="hidden lg:inline font-bold border-l border-white/25 pl-2 tabular-nums">
                  PKR {cartSubtotalPkr.toLocaleString()}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden w-10 h-10 rounded-xl sf-btn-secondary flex items-center justify-center"
            >
              <MenuIcon className="w-5 h-5 text-[#0F172A]" />
            </button>
          </div>
        </div>

        {/* 3. Desktop Department & Store Navigation Bar (Classic Solid E-Commerce Structure) */}
        <nav
          aria-label="Primary Store Navigation"
          className="hidden lg:block bg-[#F8FAFC] border-t border-[#E2E8F0]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => onSelectView("home")}
                className={`px-3 h-8 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                  activeView === "home"
                    ? "bg-white text-[var(--sf-primary-ink)] border border-[#CBD5E1] shadow-2xs"
                    : "text-[#334155] hover:text-[#0F172A] hover:bg-white/70"
                }`}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory?.("all");
                  onSelectView("shop");
                }}
                className={`px-3 h-8 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                  (activeView === "shop" && selectedCategory === "all") || activeView === "product"
                    ? "bg-white text-[var(--sf-primary-ink)] border border-[#CBD5E1] shadow-2xs"
                    : "text-[#334155] hover:text-[#0F172A] hover:bg-white/70"
                }`}
              >
                All Medicines ({sf.published_products_count})
              </button>

              {topCategories.length > 0 && (
                <span className="h-4 w-px bg-[#CBD5E1] mx-1 shrink-0" aria-hidden="true" />
              )}

              {topCategories.map((cat) => {
                const isCatActive =
                  activeView === "shop" &&
                  selectedCategory.toLowerCase() === cat.name.toLowerCase();
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onSelectCategory?.(cat.name);
                      onSelectView("shop");
                    }}
                    className={`px-3 h-8 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      isCatActive
                        ? "bg-white text-[var(--sf-primary-ink)] border border-[#CBD5E1] font-bold shadow-2xs"
                        : "text-[#475569] hover:text-[#0F172A] hover:bg-white/70"
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {SECONDARY_LINKS.map((item) => {
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    className={`px-2.5 h-8 rounded-lg text-xs whitespace-nowrap transition ${
                      active
                        ? "font-bold sf-text-brand bg-white border border-[#CBD5E1]"
                        : "font-medium text-[#475569] hover:text-[#0F172A]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Mobile Expandable Smart Search Bar */}
        {mobileSearchOpen && (
          <div className="md:hidden border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <SmartSearchBar
              value={searchQuery}
              onChange={onSearchChange}
              onSubmit={(q) => {
                setMobileSearchOpen(false);
                onSubmitSearch(q);
              }}
              onSelectProduct={(prod) => {
                setMobileSearchOpen(false);
                onOpenProductDetail(prod);
              }}
              onQuickAdd={onQuickAddToCart}
              size="header"
              placeholder={`Search medicines or salts at ${displayName}…`}
            />
          </div>
        )}
      </header>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/55 flex justify-end lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="sf-drawer-enter w-full max-w-[320px] bg-white h-full shadow-2xl border-l border-[#E2E8F0] flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto">
              <div className="p-5 bg-[#0F172A] text-white flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="sf-heading text-base font-bold truncate">{displayName}</p>
                  <p className="text-xs text-slate-300 truncate">{sf.city}, Pakistan</p>
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
                {[
                  { id: "home" as StorefrontView, label: "Home" },
                  { id: "shop" as StorefrontView, label: "All Medicines Catalog" },
                  { id: "track" as StorefrontView, label: "Track Online Order" },
                  ...SECONDARY_LINKS,
                ].map((item) => {
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectView(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-3.5 h-11 rounded-xl text-sm text-left flex items-center justify-between transition ${
                        active
                          ? "bg-[var(--sf-primary-soft)] sf-text-brand font-bold"
                          : "text-[#0F172A] font-medium hover:bg-[#F1F5F9]"
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.id === "track" && <PackageTrackIcon className="w-4 h-4 opacity-75" />}
                    </button>
                  );
                })}

                {topCategories.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-[#E2E8F0] space-y-1">
                    <span className="px-3.5 text-[11px] font-bold uppercase tracking-wider text-[#64748B] block pb-1">
                      Departments
                    </span>
                    {topCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory?.(cat.name);
                          onSelectView("shop");
                          setMobileMenuOpen(false);
                        }}
                        className="w-full px-3.5 h-10 rounded-xl text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] text-left flex items-center justify-between"
                      >
                        <span className="truncate">{cat.name}</span>
                        {Number(cat.published_product_count || 0) > 0 && (
                          <span className="text-[11px] text-[#64748B] tabular-nums">
                            {cat.published_product_count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </nav>
            </div>

            <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-3 text-xs">
              {sf.address_line && (
                <div className="flex items-start gap-2 text-[#475569]">
                  <MapPinIcon className="w-4 h-4 shrink-0 mt-0.5 sf-text-brand" />
                  <span>
                    {sf.address_line}, {sf.city}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {sf.contact_phone && (
                  <a
                    href={`tel:${sf.contact_phone}`}
                    className="h-10 rounded-xl sf-btn-secondary inline-flex items-center justify-center gap-1.5 font-bold text-xs"
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
                    className="h-10 rounded-xl sf-btn-primary inline-flex items-center justify-center gap-1.5 font-bold text-xs"
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
