import React, { useEffect, useState } from "react";
import type {
  PublicStorefrontProduct,
  StorefrontBannerRecord,
  StorefrontBrandingRecord,
  StorefrontCategoryRecord,
  StorefrontPromotionRecord,
  StorefrontPublicContext,
  StorefrontSettingsRecord,
} from "../../shared/types";
import {
  EDITORIAL_MEDIA,
  resolveCategory3dIconUrl,
} from "../design/editorialAssets";
import { isMeaningfulCategory, sanitizePublicCopy } from "../design/theme";
import type { StorefrontView } from "../types-ui";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  PackageTrackIcon,
  PhoneIcon,
  PrescriptionIcon,
  ShieldCheckIcon,
  StoreIcon,
  TagIcon,
  TruckIcon,
  WhatsAppIcon,
} from "../components/Icons";
import { SmartSearchBar } from "../components/SmartSearchBar";

interface HomeViewProps {
  sf: StorefrontPublicContext;
  branding?: StorefrontBrandingRecord | null;
  settings?: Partial<StorefrontSettingsRecord> | Record<string, any> | null;
  displayName: string;
  categories: StorefrontCategoryRecord[];
  heroBanner?: StorefrontBannerRecord;
  secondaryBanners: StorefrontBannerRecord[];
  promotions: StorefrontPromotionRecord[];
  deliveryConfig: any;
  openingHours: Record<string, any>;
  homeProducts: PublicStorefrontProduct[];
  catalogSourceProducts?: PublicStorefrontProduct[];
  loadingProducts: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSubmitSearch: (q?: string) => void;
  onSelectCategory: (cat: string) => void;
  onSelectView: (view: StorefrontView) => void;
  onApplyPromoCode: (code: string) => void;
  onOpenProductDetail: (prod: PublicStorefrontProduct) => void;
  onQuickAddToCart: (prod: PublicStorefrontProduct) => void;
  onQuickTrackOrder?: (orderNumber: string) => void;
  renderProductCard: (prod: PublicStorefrontProduct) => React.ReactNode;
}

