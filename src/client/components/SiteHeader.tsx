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
  hasDoctors?: boolean;
  hasCustomServices?: boolean;
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
  hasDoctors = false,
  hasCustomServices = false,
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
  const announcementEnabled = Number(settings?.announcement_bar_enabled ?? 1) === 1;
  const announcementText = sanitizePublicCopy(
    settings?.announcement_bar_text,
    sf,
    `Genuine medicines from ${displayName} (${sf.city}) — Home delivery & free counter pickup`
  );

  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");
  const topCategories = categories.filter(isMeaningfulCategory).slice(0, 5);

  return (
    <>
      {/* Tier 1: Slim Commercial Utility Strip */}
      {announcementEnabled && (
        <div className="bg-[#0B1220] text-[#D1D5DB] text-[11.5px] border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--sf-primary)" }}
              />
              <p className="truncate font-medium">{announcementText}</p>
            </div>
            <div className="hidden sm:flex items-center gap-4 shrink-0">
              {hasVerifiedLicense && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-300">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  <span>Lic: {sf.drug_sale_license_no}</span>
                </span>
              )}
              {sf.contact_phone && (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="hidden md:inline-flex items-center gap-1 text-[#D1D5DB] hover:text-white transition"
                >
                  <PhoneIcon className="w-3 h-3 text-emerald-400" />
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
                  <WhatsAppIcon className="w-3 h-3" />
                  <span>Pharmacist WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onSelectView("track")}
                className="inline-flex items-center gap-1 text-white hover:text-emerald-300 font-semibold transition whitespace-nowrap"
              >
                <PackageTrackIcon className="w-3 h-3" />
                <span>Track Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tier 2: Flagship Pure-White Sticky E-Commerce Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] shadow-[0_1px_3px_rgba(17,24,39,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[68px] flex items-center justify-between gap-3 lg:gap-6">
          {/* Brand Identity */}
          <button
            type="button"
            onClick={() => onSelectView("home")}
            className="flex items-center gap-2.5 min-w-0 text-left shrink-0 group"
          >
            {branding?.logo_url && !logoFailed ? (
              <div className="w-10 h-10 rounded-lg border border-[#E5E7EB] bg-white p-1 flex items-center justify-center shrink-0">
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
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 relative text-white"
                style={{ backgroundColor: "var(--sf-primary)" }}
              >
                <span className="text-sm font-extrabold tracking-tight sf-heading">
                  {getPharmacyMonogram(displayName)}
                </span>
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded bg-[#111827] text-white flex items-center justify-center border border-white">
                  <PharmacyCrossIcon className="w-2.5 h-2.5" />
                </span>
              </div>
            )}

            <div className="min-w-0">
              <span
                className="sf-heading block text-[16px] sm:text-[18px] font-extrabold text-[#111827] tracking-tight leading-tight truncate max-w-[155px] sm:max-w-[200px]"
                data-testid="pharmacy-display-name"
              >
                {displayName}
              </span>
              <span className="hidden sm:block text-[11px] font-medium text-[#6B7280] truncate max-w-[200px]">
                {sf.city} • Licensed Pharmacy
              </span>
            </div>
          </button>

          {/* Authoritative Wide E-Commerce Search Bar (Single Primary Search Input) */}
          <div className="hidden md:block flex-1 max-w-2xl">
            <SmartSearchBar
              value={searchQuery}
              onChange={onSearchChange}
              onSubmit={(q) => onSubmitSearch(q)}
              onSelectProduct={onOpenProductDetail}
              onQuickAdd={onQuickAddToCart}
              size="header"
              showShortcutHint
              showSubmitButton
              testId={activeView !== "shop" ? "catalog-search-input" : "header-search-input"}
              placeholder={`Search medicines, generic salts (e.g. Panadol, Paracetamol)…`}
            />
          </div>

          {/* Right Commerce Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label="Toggle medicine search"
              className="md:hidden w-10 h-10 rounded-lg sf-btn-secondary flex items-center justify-center"
            >
              <SearchIcon className="w-4 h-4 text-[#111827]" />
            </button>

            <button
              type="button"
              onClick={() => onSelectView("track")}
              title="Track Order"
              className="hidden xl:inline-flex items-center gap-1.5 h-10 px-3 rounded-lg sf-btn-secondary text-xs font-semibold text-[#374151]"
            >
              <PackageTrackIcon className="w-4 h-4 sf-text-brand" />
              <span>Track Order</span>
            </button>

            <button
              type="button"
              onClick={onOpenCartDrawer}
              data-testid="header-cart-button"
              className="inline-flex items-center gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-lg sf-btn-primary text-xs font-bold whitespace-nowrap"
            >
              <ShoppingBagIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Cart</span>
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-white text-[#111827] text-[11px] font-extrabold inline-flex items-center justify-center tabular-nums">
                {cartTotalItems}
              </span>
              {cartSubtotalPkr > 0 && (
                <span className="hidden lg:inline font-bold border-l border-white/25 pl-2 tabular-nums">
                  Rs. {cartSubtotalPkr.toLocaleString()}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden w-10 h-10 rounded-lg sf-btn-secondary flex items-center justify-center"
            >
              <MenuIcon className="w-5 h-5 text-[#111827]" />
            </button>
          </div>
        </div>

        {/* Tier 3: Clean Retail Department Navigation Bar (Underline Active State) */}
        <nav
          aria-label="Primary Store Navigation"
          className="hidden lg:block bg-white border-t border-[#F3F4F6]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 overflow-x-auto no-scrollbar h-full">
              <button
                type="button"
                onClick={() => onSelectView("home")}
                className={`h-full inline-flex items-center text-xs font-bold whitespace-nowrap border-b-2 transition ${
                  activeView === "home"
                    ? "border-[var(--sf-primary)] text-[var(--sf-primary-ink)]"
                    : "border-transparent text-[#374151] hover:text-[#111827]"
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
                className={`h-full inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap border-b-2 transition ${
                  (activeView === "shop" && selectedCategory === "all") || activeView === "product"
                    ? "border-[var(--sf-primary)] text-[var(--sf-primary-ink)]"
                    : "border-transparent text-[#374151] hover:text-[#111827]"
                }`}
              >
                <span>All Medicines</span>
                {sf.published_products_count > 0 && (
                  <span className="text-[11px] font-semibold text-[#6B7280] tabular-nums">
                    ({sf.published_products_count})
                  </span>
                )}
              </button>

              {topCategories.length > 0 && (
                <span className="h-3.5 w-px bg-[#E5E7EB] shrink-0" aria-hidden="true" />
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
                    className={`h-full inline-flex items-center text-xs whitespace-nowrap border-b-2 transition ${
                      isCatActive
                        ? "border-[var(--sf-primary)] text-[var(--sf-primary-ink)] font-bold"
                        : "border-transparent text-[#4B5563] hover:text-[#111827] font-medium"
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 shrink-0 h-full">
              {hasDoctors && (
                <button
                  type="button"
                  onClick={() => onSelectView("doctors")}
                  className={`h-full inline-flex items-center text-xs font-bold whitespace-nowrap border-b-2 transition ${
                    activeView === "doctors"
                      ? "border-[var(--sf-primary)] text-[var(--sf-primary-ink)]"
                      : "border-transparent text-emerald-700 hover:text-emerald-800"
                  }`}
                >
                  Doctors
                </button>
              )}
              {hasCustomServices && (
                <button
                  type="button"
                  onClick={() => onSelectView("services")}
                  className={`h-full inline-flex items-center text-xs font-bold whitespace-nowrap border-b-2 transition ${
                    activeView === "services"
                      ? "border-[var(--sf-primary)] text-[var(--sf-primary-ink)]"
                      : "border-transparent text-sky-700 hover:text-sky-800"
                  }`}
                >
                  Lab &amp; Services
                </button>
              )}
              {SECONDARY_LINKS.map((item) => {
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    className={`h-full inline-flex items-center text-xs whitespace-nowrap border-b-2 transition ${
                      active
                        ? "border-[var(--sf-primary)] text-[var(--sf-primary-ink)] font-bold"
                        : "border-transparent font-medium text-[#4B5563] hover:text-[#111827]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Mobile Always-Accessible Search Row */}
        <div className="md:hidden border-t border-[#F3F4F6] bg-white px-4 py-2.5">
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
            placeholder={`Search medicines or salts…`}
          />
        </div>

        {/* Keep mobileSearchOpen clean if toggled */}
        {mobileSearchOpen && null}
      </header>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1220]/55 flex justify-end lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="sf-drawer-enter w-full max-w-[310px] bg-white h-full shadow-2xl border-l border-[#E5E7EB] flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto">
              <div className="p-4 bg-[#0B1220] text-white flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="sf-heading text-base font-bold truncate">{displayName}</p>
                  <p className="text-xs text-slate-300 truncate">{sf.city}, Pakistan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>

              <nav className="p-3 space-y-0.5" aria-label="Mobile Navigation">
                {[
                  { id: "home" as StorefrontView, label: "Home" },
                  { id: "shop" as StorefrontView, label: "All Medicines Catalog" },
                  ...(hasDoctors ? [{ id: "doctors" as StorefrontView, label: "Clinic & Doctors" }] : []),
                  ...(hasCustomServices
                    ? [{ id: "services" as StorefrontView, label: "Lab Tests & Services" }]
                    : []),
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
                      className={`w-full px-3 h-10 rounded-lg text-sm text-left flex items-center justify-between transition ${
                        active
                          ? "bg-[var(--sf-primary-soft)] sf-text-brand font-bold"
                          : "text-[#111827] font-medium hover:bg-[#F3F4F6]"
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.id === "track" && <PackageTrackIcon className="w-4 h-4 opacity-75" />}
                    </button>
                  );
                })}

                {topCategories.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-[#E5E7EB] space-y-0.5">
                    <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block pb-1">
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
                        className="w-full px-3 h-9 rounded-lg text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] text-left flex items-center justify-between"
                      >
                        <span className="truncate">{cat.name}</span>
                        {Number(cat.published_product_count || 0) > 0 && (
                          <span className="text-[11px] text-[#6B7280] tabular-nums">
                            {cat.published_product_count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </nav>
            </div>

            <div className="p-4 border-t border-[#E5E7EB] bg-[#F9FAFB] space-y-3 text-xs">
              {sf.address_line && (
                <div className="flex items-start gap-2 text-[#4B5563]">
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
                    className="h-9 rounded-lg sf-btn-secondary inline-flex items-center justify-center gap-1.5 font-bold text-xs"
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
                    className="h-9 rounded-lg sf-btn-primary inline-flex items-center justify-center gap-1.5 font-bold text-xs"
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
