import React, { useEffect, useMemo, useState } from "react";
import type {
  PublicStorefrontProduct,
  StorefrontBannerRecord,
  StorefrontBrandingRecord,
  StorefrontCategoryRecord,
  StorefrontCustomServiceRecord,
  StorefrontDoctorRecord,
  StorefrontPromotionRecord,
  StorefrontPublicContext,
  StorefrontReviewRecord,
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
  ChevronRightIcon,
  ClockIcon,
  HealthConcernIcon,
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
  reviews?: StorefrontReviewRecord[];
  reviewsSummary?: { count: number; average_rating: number };
  doctors?: StorefrontDoctorRecord[];
  customServices?: StorefrontCustomServiceRecord[];
  renderProductCard: (prod: PublicStorefrontProduct) => React.ReactNode;
}

const HEALTH_CONCERNS: Array<{
  label: string;
  sub: string;
  query: string;
  kind: "fever" | "cough" | "stomach" | "allergy" | "diabetes" | "heart" | "vitamins" | "antibiotics";
}> = [
  { label: "Fever & Pain", sub: "Paracetamol, Relief", query: "paracetamol", kind: "fever" },
  { label: "Cough & Cold", sub: "Syrups, Chest Care", query: "cough", kind: "cough" },
  { label: "Stomach Care", sub: "Acidity, Digestion", query: "omeprazole", kind: "stomach" },
  { label: "Allergy Relief", sub: "Antihistamines", query: "cetirizine", kind: "allergy" },
  { label: "Diabetes Care", sub: "Sugar Control", query: "metformin", kind: "diabetes" },
  { label: "Heart & BP", sub: "Daily Cardiac Care", query: "amlodipine", kind: "heart" },
  { label: "Vitamins & Iron", sub: "Supplements", query: "vitamin", kind: "vitamins" },
  { label: "Antibiotics", sub: "Rx Infections", query: "amoxicillin", kind: "antibiotics" },
];

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
  catalogSourceProducts,
  loadingProducts,
  onSearchChange,
  onSubmitSearch,
  onSelectCategory,
  onSelectView,
  onApplyPromoCode,
  reviews = [],
  reviewsSummary = { count: 0, average_rating: 0 },
  doctors = [],
  customServices = [],
  renderProductCard,
}: HomeViewProps) {
  const validCategories = categories.filter(isMeaningfulCategory);
  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");

  const customHeroUrl =
    (branding as any)?.hero_banner_url ||
    branding?.hero_image_url ||
    heroBanner?.image_url ||
    null;

  const [heroImgSrc, setHeroImgSrc] = useState<string>(
    customHeroUrl || EDITORIAL_MEDIA.heroDesktopWebp
  );
  const [featuredTab, setFeaturedTab] = useState<string>("all");

  useEffect(() => {
    setHeroImgSrc(customHeroUrl || EDITORIAL_MEDIA.heroDesktopWebp);
  }, [customHeroUrl]);

  const rawHeroHeading = branding?.hero_title?.trim() || heroBanner?.title?.trim() || "";
  const isGenericSeededTitle =
    !rawHeroHeading ||
    /^genuine medicines & healthcare essentials delivered safely$/i.test(rawHeroHeading);

  const heroTitle = isGenericSeededTitle
    ? `Genuine Medicines Delivered Across ${sf.city}`
    : sanitizePublicCopy(
        rawHeroHeading,
        sf,
        `Genuine Medicines Delivered Across ${sf.city}`
      );

  const heroSubtitle = sanitizePublicCopy(
    branding?.hero_subtitle?.trim() || heroBanner?.subtitle?.trim(),
    sf,
    `Live counter stock, batch-verified medicines, and zero-fee pickup directly from ${displayName}.`
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

  const quickTabs = validCategories.slice(0, 3);
  const sourcePool =
    catalogSourceProducts && catalogSourceProducts.length > 0
      ? catalogSourceProducts
      : homeProducts;

  const displayedHomeProducts = useMemo(() => {
    if (featuredTab === "all") return homeProducts.slice(0, 10);
    const filtered = sourcePool.filter(
      (p) => (p.category_name || "").toLowerCase() === featuredTab.toLowerCase()
    );
    return (filtered.length > 0 ? filtered : homeProducts).slice(0, 10);
  }, [featuredTab, homeProducts, sourcePool]);

  const rxWhatsAppUrl = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
        `Assalam-o-Alaikum ${displayName}, I would like to share my prescription to order medicines.`
      )}`
    : null;

  return (
    <div className="sf-fade-up bg-[#F6F7F9]">
      {/* =================================================================== */}
      {/* 1. FLAGSHIP RETAIL MERCHANDISING HERO (8+4 ASYMMETRIC COMMERCE GRID) */}
      {/* =================================================================== */}
      <section className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Primary 8-Column Full-Bleed Editorial Retail Banner */}
            <div className="lg:col-span-8 relative rounded-xl overflow-hidden bg-[#0B1220] border border-[#E5E7EB] min-h-[270px] sm:min-h-[340px] lg:min-h-[360px] flex items-end sm:items-center">
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
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
              {/* Crisp Directional Editorial Contrast Scrim (Left readable, Right bright store photo) */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(95deg, rgba(11,18,32,0.92) 0%, rgba(11,18,32,0.78) 44%, rgba(11,18,32,0.18) 100%)",
                }}
              />

              <div className="relative z-10 p-5 sm:p-8 lg:p-10 max-w-lg space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                  {displayName} · {sf.city}
                  {sf.drug_sale_license_no ? ` · Lic #${sf.drug_sale_license_no}` : ""}
                </p>

                <h1 className="sf-heading text-[24px] sm:text-[32px] lg:text-[36px] font-extrabold text-white tracking-tight leading-[1.12]">
                  {heroTitle}
                </h1>

                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-md">
                  {heroSubtitle}
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCategory("all");
                      onSelectView("shop");
                    }}
                    className="h-10 sm:h-11 px-5 rounded-lg sf-btn-primary text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                  >
                    <span>Shop Medicines</span>
                    {publishedCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-black/20 text-[11px] font-bold tabular-nums">
                        {publishedCount}
                      </span>
                    )}
                    <ArrowRightIcon className="w-4 h-4" />
                  </button>

                  {rxWhatsAppUrl && (
                    <a
                      href={rxWhatsAppUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="h-10 sm:h-11 px-4 rounded-lg bg-white/12 hover:bg-white/20 border border-white/25 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition"
                    >
                      <WhatsAppIcon className="w-4 h-4 text-emerald-300" />
                      <span>Order via Prescription</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right 4-Column Stacked Retail Action Tiles */}
            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              {/* Tile 1: Prescription Desk */}
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider sf-text-brand block">
                    Pharmacist Care Desk
                  </span>
                  <h2 className="sf-heading text-base font-extrabold text-[#111827] leading-snug">
                    Have a Doctor&apos;s Prescription?
                  </h2>
                  <p className="text-xs text-[#4B5563] leading-relaxed">
                    Send a photo on WhatsApp for quick billing &amp; exact generic substitutes.
                  </p>
                  <div className="pt-1">
                    {rxWhatsAppUrl ? (
                      <a
                        href={rxWhatsAppUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold sf-text-brand hover:underline"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>Send Prescription Now</span>
                        <ChevronRightIcon className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectView("contact")}
                        className="inline-flex items-center gap-1 text-xs font-bold sf-text-brand hover:underline"
                      >
                        <span>Contact Counter</span>
                        <ChevronRightIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-[#E5E7EB] bg-white shrink-0">
                  <img
                    src={EDITORIAL_MEDIA.dispensingDeskWebp}
                    alt="Pharmacist prescription help"
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Tile 2: Express Delivery & Track Order */}
              <div className="rounded-xl bg-[#0B1220] text-white border border-[#1F2937] p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-400 block">
                    {deliveryEnabled
                      ? freeThresholdPkr > 0
                        ? `Free Delivery > Rs. ${freeThresholdPkr.toLocaleString()}`
                        : "Fast Doorstep Delivery"
                      : "Counter Pickup"}
                  </span>
                  <h2 className="sf-heading text-base font-extrabold text-white leading-snug">
                    {deliveryEnabled
                      ? `~${estimatedMinutes} Min Dispatch in ${sf.city}`
                      : `Zero-Fee Pickup at ${displayName}`}
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {deliveryEnabled
                      ? `Standard delivery Rs. ${deliveryFeePkr.toLocaleString()} or free counter pickup.`
                      : "Reserve medicines online and collect with official 80mm receipt."}
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => onSelectView("track")}
                      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 hover:text-emerald-200 transition"
                    >
                      <PackageTrackIcon className="w-3.5 h-3.5" />
                      <span>Track Order</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectView("delivery")}
                      className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-300 hover:text-white transition"
                    >
                      <span>Delivery Info</span>
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-white/15 bg-slate-900 shrink-0">
                  <img
                    src={EDITORIAL_MEDIA.careParcelWebp}
                    alt="Express local pharmacy delivery"
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hairline Commercial Trust Strip */}
        <div className="border-t border-[#F3F4F6] bg-[#FAFAFB]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldCheckIcon className="w-4 h-4 sf-text-brand shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold text-[#111827] block truncate">100% Genuine Stock</span>
                  <span className="text-[11px] text-[#6B7280] block truncate">Batch &amp; expiry verified</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <TruckIcon className="w-4 h-4 sf-text-brand shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold text-[#111827] block truncate">
                    {deliveryEnabled ? `Express Delivery` : `Digital Receipt`}
                  </span>
                  <span className="text-[11px] text-[#6B7280] block truncate">
                    {deliveryEnabled ? `~${estimatedMinutes} min in ${sf.city}` : `Official 80mm PDF bill`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <StoreIcon className="w-4 h-4 sf-text-brand shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold text-[#111827] block truncate">
                    {pickupEnabled ? "Free Counter Pickup" : "Flexible Pack Units"}
                  </span>
                  <span className="text-[11px] text-[#6B7280] block truncate">
                    {pickupEnabled ? "Rs. 0 fee · Ready fast" : "Box, strip, or single unit"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <PrescriptionIcon className="w-4 h-4 sf-text-brand shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold text-[#111827] block truncate">Generic Salt Match</span>
                  <span className="text-[11px] text-[#6B7280] block truncate">Smart in-stock substitutes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. SHOP BY DEPARTMENT (CRISP RETAIL CATEGORY TILES)                 */}
      {/* =================================================================== */}
      {validCategories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
          <div className="flex items-end justify-between gap-4 mb-4">
            <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
              Shop by Department
            </h2>
            <button
              type="button"
              onClick={() => {
                onSelectCategory("all");
                onSelectView("shop");
              }}
              className="text-xs font-bold sf-text-brand hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              <span>All Departments</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
                  className="bg-white rounded-xl border border-[#E5E7EB] hover:border-[var(--sf-primary)] p-3.5 text-left flex items-center lg:flex-col lg:items-start gap-3 transition group"
                >
                  <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-lg bg-[#F6F7F9] p-1.5 flex items-center justify-center shrink-0">
                    <img
                      src={iconUrl}
                      alt={cat.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="sf-heading text-xs sm:text-[13px] font-bold text-[#111827] group-hover:text-[var(--sf-primary-ink)] line-clamp-2 leading-snug transition-colors">
                      {cat.name}
                    </p>
                    <p className="text-[11px] text-[#6B7280] tabular-nums mt-0.5">
                      {count > 0 ? `${count} items` : "Shop now"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 3. POPULAR MEDICINES (DENSE 2-COL MOBILE / 5-COL DESKTOP COMMERCE)  */}
      {/* =================================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
              Popular Medicines &amp; Essentials
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Live POS counter stock &amp; transparent PKR pricing
            </p>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setFeaturedTab("all")}
              className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                featuredTab === "all"
                  ? "bg-[#111827] text-white"
                  : "bg-white text-[#4B5563] border border-[#E5E7EB] hover:border-[#D1D5DB]"
              }`}
            >
              All Popular
            </button>
            {quickTabs.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFeaturedTab(cat.name)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  featuredTab === cat.name
                    ? "bg-[#111827] text-white font-bold"
                    : "bg-white text-[#4B5563] border border-[#E5E7EB] hover:border-[#D1D5DB]"
                }`}
              >
                {cat.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onSelectCategory("all");
                onSelectView("shop");
              }}
              className="h-8 px-3 rounded-lg sf-btn-soft text-xs font-bold whitespace-nowrap inline-flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRightIcon className="w-3 h-3" />
            </button>
          </div>
        </div>

        {loadingProducts && displayedHomeProducts.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <div
                key={n}
                className="rounded-xl bg-white border border-[#E5E7EB] overflow-hidden animate-pulse"
              >
                <div className="h-[175px] bg-[#F3F4F6]" />
                <div className="p-3.5 space-y-2">
                  <div className="h-2.5 w-16 bg-[#E5E7EB] rounded" />
                  <div className="h-4 w-4/5 bg-[#E5E7EB] rounded" />
                  <div className="h-9 w-full bg-[#E5E7EB] rounded-lg mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedHomeProducts.length === 0 ? (
          <div className="sf-card rounded-xl p-10 text-center space-y-2">
            <p className="sf-heading text-base font-bold text-[#111827]">
              Catalog Products Are Syncing
            </p>
            <p className="text-xs sm:text-sm text-[#6B7280] max-w-md mx-auto">
              Published medicines from {displayName}&rsquo;s counter will appear here automatically.
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
            data-testid="public-product-grid"
          >
            {displayedHomeProducts.map((prod) => renderProductCard(prod))}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 4. SHOP BY HEALTH CONCERN (CLEAN CLINICAL SVG VECTOR TILES)         */}
      {/* =================================================================== */}
      <section className="bg-white border-y border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
                Shop by Health Concern
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Quick symptom &amp; generic formula lookup across live pharmacy inventory
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3">
            {HEALTH_CONCERNS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onSearchChange(item.query);
                  onSubmitSearch(item.query);
                }}
                className="rounded-xl bg-[#FAFAFB] hover:bg-white border border-[#E5E7EB] hover:border-[var(--sf-primary)] p-3.5 text-left flex flex-col items-start gap-2.5 transition group"
              >
                <div className="w-9 h-9 rounded-lg sf-badge-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                  <HealthConcernIcon kind={item.kind} className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 w-full">
                  <p className="sf-heading text-xs font-bold text-[#111827] group-hover:text-[var(--sf-primary-ink)] truncate">
                    {item.label}
                  </p>
                  <p className="text-[10.5px] text-[#6B7280] truncate">{item.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. ACTIVE PHARMACY OFFERS (SHOWN ONLY IF PROMOS / BANNERS EXIST)    */}
      {/* =================================================================== */}
      {(promotions.length > 0 || secondaryBanners.length > 0) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
          <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
            Pharmacy Offers &amp; Savings
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
                    ? `Rs. ${discountNum.toLocaleString()} OFF`
                    : promo.badge_text || "Special Offer";

              return (
                <div
                  key={promo.id}
                  className="bg-white rounded-xl border border-[#E5E7EB] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold sf-badge-brand">
                        <TagIcon className="w-3 h-3" />
                        <span>{offerLabel}</span>
                      </span>
                      {minOrder > 0 && (
                        <span className="text-[11px] font-semibold text-[#6B7280]">
                          Min. order Rs. {minOrder.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <h3 className="sf-heading text-base font-extrabold text-[#111827]">
                      {promo.title}
                    </h3>
                    <p className="text-xs text-[#4B5563] leading-relaxed">
                      {promo.description ||
                        `Save on eligible online medicine orders placed at ${displayName}.`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F3F4F6]">
                    {promo.code ? (
                      <div className="inline-flex items-center gap-2 text-xs">
                        <span className="text-[#6B7280] font-semibold">Code:</span>
                        <code className="px-2 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] font-mono font-extrabold text-[#111827]">
                          {promo.code}
                        </code>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-[#6B7280]">
                        Auto-applied at checkout
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (promo.code) onApplyPromoCode(promo.code);
                        onSelectView("shop");
                      }}
                      className="h-9 px-4 rounded-lg sf-btn-primary text-xs font-bold inline-flex items-center gap-1.5"
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
                className="bg-white rounded-xl border border-[#E5E7EB] p-5 flex items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  {ban.badge_text && (
                    <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-bold sf-badge-brand">
                      {sanitizePublicCopy(ban.badge_text, sf, "Featured")}
                    </span>
                  )}
                  <h3 className="sf-heading text-base font-bold text-[#111827]">{ban.title}</h3>
                  {ban.subtitle && <p className="text-xs text-[#6B7280]">{ban.subtitle}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="h-9 px-4 rounded-lg sf-btn-primary text-xs font-bold shrink-0"
                >
                  {ban.cta_label || "Shop Now"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 6. OPTIONAL IN-HOUSE DOCTORS (HIDDEN IF 0 DOCTORS!)                 */}
      {/* =================================================================== */}
      {doctors.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
                Available Doctors at {displayName}
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Consultation timings, fees, and direct appointment booking
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectView("doctors")}
              className="text-xs font-bold sf-text-brand hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              <span>All Doctors ({doctors.length})</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.slice(0, 3).map((doc) => {
              const phoneDigits = (doc.booking_phone || whatsappDigits).replace(/[^0-9]/g, "");
              const fee = Number(doc.consultation_fee_pkr || 0);
              const waText = encodeURIComponent(
                `Assalam-o-Alaikum ${displayName}, I want to book an appointment with ${doc.name}${
                  doc.timings ? ` (${doc.timings})` : ""
                }.`
              );
              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-[#E5E7EB] p-4 flex flex-col justify-between gap-3.5"
                >
                  <div className="flex items-start gap-3">
                    {doc.photo_url ? (
                      <img
                        src={doc.photo_url}
                        alt={doc.name}
                        loading="lazy"
                        decoding="async"
                        className="w-14 h-14 rounded-lg object-cover border border-[#E5E7EB] shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-lg text-white font-extrabold text-base flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "var(--sf-primary)" }}
                      >
                        {doc.name.replace(/^dr\.?\s*/i, "").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 space-y-0.5">
                      {doc.specialization && (
                        <span className="inline-block text-[10.5px] font-bold sf-text-brand">
                          {doc.specialization}
                        </span>
                      )}
                      <h3 className="sf-heading text-sm sm:text-base font-extrabold text-[#111827] truncate">
                        {doc.name}
                      </h3>
                      {doc.qualification && (
                        <p className="text-xs text-[#6B7280] truncate">{doc.qualification}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#F9FAFB] border border-[#F3F4F6] px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B7280]">Fee</span>
                      <span className="font-extrabold text-[#111827] tabular-nums">
                        {fee > 0 ? `Rs. ${fee.toLocaleString()}` : "Confirm at Desk"}
                      </span>
                    </div>
                    {doc.timings && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6B7280]">Timings</span>
                        <span className="font-semibold text-[#111827] truncate">{doc.timings}</span>
                      </div>
                    )}
                    {doc.days_available && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6B7280]">Days</span>
                        <span className="font-medium text-[#374151] truncate">{doc.days_available}</span>
                      </div>
                    )}
                  </div>

                  {phoneDigits && (
                    <a
                      href={`https://wa.me/${phoneDigits}?text=${waText}`}
                      target="_blank"
                      rel="noreferrer"
                      className="h-9 px-3 rounded-lg sf-btn-primary text-xs font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>Book Appointment</span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 7. OPTIONAL CUSTOM LAB & SERVICES (HIDDEN IF 0 SERVICES!)           */}
      {/* =================================================================== */}
      {customServices.length > 0 && (
        <section className="bg-white border-y border-[#E5E7EB]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
                  Lab Tests &amp; Healthcare Services
                </h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Transparent diagnostic rates &amp; home collection options
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectView("services")}
                className="text-xs font-bold sf-text-brand hover:underline inline-flex items-center gap-0.5 shrink-0"
              >
                <span>All Tests &amp; Rates</span>
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customServices.slice(0, 3).map((svc) => (
                <div
                  key={svc.id}
                  className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {svc.image_url && (
                      <div className="aspect-[16/9] w-full bg-[#F9FAFB] border-b border-[#F3F4F6] overflow-hidden">
                        <img
                          src={svc.image_url}
                          alt={svc.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {Boolean(svc.home_service_available) && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            Home Collection
                          </span>
                        )}
                        {svc.timings && (
                          <span className="text-[11px] font-medium text-[#6B7280]">{svc.timings}</span>
                        )}
                      </div>
                      <h3 className="sf-heading text-base font-extrabold text-[#111827]">
                        {svc.title}
                      </h3>
                      {svc.subtitle && (
                        <p className="text-xs text-[#4B5563] leading-relaxed">{svc.subtitle}</p>
                      )}
                      {Array.isArray(svc.items) && svc.items.length > 0 && (
                        <div className="pt-2 border-t border-[#F3F4F6] space-y-1.5">
                          {svc.items.slice(0, 3).map((it, idx) => (
                            <div
                              key={`${it.name}-${idx}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="text-[#374151] font-medium truncate">{it.name}</span>
                              <span className="font-extrabold text-[#111827] tabular-nums shrink-0">
                                {Number(it.price_pkr || 0) > 0
                                  ? `Rs. ${Number(it.price_pkr).toLocaleString()}`
                                  : "Free"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <button
                      type="button"
                      onClick={() => onSelectView("services")}
                      className="w-full h-9 rounded-lg sf-btn-soft text-xs font-bold inline-flex items-center justify-center gap-1"
                    >
                      <span>
                        {svc.items && svc.items.length > 3
                          ? `See all ${svc.items.length} tests`
                          : "View Details & Book"}
                      </span>
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 8. VERIFIED CUSTOMER REVIEWS (HIDDEN IF 0 PUBLISHED REVIEWS!)       */}
      {/* =================================================================== */}
      {reviews.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="sf-heading text-lg sm:text-xl font-extrabold text-[#111827]">
                Verified Customer Reviews
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Feedback from confirmed online orders at {displayName}
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E5E7EB] text-xs font-bold text-[#111827]">
              <span className="text-amber-500">★</span>
              <span className="tabular-nums">{reviewsSummary.average_rating.toFixed(1)}</span>
              <span className="text-[#6B7280] font-medium">
                ({reviewsSummary.count} verified)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.slice(0, 6).map((rev) => (
              <article
                key={rev.id}
                className="bg-white rounded-xl border border-[#E5E7EB] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-amber-500 text-xs tracking-tight">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span key={s}>{s <= Number(rev.rating || 5) ? "★" : "☆"}</span>
                      ))}
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                      Verified Order
                    </span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-[#374151] leading-relaxed">
                    &ldquo;{rev.comment}&rdquo;
                  </p>
                  {rev.owner_reply && (
                    <div className="p-2.5 rounded-lg bg-[#F9FAFB] border border-[#F3F4F6] text-[11.5px] text-[#4B5563]">
                      <strong className="text-[#111827]">{displayName}:</strong> {rev.owner_reply}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between text-[11.5px] text-[#6B7280]">
                  <span className="font-bold text-[#111827]">{rev.customer_name}</span>
                  <span>
                    {rev.created_at
                      ? new Date(rev.created_at).toLocaleDateString("en-PK", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 9. COMPACT RETAIL PHARMACY COUNTER & DIRECT ASSISTANCE BAR          */}
      {/* =================================================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-10">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="sf-heading text-base sm:text-lg font-extrabold text-[#111827]">
              Visit {displayName} Counter
            </h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#4B5563]">
              {sf.address_line && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="w-3.5 h-3.5 sf-text-brand shrink-0" />
                  <span>
                    {sf.address_line}, {sf.city}
                  </span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5 sf-text-brand shrink-0" />
                <span>{scheduleText}</span>
              </span>
              {sf.contact_phone && (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#111827] hover:underline tabular-nums"
                >
                  <PhoneIcon className="w-3.5 h-3.5 sf-text-brand shrink-0" />
                  <span>{sf.contact_phone}</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectView("branches")}
              className="h-9 px-3.5 rounded-lg sf-btn-secondary text-xs font-bold"
            >
              Directions &amp; Hours
            </button>
            <button
              type="button"
              onClick={() => onSelectView("contact")}
              className="h-9 px-4 rounded-lg sf-btn-primary text-xs font-bold"
            >
              Contact Pharmacy
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
