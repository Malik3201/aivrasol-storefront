import React, { useState } from "react";
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
  CATEGORY_3D_MEDIA,
  EDITORIAL_MEDIA,
  resolveCategory3dIconUrl,
} from "../design/editorialAssets";
import {
  cleanProductText,
  isMeaningfulCategory,
  sanitizePublicCopy,
} from "../design/theme";
import type { StorefrontView } from "../types-ui";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  MapPinIcon,
  PackageTrackIcon,
  PhoneIcon,
  PrescriptionIcon,
  ReceiptDownloadIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
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
  onSubmitSearch: () => void;
  onSelectCategory: (catName: string) => void;
  onSelectView: (view: StorefrontView) => void;
  onApplyPromoCode: (code: string) => void;
  onOpenProductDetail?: (prod: PublicStorefrontProduct) => void;
  onQuickAddToCart?: (prod: PublicStorefrontProduct) => void;
  onQuickTrackOrder?: (orderNumber: string) => void;
  renderProductCard: (prod: PublicStorefrontProduct) => React.ReactNode;
}

function resolveConsoleProductPreview(prod: PublicStorefrontProduct) {
  const isOut =
    prod.availability_status === "out_of_stock" || prod.availability_status === "unavailable";
  const isLow = !isOut && prod.availability_status === "low_stock";

  const validUnits = Array.isArray(prod.selling_units)
    ? prod.selling_units.filter(
        (u: any) =>
          u &&
          String(u.unit_name || u.name || "").trim().length > 0 &&
          Number(u.price_pkr) > 0
      )
    : [];

  if (validUnits.length > 0) {
    const chosen =
      validUnits.find((u: any) => u.is_default && u.in_stock !== false) ||
      validUnits.find((u: any) => u.in_stock !== false) ||
      validUnits[0];
    const unitNames = validUnits.map((u: any) => String(u.unit_name || u.name).trim());
    return {
      unitNames,
      defaultUnitName: String(chosen.unit_name || chosen.name).trim(),
      defaultPricePkr: Number(chosen.price_pkr),
      isOut: isOut || chosen.in_stock === false,
      isLow,
    };
  }

  const fallbackUnit = cleanProductText(prod.unit_label) || cleanProductText(prod.packing_label) || "Unit";
  const fallbackPrice = Number(
    prod.effective_price_pkr ?? prod.override_price_pkr ?? prod.public_selling_price_pkr ?? 0
  );
  return {
    unitNames: [fallbackUnit],
    defaultUnitName: fallbackUnit,
    defaultPricePkr: fallbackPrice,
    isOut,
    isLow,
  };
}

const CATEGORY_VISUAL_THEMES = [
  {
    surface: "#FFFFFF",
    border: "#D5E4DD",
    iconBg: "#E9F5F1",
    iconColor: "#0E5146",
    hint: "Tablets, syrups & daily care",
  },
  {
    surface: "#F3FAF8",
    border: "#C9E2DC",
    iconBg: "#FFFFFF",
    iconColor: "#087E78",
    hint: "Devices, dressings & surgicals",
  },
  {
    surface: "#FFFFFF",
    border: "#E8DCC8",
    iconBg: "#FFF8ED",
    iconColor: "#9A5B13",
    hint: "Daily nutrition & immunity",
  },
  {
    surface: "#FBF7F0",
    border: "#E6D9C3",
    iconBg: "#FFFFFF",
    iconColor: "#0E5146",
    hint: "Gentle family & infant care",
  },
  {
    surface: "#FFFFFF",
    border: "#D5E4DD",
    iconBg: "#E9F5F1",
    iconColor: "#087E78",
    hint: "Dispensed with Rx review",
  },
  {
    surface: "#F4F8F7",
    border: "#D2E1DC",
    iconBg: "#FFFFFF",
    iconColor: "#172B36",
    hint: "Fast-moving pharmacy stock",
  },
];

function getCategoryHint(name: string, fallback: string): string {
  const key = name.toLowerCase();
  if (key.includes("prescription") || key.includes("rx")) return "Pharmacist-reviewed Rx items";
  if (key.includes("pain") || key.includes("otc")) return "Everyday fever & relief care";
  if (key.includes("vitamin") || key.includes("supplement")) return "Daily wellness & nutrition";
  if (key.includes("mother") || key.includes("baby")) return "Infant & family essentials";
  if (key.includes("device") || key.includes("surgical") || key.includes("first aid")) {
    return "Clinical supplies & equipment";
  }
  if (key.includes("medicine")) return "Counter-synced medicines";
  return fallback;
}