export function HomeView({
  sf,
  branding,
  displayName,
  categories,
  heroBanner,
  secondaryBanners,
  promotions,
  deliveryConfig,
  openingHours,
  homeProducts,
  loadingProducts,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  onSelectCategory,
  onSelectView,
  onApplyPromoCode,
  onOpenProductDetail,
  onQuickAddToCart,
  renderProductCard,
}: HomeViewProps) {
  const validCategories = categories.filter(isMeaningfulCategory);
  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  // Priority: Owner-uploaded pharmacy hero photo -> Active hero banner photo -> Clean Default Retail Pharmacy Photo
  const customHeroUrl =
    (branding as any)?.hero_banner_url ||
    branding?.hero_image_url ||
    heroBanner?.image_url ||
    null;

  const [heroImgSrc, setHeroImgSrc] = useState<string>(
    customHeroUrl || EDITORIAL_MEDIA.heroDesktopWebp
  );

  useEffect(() => {
    setHeroImgSrc(customHeroUrl || EDITORIAL_MEDIA.heroDesktopWebp);
  }, [customHeroUrl]);

  const rawHeroHeading = branding?.hero_title?.trim() || heroBanner?.title?.trim() || "";
  const isGenericSeededTitle =
    !rawHeroHeading ||
    /^genuine medicines & healthcare essentials delivered safely$/i.test(rawHeroHeading);

  const heroTitle = isGenericSeededTitle
    ? `Order Genuine Medicines Online from ${displayName}`
    : sanitizePublicCopy(
        rawHeroHeading,
        sf,
        `Order Genuine Medicines Online from ${displayName}`
      );

  const heroSubtitle = sanitizePublicCopy(
    branding?.hero_subtitle?.trim() || heroBanner?.subtitle?.trim(),
    sf,
    `Counter-verified medicines, prescriptions, surgical supplies, and healthcare essentials with live stock pricing in ${sf.city}.`
  );

  const deliveryEnabled = deliveryConfig?.delivery_enabled !== false;
  const pickupEnabled = deliveryConfig?.pickup_enabled !== false;
  const deliveryFeePkr = Number(deliveryConfig?.standard_delivery_fee_pkr ?? 150);
  const freeThresholdPkr = Number(deliveryConfig?.free_delivery_threshold_pkr ?? 2000);
  const estimatedMinutes = Number(deliveryConfig?.estimated_delivery_minutes ?? 45);
  const publishedCount = Number(sf.published_products_count || 0);

  const scheduleText = openingHours?.is_24_hours
    ? "Open 24 Hours"
    : openingHours?.mon_sat || "Mon–Sat: 09:00 AM – 11:00 PM";

  const quickDepartments = validCategories.slice(0, 4);

  return (
    <div className="sf-fade-up">
      {/* =================================================================== */}
      {/* 1. SOLID COMMERCIAL E-COMMERCE SPLIT HERO (ZERO OVERLAYS ON PHOTO)  */}
      {/* =================================================================== */}
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Column: Crisp Commercial Copy + Instant Smart Search + Solid CTAs */}
            <div className="lg:col-span-6 space-y-5 sm:space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold sf-badge-brand">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  <span>
                    {sf.drug_sale_license_no
                      ? `Licensed Pharmacy • Lic #${sf.drug_sale_license_no}`
                      : `Verified Local Pharmacy • ${sf.city}`}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-semibold text-[#334155]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span>{scheduleText}</span>
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="sf-heading text-[28px] sm:text-[38px] lg:text-[42px] font-extrabold text-[#0F172A] tracking-tight leading-[1.12]">
                  {heroTitle}
                </h1>
                <p className="text-sm sm:text-[15.5px] text-[#475569] leading-relaxed max-w-xl">
                  {heroSubtitle}
                </p>
              </div>

              {/* Hero Smart Search Bar with Instant Suggestions + Generic-Salt Alternatives */}
              <div className="space-y-2.5">
                <SmartSearchBar
                  value={searchQuery}
                  onChange={onSearchChange}
                  onSubmit={(q) => onSubmitSearch(q)}
                  onSelectProduct={onOpenProductDetail}
                  onQuickAdd={onQuickAddToCart}
                  size="hero"
                  placeholder="Type medicine name or generic salt (e.g. Paracetamol, Syrup)…"
                />

                {quickDepartments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-[#64748B] font-semibold mr-1">Popular:</span>
                    {quickDepartments.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory(cat.name);
                          onSelectView("shop");
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[var(--sf-primary-soft)] text-[#334155] hover:text-[var(--sf-primary-ink)] font-semibold transition"
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Solid Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory("all");
                    onSelectView("shop");
                  }}
                  className="h-11 sm:h-12 px-5 sm:px-6 rounded-xl sf-btn-primary text-sm font-bold inline-flex items-center gap-2"
                >
                  <span>Shop All Medicines</span>
                  {publishedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-white/20 text-xs font-extrabold tabular-nums">
                      {publishedCount}
                    </span>
                  )}
                  <ArrowRightIcon className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectView("track")}
                  className="h-11 sm:h-12 px-4 sm:px-5 rounded-xl sf-btn-secondary text-sm font-bold inline-flex items-center gap-2"
                >
                  <PackageTrackIcon className="w-4 h-4 sf-text-brand" />
                  <span>Track Order</span>
                </button>

                {whatsappDigits && (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 sm:h-12 px-4 rounded-xl bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#065F46] text-sm font-bold inline-flex items-center gap-2 transition"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    <span>Ask Pharmacist</span>
                  </a>
                )}
              </div>
            </div>

            {/* Right Column: Clean Full-Size Pharmacy Photograph (Owner-Replaceable, ZERO Overlays!) */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#F8FAFC] shadow-xs">
                <div className="aspect-[16/10] w-full bg-[#F1F5F9] overflow-hidden">
                  <img
                    src={heroImgSrc}
                    alt={`${displayName} retail pharmacy counter in ${sf.city}`}
                    loading="eager"
                    decoding="async"
                    onError={() => {
                      if (heroImgSrc !== EDITORIAL_MEDIA.heroDesktopWebp) {
                        setHeroImgSrc(EDITORIAL_MEDIA.heroDesktopWebp);
                      }
                    }}
                    data-testid="hero-pharmacy-photo"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Clean Solid Caption Strip Docked BELOW Photo (Not Overlaid!) */}
                <div className="px-4 py-3 bg-white border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 text-[#0F172A] font-bold">
                    <StoreIcon className="w-4 h-4 sf-text-brand shrink-0" />
                    <span className="truncate">
                      {displayName}
                      {sf.address_line ? ` — ${sf.address_line}, ${sf.city}` : ` — ${sf.city}`}
                    </span>
                  </div>
                  <span className="text-[#475569] font-semibold shrink-0 tabular-nums">
                    {publishedCount > 0 ? `${publishedCount} Items Live` : "Live POS Inventory"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. SOLID 4-PILLAR COMMERCIAL PHARMACY TRUST BAR                     */}
      {/* =================================================================== */}
      <section className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0 sf-text-brand">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                  100% Counter-Verified
                </p>
                <p className="text-[11.5px] text-[#64748B]">
                  Batch &amp; expiry checked directly from POS
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0 sf-text-brand">
                <TruckIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                  {deliveryEnabled
                    ? freeThresholdPkr > 0
                      ? `Free Delivery > PKR ${freeThresholdPkr.toLocaleString()}`
                      : `Fast Local Delivery`
                    : "Digital 80mm Receipts"}
                </p>
                <p className="text-[11.5px] text-[#64748B]">
                  {deliveryEnabled
                    ? `~${estimatedMinutes} min doorstep dispatch in ${sf.city}`
                    : "Instant downloadable pharmacy invoice"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0 sf-text-brand">
                <StoreIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                  {pickupEnabled ? "Free Counter Pickup" : "Exact Unit Billing"}
                </p>
                <p className="text-[11.5px] text-[#64748B]">
                  {pickupEnabled
                    ? "Reserve online & collect with PKR 0 fee"
                    : "Buy exact Box, Strip, or Tablet units"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0 sf-text-brand">
                <PrescriptionIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                  Same-Formula Search
                </p>
                <p className="text-[11.5px] text-[#64748B]">
                  Smart generic salt alternatives if out of stock
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. SHOP BY PHARMACY DEPARTMENT (SOLID E-COMMERCE CATEGORY CARDS)    */}
      {/* =================================================================== */}
      {validCategories.length > 0 && (
        <section className="bg-white border-b border-[#E2E8F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="sf-heading text-xl sm:text-2xl font-extrabold text-[#0F172A]">
                  Shop by Department
                </h2>
                <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                  Browse verified healthcare categories stocked at {displayName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory("all");
                  onSelectView("shop");
                }}
                className="text-xs sm:text-sm font-bold sf-text-brand hover:underline inline-flex items-center gap-1"
              >
                <span>View All Categories</span>
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
              {validCategories.slice(0, 6).map((cat) => {
                const count = Number(cat.published_product_count || 0);
                const iconUrl = cat.image_url || resolveCategory3dIconUrl(cat.name);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onSelectCategory(cat.name);
                      onSelectView("shop");
                    }}
                    className="sf-card-interactive rounded-2xl p-4 text-left flex flex-col justify-between gap-3 group"
                  >
                    <div className="w-16 h-16 rounded-xl bg-[#F8FAFC] border border-[#EDF2F7] p-2 flex items-center justify-center">
                      <img
                        src={iconUrl}
                        alt={cat.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <p className="sf-heading text-sm font-bold text-[#0F172A] group-hover:text-[var(--sf-primary-ink)] line-clamp-2 leading-snug transition-colors">
                        {cat.name}
                      </p>
                      <p className="text-[11.5px] font-medium text-[#64748B] tabular-nums">
                        {count > 0 ? `${count} products` : "Browse items"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 4. FEATURED & POPULAR MEDICINES GRID (SOLID 4-COLUMN E-COMMERCE)    */}
      {/* =================================================================== */}
      <section className="bg-[#F5F7F9] border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="sf-heading text-xl sm:text-2xl font-extrabold text-[#0F172A]">
                Popular Medicines &amp; Healthcare Supplies
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                Live POS pricing — choose Box, Strip, Bottle, or Pack directly on each item
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectCategory("all");
                onSelectView("shop");
              }}
              className="h-10 px-4 rounded-xl sf-btn-secondary text-xs sm:text-[13px] font-bold inline-flex items-center gap-1.5"
            >
              <span>Browse Full Catalog</span>
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingProducts && homeProducts.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden animate-pulse"
                >
                  <div className="h-8 bg-[#F8FAFC]" />
                  <div className="aspect-[4/3] bg-[#F1F5F9]" />
                  <div className="p-4 space-y-2.5">
                    <div className="h-3 w-20 bg-[#E2E8F0] rounded" />
                    <div className="h-4 w-3/4 bg-[#E2E8F0] rounded" />
                    <div className="h-9 w-full bg-[#E2E8F0] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : homeProducts.length === 0 ? (
            <div className="sf-card rounded-2xl p-10 text-center space-y-2">
              <p className="sf-heading text-base font-bold text-[#0F172A]">
                Catalog Products Are Being Prepared
              </p>
              <p className="text-sm text-[#64748B] max-w-md mx-auto">
                Published medicines from {displayName}&rsquo;s counter will appear here automatically.
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5"
              data-testid="public-product-grid"
            >
              {homeProducts.map((prod) => renderProductCard(prod))}
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. ACTIVE PHARMACY OFFERS (SOLID RETAIL DISCOUNT CARDS)             */}
      {/* =================================================================== */}
      {(promotions.length > 0 || secondaryBanners.length > 0) && (
        <section className="bg-white border-b border-[#E2E8F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-5">
            <h2 className="sf-heading text-xl sm:text-2xl font-extrabold text-[#0F172A]">
              Active Pharmacy Offers
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {promotions.slice(0, 2).map((promo) => {
                const discountNum = Number(promo.discount_value || 0);
                const minOrder = Number(promo.min_order_pkr || 0);
                const pType = (promo as any).promotion_type || promo.promo_type;
                const offerLabel =
                  pType === "percentage" && discountNum > 0
                    ? `${discountNum}% OFF`
                    : pType === "fixed_amount" && discountNum > 0
                      ? `PKR ${discountNum.toLocaleString()} OFF`
                      : promo.badge_text || "Special Offer";

                return (
                  <div
                    key={promo.id}
                    className="rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-5 sm:p-6 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold sf-badge-brand">
                          <TagIcon className="w-3.5 h-3.5" />
                          <span>{offerLabel}</span>
                        </span>
                        {minOrder > 0 && (
                          <span className="text-xs font-semibold text-[#64748B]">
                            Min. order PKR {minOrder.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <h3 className="sf-heading text-lg font-extrabold text-[#0F172A]">
                        {promo.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
                        {promo.description ||
                          `Save on eligible online medicine orders placed at ${displayName}.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0]">
                      {promo.code ? (
                        <div className="inline-flex items-center gap-2 text-xs">
                          <span className="text-[#64748B] font-semibold">Code:</span>
                          <code className="px-2.5 py-1 rounded-lg bg-white border border-[#CBD5E1] font-mono font-extrabold text-[#0F172A]">
                            {promo.code}
                          </code>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[#475569]">
                          Applied automatically at checkout
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (promo.code) onApplyPromoCode(promo.code);
                          onSelectView("shop");
                        }}
                        className="h-9 px-4 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <span>{promo.code ? `Apply ${promo.code}` : "Shop Offer"}</span>
                        <ArrowRightIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {secondaryBanners.slice(0, 2).map((ban) => (
                <div
                  key={ban.id}
                  className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    {ban.badge_text && (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold sf-badge-brand">
                        {sanitizePublicCopy(ban.badge_text, sf, "Featured")}
                      </span>
                    )}
                    <h3 className="sf-heading text-base font-bold text-[#0F172A]">{ban.title}</h3>
                    {ban.subtitle && <p className="text-xs text-[#64748B]">{ban.subtitle}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectView("shop")}
                    className="h-9 px-4 rounded-xl sf-btn-primary text-xs font-bold shrink-0"
                  >
                    {ban.cta_label || "Shop Now"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 6. VISUAL PHARMACY SERVICES SHOWCASE (AUTHENTIC COMMERCIAL PHOTOS)  */}
      {/* =================================================================== */}
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Service Card 1: Fast Doorstep Delivery & Pickup */}
            <div className="sf-card rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-[16/10] w-full bg-[#F1F5F9] overflow-hidden border-b border-[#E2E8F0]">
                <img
                  src={EDITORIAL_MEDIA.careParcelWebp}
                  alt={`Home medicine delivery parcel from ${displayName}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider sf-text-brand">
                    Local Delivery &amp; Counter Pickup
                  </span>
                  <h3 className="sf-heading text-lg sm:text-xl font-extrabold text-[#0F172A]">
                    Fast, Sealed Medicine Delivery Across {sf.city}
                  </h3>
                  <p className="text-sm text-[#475569] leading-relaxed">
                    {deliveryEnabled
                      ? `Standard doorstep delivery is PKR ${deliveryFeePkr.toLocaleString()}${
                          freeThresholdPkr > 0
                            ? ` (FREE on orders over PKR ${freeThresholdPkr.toLocaleString()})`
                            : ""
                        }, or reserve online for zero-fee counter pickup with an official 80mm receipt.`
                      : `Reserve your medicines online and collect directly from ${displayName}'s counter with zero waiting and an official 80mm receipt.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectView("delivery")}
                    className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <span>View Delivery Zones &amp; Fees</span>
                    <ChevronRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Service Card 2: Licensed Pharmacist Care & Rx Verification */}
            <div className="sf-card rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-[16/10] w-full bg-[#F1F5F9] overflow-hidden border-b border-[#E2E8F0]">
                <img
                  src={EDITORIAL_MEDIA.dispensingDeskWebp}
                  alt={`Pharmacist prescription verification at ${displayName}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider sf-text-brand">
                    Pharmacist Care &amp; Prescription Desk
                  </span>
                  <h3 className="sf-heading text-lg sm:text-xl font-extrabold text-[#0F172A]">
                    Need Help Finding a Medicine or Generic Substitute?
                  </h3>
                  <p className="text-sm text-[#475569] leading-relaxed">
                    {sf.pharmacist_name
                      ? `Supervised by pharmacist ${sf.pharmacist_name}. Contact our counter directly for prescription checks, dosage strengths, or equivalent generic options.`
                      : `Speak directly with our pharmacy counter team for prescription verification, exact strength guidance, or approved same-formula alternatives.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {whatsappDigits && (
                    <a
                      href={`https://wa.me/${whatsappDigits}`}
                      target="_blank"
                      rel="noreferrer"
                      className="h-10 px-4 rounded-xl sf-btn-primary text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <WhatsAppIcon className="w-4 h-4" />
                      <span>WhatsApp Pharmacist</span>
                    </a>
                  )}
                  {sf.contact_phone && (
                    <a
                      href={`tel:${sf.contact_phone}`}
                      className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5 tabular-nums"
                    >
                      <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
                      <span>{sf.contact_phone}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Wide Healthcare & Wellness Feature Banner */}
          <div className="sf-card rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center">
            <div className="lg:col-span-6 p-6 sm:p-8 lg:p-10 space-y-4">
              <span className="text-[11px] font-extrabold uppercase tracking-wider sf-text-brand block">
                Everyday Wellness &amp; Home Diagnostics
              </span>
              <h2 className="sf-heading text-2xl sm:text-[28px] font-extrabold text-[#0F172A] leading-tight">
                Vitamins, First Aid, Baby Care &amp; Medical Devices — All in One Cart
              </h2>
              <p className="text-sm text-[#475569] leading-relaxed">
                From daily multivitamins and thermometers to surgical supplies and chronic care
                refills, every item is fulfilled straight from {displayName}&rsquo;s temperature-managed
                shelves.
              </p>
              <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs font-semibold text-[#334155]">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Sealed Factory Packs</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Transparent PKR Pricing</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Cash on Delivery &amp; Pickup</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Official 80mm PDF Bill</span>
                </span>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory("all");
                    onSelectView("shop");
                  }}
                  className="h-11 px-5 rounded-xl sf-btn-primary text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                >
                  <span>Explore Complete Catalog</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="lg:col-span-6 h-full bg-[#F1F5F9] border-t lg:border-t-0 lg:border-l border-[#E2E8F0]">
              <img
                src={EDITORIAL_MEDIA.wellnessEssentialsWebp}
                alt={`Healthcare devices, vitamins, and first aid essentials at ${displayName}`}
                loading="lazy"
                decoding="async"
                className="w-full h-full min-h-[240px] max-h-[380px] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 7. PHARMACY COUNTER INFO & HOURS BAR                                */}
      {/* =================================================================== */}
      <section className="bg-[#F5F7F9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="sf-card rounded-2xl p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#0F172A]">
                Visit or Contact {displayName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-[#475569]">
                {sf.address_line && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon className="w-4 h-4 sf-text-brand shrink-0" />
                    <span>
                      {sf.address_line}, {sf.city}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="w-4 h-4 sf-text-brand shrink-0" />
                  <span>{scheduleText}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onSelectView("branches")}
                className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold"
              >
                Counter Location &amp; Hours
              </button>
              <button
                type="button"
                onClick={() => onSelectView("contact")}
                className="h-10 px-4 rounded-xl sf-btn-primary text-xs font-bold"
              >
                Contact Pharmacy
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