export function HomeView({
  sf,
  branding,
  settings,
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
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  onSelectCategory,
  onSelectView,
  onApplyPromoCode,
  onOpenProductDetail,
  onQuickAddToCart,
  onQuickTrackOrder,
  renderProductCard,
}: HomeViewProps) {
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [consoleTab, setConsoleTab] = useState<"dispense" | "track" | "rx">("dispense");
  const [shelfDept, setShelfDept] = useState<string>("all");
  const [heroTrackInput, setHeroTrackInput] = useState<string>("");

  const validCategories = categories
    .filter(isMeaningfulCategory)
    .sort((a, b) => Number(b.published_product_count || 0) - Number(a.published_product_count || 0));

  const defaultHeroHeading = `Order Medicines Online from ${displayName}`;
  const heroHeading = sanitizePublicCopy(
    branding?.hero_title || heroBanner?.title,
    sf,
    defaultHeroHeading
  );
  const useArtDirectedHeadline =
    heroHeading.trim().toLowerCase() === defaultHeroHeading.trim().toLowerCase();

  const heroDescription = sanitizePublicCopy(
    branding?.hero_subtitle || heroBanner?.subtitle,
    sf,
    `Browse live counter stock in ${sf.city}, switch selling units between Box, Strip, or Tablet with exact POS pricing, and order for local home delivery or zero-fee counter pickup.`
  );

  const deliveryEnabled = deliveryConfig?.delivery_enabled !== false;
  const pickupEnabled = deliveryConfig?.pickup_enabled !== false;
  const deliveryFeePkr = Number(deliveryConfig?.standard_delivery_fee_pkr ?? 150);
  const freeThresholdPkr = Number(deliveryConfig?.free_delivery_threshold_pkr ?? 2000);
  const minOrderPkr = Number(
    deliveryConfig?.min_order_amount_pkr ?? deliveryConfig?.minimum_order_value_pkr ?? 0
  );
  const estimatedMinutes = Number(deliveryConfig?.estimated_delivery_minutes || 0);
  const rxReviewSupported = Number(settings?.require_rx_for_prescription_items ?? 1) === 1;

  const scheduleText = openingHours?.is_24_hours
    ? "Open 24 Hours Daily"
    : openingHours?.mon_sat || "09:00 AM – 11:00 PM";

  const whatsappDigits = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");
  const publishedCount = Number(sf.published_products_count || homeProducts.length || 0);

  const consoleFilterCategories = validCategories
    .filter((c) => Number(c.published_product_count || 0) > 0)
    .slice(0, 3);

  const shelfPool =
    catalogSourceProducts && catalogSourceProducts.length > 0
      ? catalogSourceProducts
      : homeProducts;

  const liveShelfItems = [...shelfPool]
    .filter((p) => {
      if (shelfDept !== "all") {
        if ((p.category_name || "").toLowerCase() !== shelfDept.toLowerCase()) {
          return false;
        }
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const hay = [
        p.name,
        p.generic_name,
        p.brand_name,
        p.category_name,
        p.strength,
        p.dosage_form,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      const scoreProduct = (item: PublicStorefrontProduct) => {
        let score = 0;
        const unitCount = Array.isArray(item.selling_units) ? item.selling_units.length : 0;
        if (unitCount > 1) score += 30 + unitCount;
        const cat = (item.category_name || "").toLowerCase();
        if (
          cat.includes("medicine") ||
          cat.includes("prescription") ||
          cat.includes("otc") ||
          cat.includes("surgical") ||
          cat.includes("vitamin")
        ) {
          score += 20;
        }
        if (item.strength) score += 8;
        if (item.is_featured) score += 5;
        if (item.availability_status === "in_stock") score += 3;
        return score;
      };
      return scoreProduct(b) - scoreProduct(a);
    })
    .slice(0, 4);

  const activeHeroPromo = promotions[0] || null;

  const orderingSteps = [
    {
      step: "01",
      title: "Select Exact Selling Unit",
      desc: `Search ${displayName}'s live catalog and pick the exact unit you need — full Box, individual Blister Strip, single Tablet, or medical Unit.`,
      icon: CATEGORY_3D_MEDIA.general,
      badge: "Box • Strip • Tablet",
    },
    {
      step: "02",
      title: "Flexible Local Checkout",
      desc: `Choose doorstep delivery in ${sf.city} or zero-fee counter pickup, apply active pharmacy promo codes, and confirm with Cash on Delivery.`,
      icon: CATEGORY_3D_MEDIA.otcPain,
      badge: "Delivery or Free Pickup",
    },
    {
      step: "03",
      title: "Counter Batch & Rx Check",
      desc: `Our counter team verifies live shelf batches and expiry dates at ${displayName}, reviewing prescriptions for Rx-labeled items before dispatch.`,
      icon: CATEGORY_3D_MEDIA.prescription,
      badge: "Counter Verified",
    },
    {
      step: "04",
      title: "Live Tracking & 80mm Bill",
      desc: "Track preparation live using only your order reference number and download an official 80mm thermal PDF invoice anytime.",
      icon: CATEGORY_3D_MEDIA.vitamins,
      badge: "Instant PDF Invoice",
    },
  ];

  const homeFaqs = [
    {
      q: "Can I buy single blister strips or tablets instead of a full box?",
      a: `Yes. Whenever a medicine at ${displayName} is configured with multi-unit dispensing (such as Box, Strip, or Tablet), you can switch the selling unit right on the product card and see the exact counter-synced price and available stock immediately.`,
    },
    {
      q: "How are prescription-required (Rx) medicines handled online?",
      a: `Medicines that require a registered medical practitioner's prescription are clearly marked in the catalog. When your order reaches the ${displayName} counter, our team verifies your prescription via counter review or WhatsApp prior to final dispensing.`,
    },
    {
      q: "Do I need an account or phone verification to track my order?",
      a: "No account is needed. Simply enter your Order Reference Number (for example, ORD-...) on the Track Order page to view real-time preparation progress and download your itemized 80mm receipt PDF.",
    },
    {
      q: `What are the home delivery charges and pickup options in ${sf.city}?`,
      a: `${
        deliveryEnabled
          ? `Standard local delivery in ${sf.city} is PKR ${deliveryFeePkr.toLocaleString()}${
              freeThresholdPkr > 0
                ? `, and orders above PKR ${freeThresholdPkr.toLocaleString()} automatically qualify for free delivery.`
                : "."
            }`
          : "Local delivery settings are managed at checkout."
      } ${
        pickupEnabled
          ? `You can also select Free Counter Pickup at checkout to reserve items online and collect directly from ${displayName}.`
          : ""
      }`,
    },
  ];

  return (
    <div className="sf-fade-up">
      {/* =================================================================== */}
      {/* SECTION 1: CLINICAL COMMAND & LIVE DISPENSING HERO (PURE UI/UX)     */}
      {/* =================================================================== */}
      <section className="sf-hero-architectural overflow-hidden border-b border-white/10">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-16 lg:pb-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-9 lg:gap-12 items-center">
            {/* Left Stage: Editorial Pharmacy Identity, CTAs & Architectural Spec Strip */}
            <div className="lg:col-span-6 space-y-6 sm:space-y-7">
              {/* Live Counter Status Pill */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.15] text-xs font-semibold text-[#EAF6F2]">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6EE7B7] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#34D399]" />
                  </span>
                  <span>
                    Counter Open • {scheduleText} • {sf.city}
                  </span>
                </div>

                {sf.drug_sale_license_no && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E6A65B]/14 border border-[#E6A65B]/35 text-xs font-bold text-[#FCE2BC]">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-[#F2C47E]" />
                    <span>Lic: {sf.drug_sale_license_no}</span>
                  </span>
                )}
              </div>

              {/* Editorial Display Headline & Concise Pharmacy Lead */}
              <div className="space-y-3.5">
                {useArtDirectedHeadline ? (
                  <h1 className="sf-heading text-[31px] sm:text-[42px] lg:text-[48px] font-extrabold text-white tracking-[-0.025em] leading-[1.09]">
                    Counter-Verified Medicines,{" "}
                    <span className="text-[#F2C47E]">Direct from {displayName}.</span>
                  </h1>
                ) : (
                  <h1 className="sf-heading text-[31px] sm:text-[42px] lg:text-[46px] font-extrabold text-white tracking-[-0.025em] leading-[1.1]">
                    {heroHeading}
                  </h1>
                )}

                <p className="text-sm sm:text-[16px] text-[#CBE4DD] leading-relaxed max-w-xl">
                  {heroDescription}
                </p>
              </div>

              {/* Dual Primary & Secondary Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="h-12 px-6 rounded-2xl sf-btn-warm text-sm font-extrabold inline-flex items-center gap-2.5 shadow-lg"
                >
                  <span>Explore Full Catalog</span>
                  {publishedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-[#172B36]/14 text-xs font-extrabold tabular-nums">
                      {publishedCount}
                    </span>
                  )}
                  <ArrowRightIcon className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectView("delivery")}
                  className="h-12 px-5 rounded-2xl sf-btn-ghost-light text-sm font-semibold inline-flex items-center gap-2"
                >
                  <TruckIcon className="w-4 h-4 text-[#9AF0DF]" />
                  <span>Delivery &amp; Pickup</span>
                </button>
              </div>

              {/* Architectural 3-Column Spec Strip (Hairline Divided, Zero Cluttered Boxes) */}
              <div className="pt-5 sm:pt-6 border-t border-white/14 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/12">
                <div className="pb-3.5 sm:pb-0 sm:pr-5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#90C2B5] block">
                    Dispensing Units
                  </span>
                  <p className="text-sm sm:text-[15px] font-extrabold text-white mt-1">
                    Box · Strip · Tab
                  </p>
                  <p className="text-xs text-[#B7DBD1] mt-0.5">Exact POS unit pricing</p>
                </div>

                <div className="py-3.5 sm:py-0 sm:px-5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#90C2B5] block">
                    {deliveryEnabled ? "Local Delivery" : "Digital Billing"}
                  </span>
                  <p className="text-sm sm:text-[15px] font-extrabold text-white tabular-nums mt-1">
                    {deliveryEnabled
                      ? freeThresholdPkr > 0
                        ? `Free > PKR ${freeThresholdPkr.toLocaleString()}`
                        : `PKR ${deliveryFeePkr.toLocaleString()} Local`
                      : "80mm PDF Invoice"}
                  </p>
                  <p className="text-xs text-[#B7DBD1] mt-0.5">
                    {deliveryEnabled
                      ? estimatedMinutes > 0
                        ? `~${estimatedMinutes} min in ${sf.city}`
                        : `Standard PKR ${deliveryFeePkr.toLocaleString()} in ${sf.city}`
                      : "Instant download or email"}
                  </p>
                </div>

                <div className="pt-3.5 sm:pt-0 sm:pl-5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#90C2B5] block">
                    {pickupEnabled ? "Counter Pickup" : "Pharmacy Desk"}
                  </span>
                  <p className="text-sm sm:text-[15px] font-extrabold text-white mt-1">
                    {pickupEnabled ? "PKR 0 Pickup Fee" : sf.city}
                  </p>
                  <p className="text-xs text-[#B7DBD1] mt-0.5 truncate">
                    {pickupEnabled ? `Reserve online at ${displayName}` : scheduleText}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Stage: Interactive Live Pharmacy Counter Console */}
            <div className="lg:col-span-6">
              <div
                data-testid="hero-pharmacy-console"
                className="sf-hero-console rounded-[28px] overflow-hidden"
              >
                {/* Console Top Bar + Segmented 3-Mode Switcher */}
                <div className="bg-[#F4F9F7] border-b border-[#E1ECE7] px-4 sm:px-5 pt-4 pb-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#0E5146] shrink-0" />
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[#0E5146] truncate">
                        {displayName} • Counter Desk
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E3F4EE] border border-[#BFE0D4] text-[10.5px] font-bold text-[#0C594C] shrink-0">
                        <ShieldCheckIcon className="w-3 h-3" />
                        <span>Live POS Sync</span>
                      </span>
                    </div>

                    <span className="text-[11.5px] font-semibold text-[#5B707D] tabular-nums shrink-0">
                      {publishedCount > 0 ? `${publishedCount} Items Live` : sf.city}
                    </span>
                  </div>

                  {/* 3-Tab Segmented Control */}
                  <div
                    role="tablist"
                    aria-label="Pharmacy counter tools"
                    className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#E5EFEA]"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={consoleTab === "dispense"}
                      onClick={() => setConsoleTab("dispense")}
                      className={`h-9 px-2 rounded-xl text-[11.5px] sm:text-xs inline-flex items-center justify-center gap-1.5 transition ${
                        consoleTab === "dispense"
                          ? "bg-white text-[#0E5146] font-extrabold shadow-xs"
                          : "text-[#4E6470] hover:text-[#142833] font-semibold"
                      }`}
                    >
                      <SearchIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Dispense</span>
                      <span className="hidden sm:inline">Quick Dispense</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={consoleTab === "track"}
                      onClick={() => setConsoleTab("track")}
                      className={`h-9 px-2 rounded-xl text-[11.5px] sm:text-xs inline-flex items-center justify-center gap-1.5 transition ${
                        consoleTab === "track"
                          ? "bg-white text-[#0E5146] font-extrabold shadow-xs"
                          : "text-[#4E6470] hover:text-[#142833] font-semibold"
                      }`}
                    >
                      <PackageTrackIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Track Order</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={consoleTab === "rx"}
                      onClick={() => setConsoleTab("rx")}
                      className={`h-9 px-2 rounded-xl text-[11.5px] sm:text-xs inline-flex items-center justify-center gap-1.5 transition ${
                        consoleTab === "rx"
                          ? "bg-white text-[#0E5146] font-extrabold shadow-xs"
                          : "text-[#4E6470] hover:text-[#142833] font-semibold"
                      }`}
                    >
                      <PrescriptionIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Rx Desk</span>
                      <span className="hidden sm:inline">Rx &amp; Counter</span>
                    </button>
                  </div>
                </div>

                {/* Console Active Panel Body */}
                <div className="p-4 sm:p-5 min-h-[340px] flex flex-col justify-between">
                  {consoleTab === "dispense" && (
                    <div className="space-y-3.5">
                      {/* Instant Medicine Search Bar */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          onSubmitSearch();
                        }}
                        className="flex items-center gap-1.5 rounded-2xl border border-[#CBDED7] bg-[#F9FCFA] focus-within:bg-white focus-within:border-[#0E5146] focus-within:ring-2 focus-within:ring-[#0E5146]/12 p-1.5 transition"
                      >
                        <SearchIcon className="w-4 h-4 text-[#0E5146] ml-2.5 shrink-0" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => onSearchChange(e.target.value)}
                          placeholder="Search medicine name, strength, or surgical item…"
                          data-testid="catalog-search-input"
                          className="w-full h-9 px-2 bg-transparent text-sm font-medium text-[#132630] placeholder:text-[#788D99] focus:outline-none"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => onSearchChange("")}
                            aria-label="Clear search"
                            className="p-1.5 rounded-lg text-[#607481] hover:text-[#172B36] hover:bg-[#EDF4F1] transition"
                          >
                            <CloseIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="submit"
                          className="h-9 px-4 rounded-xl bg-[#0E5146] hover:bg-[#093B33] text-white text-xs font-bold shrink-0 inline-flex items-center gap-1.5 transition"
                        >
                          <span>Search</span>
                          <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                      </form>

                      {/* Interactive Live Shelf Department Filter */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShelfDept("all")}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                              shelfDept === "all"
                                ? "bg-[#0E5146] text-white"
                                : "bg-[#EEF5F2] text-[#4C626E] hover:bg-[#E2EEE9]"
                            }`}
                          >
                            All Shelf
                          </button>
                          {consoleFilterCategories.map((cat) => {
                            const active = shelfDept.toLowerCase() === cat.name.toLowerCase();
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setShelfDept(active ? "all" : cat.name)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                                  active
                                    ? "bg-[#0E5146] text-white"
                                    : "bg-[#EEF5F2] text-[#4C626E] hover:bg-[#E2EEE9]"
                                }`}
                              >
                                {cat.name}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectView("shop")}
                          className="text-[11.5px] font-bold text-[#0E5146] hover:underline shrink-0 inline-flex items-center gap-0.5"
                        >
                          <span>Full Catalog</span>
                          <ChevronRightIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Zero-Image Live POS Medicine Ledger Rows */}
                      {loadingProducts && liveShelfItems.length === 0 ? (
                        <div className="rounded-2xl border border-[#E3EEEA] divide-y divide-[#ECF3F0] overflow-hidden">
                          {[1, 2, 3, 4].map((row) => (
                            <div
                              key={row}
                              className="px-3.5 py-3 flex items-center justify-between gap-3 animate-pulse"
                            >
                              <div className="space-y-1.5 flex-1">
                                <div className="h-3.5 w-40 bg-[#E6EFEA] rounded" />
                                <div className="h-2.5 w-28 bg-[#EEF4F1] rounded" />
                              </div>
                              <div className="h-8 w-20 bg-[#E6EFEA] rounded-xl" />
                            </div>
                          ))}
                        </div>
                      ) : liveShelfItems.length === 0 ? (
                        <div className="rounded-2xl border border-[#E2EDE8] bg-[#F9FCFA] p-6 text-center space-y-2.5">
                          <p className="text-sm font-bold text-[#152934]">
                            No shelf preview matches &ldquo;{searchQuery || shelfDept}&rdquo;
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShelfDept("all");
                                onSearchChange("");
                              }}
                              className="h-8 px-3.5 rounded-xl border border-[#CBE0D8] bg-white text-xs font-bold text-[#172B36] hover:bg-[#F3F8F6] transition"
                            >
                              Reset Filter
                            </button>
                            <button
                              type="button"
                              onClick={() => onSubmitSearch()}
                              className="h-8 px-3.5 rounded-xl bg-[#0E5146] text-white text-xs font-bold hover:bg-[#093B33] transition"
                            >
                              Search Full Catalog
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-[#DFECE7] bg-white divide-y divide-[#ECF3F0] overflow-hidden">
                          {liveShelfItems.map((prod) => {
                            const preview = resolveConsoleProductPreview(prod);
                            const strengthText = cleanProductText(prod.strength);
                            const categoryText = cleanProductText(prod.category_name) || "General";

                            return (
                              <div
                                key={prod.id}
                                className="px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 hover:bg-[#F7FBF9] transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {prod.primary_image_url ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenProductDetail
                                          ? onOpenProductDetail(prod)
                                          : onSelectView("shop")
                                      }
                                      className="w-11 h-11 rounded-lg bg-white border border-[#E1EAE5] p-0.5 flex items-center justify-center shrink-0 overflow-hidden hover:border-[var(--sf-primary)] transition"
                                    >
                                      <img
                                        src={prod.primary_image_url}
                                        alt={prod.name}
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-contain"
                                      />
                                    </button>
                                  ) : null}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        title={
                                          preview.isOut
                                            ? "Out of stock"
                                            : preview.isLow
                                              ? "Low stock"
                                              : "In stock"
                                        }
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                          preview.isOut
                                            ? "bg-slate-400"
                                            : preview.isLow
                                              ? "bg-amber-500"
                                              : "bg-emerald-500"
                                        }`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenProductDetail
                                            ? onOpenProductDetail(prod)
                                            : onSelectView("shop")
                                        }
                                        className="text-[13.5px] font-bold text-[#132630] hover:text-[#0E5146] truncate text-left transition-colors"
                                      >
                                        {prod.name}
                                      </button>
                                      {strengthText && (
                                        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#EFF5F2] text-[10.5px] font-semibold text-[#4F6571] shrink-0">
                                          {strengthText}
                                        </span>
                                      )}
                                      {Boolean(prod.requires_prescription) && (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-extrabold text-amber-800 shrink-0">
                                          Rx
                                        </span>
                                      )}
                                    </div>

                                    <div className="mt-0.5 pl-4 text-[11.5px] text-[#607481] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                      <span className="truncate max-w-[130px] sm:max-w-none">
                                        {categoryText}
                                      </span>
                                      <span aria-hidden="true">•</span>
                                      <span className="font-medium text-[#3E5561]">
                                        Units: {preview.unitNames.slice(0, 3).join(" · ")}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                                  <div className="text-right">
                                    <span className="text-[13.5px] font-extrabold text-[#11242D] tabular-nums block leading-tight">
                                      PKR {preview.defaultPricePkr.toLocaleString()}
                                    </span>
                                    <span className="text-[10.5px] font-medium text-[#667B87] block">
                                      per {preview.defaultUnitName}
                                    </span>
                                  </div>

                                  {preview.isOut ? (
                                    <span className="h-8 px-2.5 rounded-xl bg-slate-100 text-slate-500 text-[11px] font-bold inline-flex items-center">
                                      Out
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onQuickAddToCart
                                          ? onQuickAddToCart(prod)
                                          : onSelectView("shop")
                                      }
                                      className="h-8 px-3 rounded-xl bg-[#EAF5F1] hover:bg-[#0E5146] text-[#0E5146] hover:text-white border border-[#C2E0D6] hover:border-[#0E5146] text-xs font-extrabold inline-flex items-center gap-1 transition"
                                    >
                                      <ShoppingBagIcon className="w-3.5 h-3.5" />
                                      <span>Add</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {consoleTab === "track" && (
                    <div className="space-y-4 my-auto py-1">
                      <div className="space-y-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0E5146] block">
                          Single-Reference Order Lookup
                        </span>
                        <h2 className="sf-heading text-lg font-extrabold text-[#122631]">
                          Track Preparation &amp; Download 80mm Receipt
                        </h2>
                        <p className="text-xs text-[#596E7A] leading-relaxed">
                          Enter only your Order Reference Number (no login or mobile verification
                          required) to check real-time counter status and download your itemized
                          thermal receipt PDF.
                        </p>
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (onQuickTrackOrder) {
                            onQuickTrackOrder(heroTrackInput);
                          } else {
                            onSelectView("track");
                          }
                        }}
                        className="space-y-2.5"
                      >
                        <div className="flex items-center rounded-2xl border border-[#C9DDD5] bg-[#F9FCFA] focus-within:bg-white focus-within:border-[#0E5146] focus-within:ring-2 focus-within:ring-[#0E5146]/12 px-3.5 h-11 transition">
                          <PackageTrackIcon className="w-4 h-4 text-[#0E5146] shrink-0 mr-2.5" />
                          <input
                            type="text"
                            value={heroTrackInput}
                            onChange={(e) => setHeroTrackInput(e.target.value)}
                            placeholder="e.g. ORD-261111-3017"
                            className="w-full bg-transparent font-mono text-sm font-bold uppercase tracking-wide text-[#132630] placeholder:font-sans placeholder:normal-case placeholder:font-normal placeholder:text-[#7B909C] focus:outline-none"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full h-11 rounded-2xl bg-[#0E5146] hover:bg-[#093B33] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 transition shadow-sm"
                        >
                          <ReceiptDownloadIcon className="w-4 h-4 text-[#F2C47E]" />
                          <span>Check Live Status &amp; 80mm PDF Bill</span>
                          <ArrowRightIcon className="w-4 h-4" />
                        </button>
                      </form>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {[
                          { step: "01", label: "Received", sub: "Logged in POS" },
                          { step: "02", label: "Verified", sub: "Batch & Rx check" },
                          { step: "03", label: "Packed", sub: "80mm bill ready" },
                          { step: "04", label: "Dispatched", sub: "Rider / Pickup" },
                        ].map((st) => (
                          <div
                            key={st.step}
                            className="rounded-xl border border-[#E2ECE8] bg-[#F7FBF9] px-3 py-2"
                          >
                            <span className="font-mono text-[10px] font-bold text-[#0E5146] block">
                              STAGE {st.step}
                            </span>
                            <p className="text-xs font-extrabold text-[#132630] mt-0.5">
                              {st.label}
                            </p>
                            <p className="text-[10.5px] text-[#627783]">{st.sub}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {consoleTab === "rx" && (
                    <div className="space-y-4 my-auto py-1">
                      <div className="rounded-2xl border border-[#DCEAE4] bg-[#F6FAF8] p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#0E5146] block">
                              Verified Dispensing Counter
                            </span>
                            <h2 className="sf-heading text-base font-extrabold text-[#132630] mt-0.5">
                              {displayName}
                            </h2>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-white border border-[#CFE2DA] text-[11px] font-bold text-[#0E5146] shrink-0">
                            {sf.city}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs text-[#475D69]">
                          <p className="flex items-start gap-2">
                            <MapPinIcon className="w-3.5 h-3.5 text-[#0E5146] shrink-0 mt-0.5" />
                            <span>
                              {sf.address_line
                                ? `${sf.address_line}, ${sf.city}`
                                : `${displayName} Counter, ${sf.city}`}
                            </span>
                          </p>
                          <p className="flex items-center gap-2">
                            <ClockIcon className="w-3.5 h-3.5 text-[#0E5146] shrink-0" />
                            <span>{scheduleText}</span>
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#E6E0D4] bg-[#FFFCF6] p-3.5 text-xs text-[#4E5E68] leading-relaxed flex items-start gap-2.5">
                        <CheckCircleIcon className="w-4 h-4 text-[#0E5146] shrink-0 mt-0.5" />
                        <p>
                          <strong className="font-bold text-[#152934]">
                            Prescription &amp; Strength Assistance:
                          </strong>{" "}
                          Place your order online or message our counter directly to confirm specific
                          potencies, pack sizes, or Rx-flagged items prior to dispatch.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {whatsappDigits && (
                          <a
                            href={`https://wa.me/${whatsappDigits}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-10 px-4 rounded-xl bg-[#0E5146] hover:bg-[#093B33] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 transition"
                          >
                            <WhatsAppIcon className="w-4 h-4 text-[#86EFAC]" />
                            <span>WhatsApp Pharmacist</span>
                          </a>
                        )}

                        {sf.contact_phone && (
                          <a
                            href={`tel:${sf.contact_phone}`}
                            className="h-10 px-4 rounded-xl border border-[#C9DDD5] bg-white hover:bg-[#F4F9F7] text-[#132630] text-xs font-extrabold inline-flex items-center justify-center gap-2 tabular-nums transition"
                          >
                            <PhoneIcon className="w-3.5 h-3.5 text-[#0E5146]" />
                            <span>Call {sf.contact_phone}</span>
                          </a>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectView("branches")}
                        className="w-full text-center text-xs font-bold text-[#0E5146] hover:underline inline-flex items-center justify-center gap-1 pt-0.5"
                      >
                        <span>View Counter Location &amp; Free Pickup Instructions</span>
                        <ChevronRightIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Console Grounded Footer Strip: Active Promo Voucher or 80mm Receipt Note */}
                <div className="bg-[#F4F9F7] border-t border-[#E1ECE7] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  {activeHeroPromo ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0E5146] text-[#FFF8ED] text-[10.5px] font-extrabold uppercase tracking-wider shrink-0">
                          <TagIcon className="w-3 h-3 text-[#F2C47E]" />
                          <span>
                            {((activeHeroPromo as any).promotion_type ||
                              activeHeroPromo.promo_type) === "percentage" &&
                            Number(activeHeroPromo.discount_value) > 0
                              ? `${activeHeroPromo.discount_value}% OFF`
                              : ((activeHeroPromo as any).promotion_type ||
                                    activeHeroPromo.promo_type) === "fixed_amount" &&
                                  Number(activeHeroPromo.discount_value) > 0
                                ? `PKR ${Number(activeHeroPromo.discount_value).toLocaleString()} OFF`
                                : "Active Offer"}
                          </span>
                        </span>
                        <span className="font-bold text-[#142833] truncate">
                          {activeHeroPromo.title}
                        </span>
                        {activeHeroPromo.code && (
                          <code className="px-2 py-0.5 rounded bg-white border border-[#CBE0D8] font-mono text-[11px] font-extrabold text-[#0E5146]">
                            {activeHeroPromo.code}
                          </code>
                        )}
                      </div>

                      {activeHeroPromo.code ? (
                        <button
                          type="button"
                          onClick={() => onApplyPromoCode(String(activeHeroPromo.code))}
                          className="text-xs font-extrabold text-[#0E5146] hover:text-[#08352E] inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Apply Code</span>
                          <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectView("shop")}
                          className="text-xs font-extrabold text-[#0E5146] hover:text-[#08352E] inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Shop Offer</span>
                          <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-[#526773] flex items-center gap-1.5">
                        <ReceiptDownloadIcon className="w-3.5 h-3.5 text-[#0E5146] shrink-0" />
                        <span>Official 80mm thermal PDF invoice included with every order</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectView("track")}
                        className="text-xs font-extrabold text-[#0E5146] hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <span>Track Order</span>
                        <ArrowRightIcon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 2: TACTILE 3D CATEGORY DISCOVERY (PASTEL BOTANICAL BAND)    */}
      {/* =================================================================== */}
      {validCategories.length > 0 && (
        <section className="sf-category-showcase-bg relative overflow-hidden border-b border-[#ECDFCE]">
          {/* Decorative Organic Botanical & Pastel Watercolor Corner Accents */}
          <svg
            aria-hidden="true"
            viewBox="0 0 220 200"
            fill="none"
            className="pointer-events-none select-none hidden sm:block absolute -left-4 bottom-0 w-44 h-40 opacity-80"
          >
            <path
              d="M-10 200 C30 145, 95 148, 155 200 Z"
              fill="#BFE3D8"
              fillOpacity="0.65"
            />
            <path
              d="M28 202 C22 152, 34 114, 52 84 C58 118, 55 158, 44 202 Z"
              fill="#6AA48D"
              fillOpacity="0.58"
            />
            <path
              d="M12 202 C2 162, 6 128, 18 100 C28 130, 29 166, 24 202 Z"
              fill="#84B8A3"
              fillOpacity="0.62"
            />
            <path
              d="M52 202 C60 168, 78 144, 98 128 C94 156, 80 182, 66 202 Z"
              fill="#E59F76"
              fillOpacity="0.58"
            />
            <circle cx="118" cy="166" r="3" fill="#8FB5C9" fillOpacity="0.55" />
            <circle cx="132" cy="176" r="2.5" fill="#8FB5C9" fillOpacity="0.45" />
            <path
              d="M96 150 L99 158 L107 161 L99 164 L96 172 L93 164 L85 161 L93 158 Z"
              fill="#92CBBF"
              fillOpacity="0.7"
            />
          </svg>

          <svg
            aria-hidden="true"
            viewBox="0 0 220 200"
            fill="none"
            className="pointer-events-none select-none hidden sm:block absolute -right-4 bottom-0 w-48 h-44 opacity-80"
          >
            <path
              d="M40 200 C90 146, 170 144, 230 200 Z"
              fill="#F6CDB2"
              fillOpacity="0.58"
            />
            <path
              d="M188 202 C182 152, 192 108, 210 76 C216 114, 210 158, 200 202 Z"
              fill="#5D9680"
              fillOpacity="0.65"
            />
            <path
              d="M174 202 C158 164, 158 130, 168 102 C182 128, 186 164, 184 202 Z"
              fill="#7EB39D"
              fillOpacity="0.62"
            />
            <path
              d="M154 148 L157 156 L165 159 L157 162 L154 170 L151 162 L143 159 L151 156 Z"
              fill="#E7A77E"
              fillOpacity="0.72"
            />
          </svg>

          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-11 sm:py-14 space-y-7 relative z-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#2F6F63] block">
                  Pharmacy Departments
                </span>
                <h2 className="sf-heading text-2xl sm:text-[32px] font-extrabold text-[#11242D] tracking-tight">
                  Browse by Healthcare Category
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory("all");
                  onSelectView("shop");
                }}
                className="h-10 sm:h-11 px-5 rounded-full sf-btn-catalog-pill text-xs sm:text-[13px] font-bold inline-flex items-center gap-1.5 shrink-0"
              >
                <span>Explore Full Catalog</span>
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
              {validCategories.slice(0, 6).map((cat, idx) => {
                const count = Number(cat.published_product_count || 0);
                const palette = CATEGORY_VISUAL_THEMES[idx % CATEGORY_VISUAL_THEMES.length];
                const subtitle = getCategoryHint(cat.name, palette.hint);
                const icon3dUrl = resolveCategory3dIconUrl(cat.name);

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onSelectCategory(cat.name);
                      onSelectView("shop");
                    }}
                    className="sf-category-3d-card rounded-[26px] px-3.5 pt-5 pb-5 sm:px-4 sm:pt-6 sm:pb-6 text-center relative flex flex-col items-center justify-between gap-3 min-h-[224px] sm:min-h-[246px] group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
                  >
                    {/* Top-Right Glowing Count Badge */}
                    {count > 0 && (
                      <span
                        className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold tabular-nums border ${
                          idx % 2 === 0
                            ? "bg-[#DCF8EE] text-[#0E5146] border-[#B2EBD9] shadow-[0_0_12px_rgba(92,214,176,0.42)]"
                            : "bg-[#FBF0DF] text-[#6B4E29] border-[#ECD5B4] shadow-[0_0_12px_rgba(230,185,130,0.38)]"
                        }`}
                      >
                        {count}
                      </span>
                    )}

                    {/* Centered 3D Illustration Stage */}
                    <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mt-0.5">
                      {cat.image_url ? (
                        <img
                          src={cat.image_url}
                          alt={cat.name}
                          loading="lazy"
                          decoding="async"
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-xs transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <img
                          src={icon3dUrl}
                          alt={cat.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
                        />
                      )}
                    </div>

                    {/* Centered Category Title & Subtitle */}
                    <div className="space-y-1.5 w-full px-0.5">
                      <p className="sf-heading text-[15.5px] sm:text-[16.5px] font-extrabold text-[#11242D] leading-tight line-clamp-2 group-hover:text-[var(--sf-primary-ink)] transition-colors">
                        {cat.name}
                      </p>
                      <p className="text-[12px] text-[#5B6B73] leading-snug line-clamp-2">
                        {subtitle}
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
      {/* SECTION 3: FEATURED MEDICINES & HEALTHCARE SUPPLIES                 */}
      {/* =================================================================== */}
      <section className="sf-catalog-showcase-bg relative border-b border-[#E1EAE5]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-block px-3 py-1 rounded-md bg-[#0E5146] text-white text-[11px] font-bold uppercase tracking-wider shadow-2xs">
                Counter-Synced Inventory
              </span>
              <h2 className="sf-heading text-2xl sm:text-[32px] font-extrabold text-[#10232C] tracking-tight">
                Available Medicines &amp; Supplies
              </h2>
              <p className="text-sm text-[#4F6571]">
                Choose your exact selling unit (Box, Strip, Tablet, or Unit) with live counter pricing
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectView("shop")}
              className="h-10 px-5 rounded-full bg-white hover:bg-[#F5FAF8] border border-[#CFE1DA] shadow-xs text-xs sm:text-[13px] font-bold text-[#10232C] inline-flex items-center gap-1.5 transition"
            >
              <span>View All Medicines</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingProducts && homeProducts.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="rounded-[24px] bg-white border border-[#DBE5E0] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-[#EEF4F1]" />
                  <div className="p-5 space-y-3">
                    <div className="h-3 w-24 bg-[#E6EEEA] rounded" />
                    <div className="h-4 w-3/4 bg-[#E6EEEA] rounded" />
                    <div className="h-7 w-1/2 bg-[#EEF4F1] rounded-lg" />
                    <div className="h-9 w-full bg-[#E6EEEA] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : homeProducts.length === 0 ? (
            <div className="sf-card rounded-3xl p-10 text-center space-y-2">
              <p className="sf-heading text-base font-bold text-[#172B36]">
                Catalog Products Are Being Prepared
              </p>
              <p className="text-sm text-[#607481] max-w-md mx-auto">
                Approved pharmacy items will appear here automatically once published from the counter.
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6"
              data-testid="public-product-grid"
            >
              {homeProducts.map((prod) => renderProductCard(prod))}
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 4: 4-STEP ONLINE ORDERING JOURNEY (3D + GLASS CARDS)        */}
      {/* =================================================================== */}
      <section className="sf-journey-section-bg relative overflow-hidden border-b border-[#E3ECE7]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
                Seamless Counter-to-Door Workflow
              </span>
              <h2 className="sf-heading text-2xl sm:text-[32px] font-extrabold text-[#11242D] tracking-tight">
                How Online Ordering Works at {displayName}
              </h2>
              <p className="text-sm text-[#546975]">
                Every order connects directly with our live pharmacy counter in {sf.city} — ensuring
                authentic stock, accurate unit billing, and instant digital receipts.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSelectView("track")}
              className="h-10 px-5 rounded-full sf-glass-pill text-xs sm:text-[13px] font-bold text-[#0E5146] inline-flex items-center gap-2 self-start md:self-auto hover:bg-white transition"
            >
              <PackageTrackIcon className="w-4 h-4" />
              <span>Already Ordered? Track Status</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {orderingSteps.map((item) => (
              <div
                key={item.step}
                className="sf-glass-surface-card rounded-[26px] p-5 sm:p-6 flex flex-col justify-between gap-5 group hover:-translate-y-1 transition-transform duration-200"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="sf-display text-xs font-extrabold tracking-widest uppercase px-3 py-1 rounded-full bg-[#0E5146] text-[#FFF8ED] tabular-nums shadow-2xs">
                      Step {item.step}
                    </span>
                    <div className="w-14 h-14 rounded-2xl bg-white/85 border border-[#DCEAE4] p-1.5 flex items-center justify-center shadow-2xs">
                      <img
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="sf-heading text-[17px] font-extrabold text-[#11242D] leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-[13.5px] text-[#556A76] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#DCE9E3] flex items-center justify-between text-[11.5px] font-bold text-[#0E5146]">
                  <span>{item.badge}</span>
                  <CheckCircleIcon className="w-4 h-4 text-[#16796A]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 5: OWNER-CONFIGURED PROMOTIONS SHOWCASE (AURORA TEAL)       */}
      {/* =================================================================== */}
      {(promotions.length > 0 || secondaryBanners.length > 0) && (
        <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-11 sm:py-14">
          <div className="space-y-5">
            {promotions.slice(0, 2).map((promo) => {
              const discountNum = Number(promo.discount_value || 0);
              const minOrder = Number(promo.min_order_pkr || 0);
              const offerBenefitLabel =
                promo.promo_type === "percentage" && discountNum > 0
                  ? `${discountNum}% OFF`
                  : promo.promo_type === "fixed_amount" && discountNum > 0
                    ? `PKR ${discountNum.toLocaleString()} OFF`
                    : promo.badge_text || "Special Offer";

              return (
                <div
                  key={promo.id}
                  className="rounded-[30px] overflow-hidden shadow-xl border border-[#0B6B65] relative grid grid-cols-1 lg:grid-cols-12"
                  style={{
                    background:
                      "radial-gradient(circle at 15% 20%, rgba(230, 166, 91, 0.24), transparent 42%), linear-gradient(132deg, #064E49 0%, #087E78 55%, #0A5B55 100%)",
                  }}
                >
                  <div className="lg:col-span-8 p-6 sm:p-9 lg:p-10 text-white flex flex-col justify-between gap-6 relative z-10">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-[#E6A65B] text-[#172B36] shadow-2xs">
                          <TagIcon className="w-3.5 h-3.5" />
                          <span>{promo.badge_text || "Active Pharmacy Promotion"}</span>
                        </span>
                        {discountNum > 0 && (
                          <span className="px-3.5 py-1 rounded-full text-xs font-extrabold bg-white/16 text-white border border-white/25 tabular-nums backdrop-blur-xs">
                            {offerBenefitLabel}
                          </span>
                        )}
                      </div>

                      <h2 className="sf-heading text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-white tracking-tight leading-tight">
                        {promo.title}
                      </h2>

                      <p className="text-sm sm:text-base text-white/90 max-w-xl leading-relaxed">
                        {promo.description ||
                          `Save instantly on eligible healthcare & medicine orders at ${displayName}${
                            minOrder > 0
                              ? ` when your cart exceeds PKR ${minOrder.toLocaleString()}.`
                              : " — applied automatically in your checkout bill."
                          }`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {promo.code && (
                        <div className="inline-flex items-center gap-2.5 px-4 h-11 rounded-xl bg-black/22 border border-white/28 text-xs text-white backdrop-blur-xs">
                          <span className="text-white/75 uppercase tracking-wider text-[10.5px] font-semibold">
                            Promo Code
                          </span>
                          <strong className="font-mono text-sm font-extrabold tracking-wider text-[#FFF8ED]">
                            {promo.code}
                          </strong>
                        </div>
                      )}

                      {promo.code ? (
                        <button
                          type="button"
                          onClick={() => {
                            onApplyPromoCode(promo.code || "");
                            onSelectView("shop");
                          }}
                          className="h-11 px-6 rounded-xl sf-btn-warm text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-md"
                        >
                          <span>Apply {promo.code} &amp; Shop</span>
                          <ChevronRightIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectView("shop")}
                          className="h-11 px-6 rounded-xl sf-btn-warm text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-md"
                        >
                          <span>Shop Eligible Items</span>
                          <ChevronRightIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tactile Perforated Pharmacy Savings Pass */}
                  <div className="lg:col-span-4 relative bg-[#054540]/65 border-t lg:border-t-0 lg:border-l border-white/14 flex items-center justify-center p-6 sm:p-7 overflow-hidden">
                    {promo.banner_image_url ? (
                      <img
                        src={promo.banner_image_url}
                        alt={promo.title}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover opacity-95"
                      />
                    ) : (
                      <div className="relative w-full max-w-[300px] rounded-2xl bg-[#FFF9F0] text-[#172B36] p-5 shadow-2xl border border-[#EADBC4]">
                        <div
                          aria-hidden="true"
                          className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#064C47]"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#064C47]"
                        />
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wider text-[#7A5B2B]">
                            <span className="truncate">{displayName}</span>
                            <span>Online Voucher</span>
                          </div>
                          <div className="sf-display text-3xl font-extrabold text-[#0E5146] tracking-tight tabular-nums">
                            {offerBenefitLabel}
                          </div>
                          <p className="text-[11.5px] text-[#5C707D] leading-snug">
                            {minOrder > 0
                              ? `Valid on online orders over PKR ${minOrder.toLocaleString()}`
                              : "Deducted directly on your checkout & 80mm receipt"}
                          </p>
                          <div className="border-t border-dashed border-[#D8C5A8] pt-3 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-[#607481]">
                              {promo.code ? "Voucher Code" : "Status"}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-[#0E5146] text-[#FFF8ED] font-mono text-xs font-bold tracking-wider">
                              {promo.code || "ACTIVE"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {secondaryBanners.slice(0, 2).map((ban) => (
              <div
                key={ban.id}
                className="rounded-2xl sf-surface-ivory border border-[#EADFCE] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  {ban.badge_text && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold sf-badge-warm">
                      {sanitizePublicCopy(ban.badge_text, sf, "Featured")}
                    </span>
                  )}
                  <h3 className="sf-heading text-base font-bold text-[#172B36]">{ban.title}</h3>
                  {ban.subtitle && (
                    <p className="text-xs sm:text-sm text-[#607481]">{ban.subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectView("shop")}
                  className="shrink-0 h-10 px-5 rounded-xl sf-btn-primary text-xs font-semibold"
                >
                  {ban.cta_label || "Browse"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* SECTION 6: CLINICAL DISPENSING & CARE STANDARDS (DUAL-PHOTO + GLASS)*/}
      {/* =================================================================== */}
      <section className="sf-catalog-showcase-bg border-y border-[#CDE2DA] relative overflow-hidden">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Column: Editorial Dual-Photo Dispensing & Care Collage */}
            <div className="lg:col-span-5 space-y-5">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] sf-text-brand block">
                  Clinical Care &amp; Fulfillment
                </span>
                <h2 className="sf-heading text-2xl sm:text-[30px] font-extrabold text-[#11242D] leading-tight">
                  Prepared &amp; Checked at Our {sf.city} Pharmacy Counter
                </h2>
                <p className="text-sm text-[#4D616E] leading-relaxed">
                  Unlike anonymous marketplace warehouses, every medicine order placed here is
                  packed directly from {displayName}&apos;s temperature-monitored shelves with batch
                  and unit verification.
                </p>
              </div>

              <div className="sf-glass-surface-card rounded-[26px] p-3 space-y-3">
                <div className="rounded-[18px] overflow-hidden aspect-[16/9] bg-[#E8F3EF]">
                  <img
                    src={EDITORIAL_MEDIA.dispensingDeskWebp}
                    alt={`Dispensing counter verification and Rx review at ${displayName}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-5 rounded-[14px] overflow-hidden aspect-[16/10] bg-[#EFECE6]">
                    <img
                      src={EDITORIAL_MEDIA.careParcelWebp}
                      alt={`Sealed local pharmacy delivery parcel from ${displayName}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="col-span-7 px-1 space-y-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0E5146] block">
                      Local Coverage • {sf.city}
                    </span>
                    <p className="text-xs font-bold text-[#132630] leading-snug">
                      {deliveryEnabled
                        ? `Standard PKR ${deliveryFeePkr.toLocaleString()}${
                            freeThresholdPkr > 0
                              ? ` • Free over PKR ${freeThresholdPkr.toLocaleString()}`
                              : ""
                          }`
                        : "Counter pickup & local coordination"}
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelectView("delivery")}
                      className="text-xs font-bold text-[#087E78] hover:text-[#0E5146] inline-flex items-center gap-1 pt-0.5"
                    >
                      <span>View Delivery &amp; Pickup Policy</span>
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: 2x2 Frosted Glass Pharmacy Service Pillars */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {deliveryEnabled && (
                <div className="sf-glass-surface-card rounded-[24px] p-5 sm:p-6 space-y-3">
                  <div className="w-11 h-11 rounded-2xl sf-surface-forest text-white flex items-center justify-center shadow-sm">
                    <TruckIcon className="w-5 h-5 text-[#E6A65B]" />
                  </div>
                  <h3 className="sf-heading text-base font-extrabold text-[#11242D]">
                    Careful Local Home Delivery
                  </h3>
                  <p className="text-xs sm:text-sm text-[#546975] leading-relaxed">
                    Dispatched in sealed protective packaging across {sf.city}. Standard delivery is
                    PKR {deliveryFeePkr.toLocaleString()}
                    {freeThresholdPkr > 0
                      ? `, with complimentary delivery above PKR ${freeThresholdPkr.toLocaleString()}.`
                      : "."}
                    {minOrderPkr > 0
                      ? ` Minimum delivery order PKR ${minOrderPkr.toLocaleString()}.`
                      : ""}
                  </p>
                </div>
              )}

              {pickupEnabled && (
                <div className="sf-glass-surface-card rounded-[24px] p-5 sm:p-6 space-y-3">
                  <div className="w-11 h-11 rounded-2xl sf-surface-forest text-white flex items-center justify-center shadow-sm">
                    <StoreIcon className="w-5 h-5 text-[#E6A65B]" />
                  </div>
                  <h3 className="sf-heading text-base font-extrabold text-[#11242D]">
                    Express Counter Pickup
                  </h3>
                  <p className="text-xs sm:text-sm text-[#546975] leading-relaxed">
                    Skip counter waiting lines — reserve your required strips, boxes, or surgical
                    supplies online and collect from {displayName} with zero delivery fee.
                  </p>
                </div>
              )}

              {rxReviewSupported && (
                <div className="sf-glass-surface-card rounded-[24px] p-5 sm:p-6 space-y-3">
                  <div className="w-11 h-11 rounded-2xl sf-surface-forest text-white flex items-center justify-center shadow-sm">
                    <PrescriptionIcon className="w-5 h-5 text-[#E6A65B]" />
                  </div>
                  <h3 className="sf-heading text-base font-extrabold text-[#11242D]">
                    Responsible Rx Verification
                  </h3>
                  <p className="text-xs sm:text-sm text-[#546975] leading-relaxed">
                    Prescription-flagged medicines are reviewed carefully against a valid doctor&apos;s
                    prescription before release, keeping your family&apos;s treatment safe and
                    accurate.
                  </p>
                </div>
              )}

              <div className="sf-glass-surface-card rounded-[24px] p-5 sm:p-6 space-y-3">
                <div className="w-11 h-11 rounded-2xl sf-surface-forest text-white flex items-center justify-center shadow-sm">
                  <ReceiptDownloadIcon className="w-5 h-5 text-[#E6A65B]" />
                </div>
                <h3 className="sf-heading text-base font-extrabold text-[#11242D]">
                  80mm POS Receipt &amp; Live Status
                </h3>
                <p className="text-xs sm:text-sm text-[#546975] leading-relaxed">
                  {scheduleText}. Track live order stages with just your order number and download a
                  clean 80mm itemized pharmacy receipt PDF or get it emailed automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 7: INTERACTIVE ORDERING FAQs + FLAGSHIP CONCIERGE CARD      */}
      {/* =================================================================== */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 space-y-12 sm:space-y-16">
        {/* Interactive FAQ Accordion */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0E5146] block">
              Helpful Answers
            </span>
            <h2 className="sf-heading text-2xl sm:text-[30px] font-extrabold text-[#11242D] leading-tight">
              Frequently Asked Pharmacy Questions
            </h2>
            <p className="text-sm text-[#586D79] leading-relaxed">
              Everything you need to know about unit-level ordering, prescriptions, delivery fees,
              and receipts at {displayName}.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onSelectView("about")}
                className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-bold inline-flex items-center gap-1.5"
              >
                <span>About {displayName}</span>
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelectView("terms")}
                className="h-10 px-4 rounded-xl sf-btn-soft text-xs font-bold inline-flex items-center gap-1.5"
              >
                <span>Dispensing Terms</span>
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {homeFaqs.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={faq.q}
                  className={`rounded-2xl border transition-colors ${
                    isOpen
                      ? "bg-white border-[#B9D8CE] shadow-sm"
                      : "bg-white/75 border-[#DCE7E2] hover:border-[#C2D9D0]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4"
                  >
                    <span className="sf-heading text-sm sm:text-[15.5px] font-bold text-[#132630]">
                      {faq.q}
                    </span>
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-transform ${
                        isOpen
                          ? "bg-[#0E5146] text-white border-[#0E5146] rotate-90"
                          : "bg-[#F3F8F6] text-[#0E5146] border-[#D3E3DC]"
                      }`}
                    >
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-0.5 text-xs sm:text-sm text-[#536874] leading-relaxed border-t border-[#EDF3F0]">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Flagship Visit & Concierge Support Destination Card */}
        <div className="sf-hero-aurora rounded-[32px] overflow-hidden shadow-2xl border border-white/12 grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-7 p-6 sm:p-9 lg:p-11 flex flex-col justify-between gap-6 relative z-10">
            <div className="space-y-3.5">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full sf-hero-glass-mini text-xs font-bold text-[#FFE3BA]">
                <PhoneIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                <span>Direct Pharmacy Concierge • {displayName}</span>
              </span>

              <h2 className="sf-heading text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-white leading-tight">
                Need Help Finding a Specific Strength, Brand, or Pack Size?
              </h2>

              <p className="text-sm sm:text-base text-[#D4EAE3] leading-relaxed max-w-xl">
                Message or call our pharmacy counter directly for availability checks, prescription
                guidance, or urgent pickup preparation
                {sf.address_line ? ` at ${sf.address_line}, ${sf.city}.` : ` in ${sf.city}.`}
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs text-[#CDE5DE]">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/8 border border-white/14">
                  <ClockIcon className="w-3.5 h-3.5 text-[#E6A65B]" />
                  <span>{scheduleText}</span>
                </span>
                {sf.address_line && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/8 border border-white/14">
                    <MapPinIcon className="w-3.5 h-3.5 text-[#9AF0DF]" />
                    <span className="truncate max-w-[260px]">{sf.address_line}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {whatsappDigits && (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-11 px-5 rounded-xl sf-btn-warm text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-md"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Message on WhatsApp</span>
                </a>
              )}

              {sf.contact_phone && (
                <a
                  href={`tel:${sf.contact_phone}`}
                  className="h-11 px-5 rounded-xl sf-btn-ghost-light text-xs sm:text-sm font-semibold inline-flex items-center gap-2 tabular-nums"
                >
                  <PhoneIcon className="w-4 h-4 text-[#E6A65B]" />
                  <span>Call {sf.contact_phone}</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => onSelectView("branches")}
                className="h-11 px-5 rounded-xl sf-btn-ghost-light text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
              >
                <MapPinIcon className="w-4 h-4 text-[#9AF0DF]" />
                <span>Locations &amp; Directions</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 min-h-[260px] bg-[#07332C] relative overflow-hidden">
            <img
              src={EDITORIAL_MEDIA.conciergeSupportWebp}
              alt={`${displayName} concierge pickup desk and care parcels`}
              decoding="async"
              className="w-full h-full lg:absolute lg:inset-0 object-cover"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
