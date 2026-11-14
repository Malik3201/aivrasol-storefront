/**
 * Optimized local WebP editorial photography and 3D healthcare illustrations
 * bundled in `public/media/` and served directly from Cloudflare Workers Static Assets (`ASSETS`).
 *
 * Owner-uploaded media (`branding.hero_banner_url`, `branding.hero_image_url`,
 * `cat.image_url`, `promo.banner_image_url`, `product.primary_image_url`) always takes priority.
 */

export const EDITORIAL_MEDIA = {
  heroDesktopWebp: "/media/editorial/pharmacy-hero-1200.webp",
  heroMobileWebp: "/media/editorial/pharmacy-hero-768.webp",
  heroFlagshipDesktopWebp: "/media/editorial/hero-flagship-1280.webp",
  heroFlagshipMobileWebp: "/media/editorial/hero-flagship-768.webp",
  counterInteriorWebp: "/media/editorial/pharmacy-counter-1000.webp",
  careParcelWebp: "/media/editorial/pharmacy-parcel-900.webp",
  dispensingDeskWebp: "/media/editorial/pharmacist-dispensing-1000.webp",
  conciergeSupportWebp: "/media/editorial/pharmacy-concierge-1000.webp",
} as const;

export const CATEGORY_3D_MEDIA = {
  general: "/media/categories/cat-general.webp",
  medicines: "/media/categories/cat-medicines.webp",
  prescription: "/media/categories/cat-prescription.webp",
  otcPain: "/media/categories/cat-otc-pain.webp",
  vitamins: "/media/categories/cat-vitamins.webp",
  motherBaby: "/media/categories/cat-mother-baby.webp",
  surgical: "/media/categories/cat-surgical.webp",
} as const;

export const PRODUCT_3D_MEDIA = {
  tabletsBox: "/media/products/prod-tablets-box.webp",
  medicalDevice: "/media/products/prod-medical-device.webp",
  surgicalSterile: "/media/products/prod-surgical-sterile.webp",
  liquidSyrup: "/media/products/prod-liquid-syrup.webp",
  personalBabyCare: "/media/products/prod-personal-baby-care.webp",
} as const;

export function resolveCategory3dIconUrl(categoryName: string): string {
  const key = (categoryName || "").toLowerCase().trim();
  if (key.includes("prescription") || key.includes("rx")) {
    return CATEGORY_3D_MEDIA.prescription;
  }
  if (key.includes("otc") || key.includes("pain") || key.includes("fever") || key.includes("relief")) {
    return CATEGORY_3D_MEDIA.otcPain;
  }
  if (key.includes("vitamin") || key.includes("supplement") || key.includes("nutrition") || key.includes("wellness")) {
    return CATEGORY_3D_MEDIA.vitamins;
  }
  if (key.includes("mother") || key.includes("baby") || key.includes("infant") || key.includes("child") || key.includes("maternity")) {
    return CATEGORY_3D_MEDIA.motherBaby;
  }
  if (key.includes("surgical") || key.includes("device") || key.includes("equipment") || key.includes("first aid") || key.includes("diagnostic")) {
    return CATEGORY_3D_MEDIA.surgical;
  }
  if (key.includes("medicine") || key.includes("pharma") || key.includes("antibiotic") || key.includes("chronic") || key.includes("cardiac") || key.includes("diabet")) {
    return CATEGORY_3D_MEDIA.medicines;
  }
  return CATEGORY_3D_MEDIA.general;
}

export interface ProductStudioVisualSpec {
  imageUrl: string;
  stageBg: string;
  specBadge: string;
  specBadgeTone: "warm" | "mint" | "teal";
}

export function resolveProductStudioVisual(params: {
  name?: string | null;
  dosageForm?: string | null;
  categoryName?: string | null;
  packingLabel?: string | null;
  requiresPrescription?: boolean | number | null;
  availabilityStatus?: string | null;
}): ProductStudioVisualSpec {
  const combined = [
    params.name || "",
    params.dosageForm || "",
    params.categoryName || "",
    params.packingLabel || "",
  ]
    .join(" ")
    .toLowerCase();

  const isRx = Boolean(params.requiresPrescription);
  const isLowStock = params.availabilityStatus === "low_stock";

  if (
    combined.includes("nebul") ||
    combined.includes("nubil") ||
    combined.includes("machine") ||
    combined.includes("monitor") ||
    combined.includes("meter") ||
    combined.includes("thermometer") ||
    combined.includes("device") ||
    combined.includes("equipment") ||
    combined.includes("inhaler")
  ) {
    return {
      imageUrl: PRODUCT_3D_MEDIA.medicalDevice,
      stageBg: "#EAF4F3",
      specBadge: "Medical Equipment",
      specBadgeTone: "teal",
    };
  }

  if (
    combined.includes("blade") ||
    combined.includes("scalpel") ||
    combined.includes("suture") ||
    combined.includes("syringe") ||
    combined.includes("cannula") ||
    combined.includes("gauze") ||
    combined.includes("bandage") ||
    combined.includes("glove") ||
    combined.includes("surgical")
  ) {
    return {
      imageUrl: PRODUCT_3D_MEDIA.surgicalSterile,
      stageBg: "#ECF5F4",
      specBadge: "Sterile Surgical",
      specBadgeTone: "teal",
    };
  }

  if (
    combined.includes("syrup") ||
    combined.includes("suspension") ||
    combined.includes("liquid") ||
    combined.includes("drop") ||
    combined.includes("solution") ||
    combined.includes("elixir") ||
    combined.includes("lotion")
  ) {
    return {
      imageUrl: PRODUCT_3D_MEDIA.liquidSyrup,
      stageBg: "#EEF7F2",
      specBadge: isRx ? "Prescription Rx" : "Oral Liquid",
      specBadgeTone: isRx ? "warm" : "mint",
    };
  }

  if (
    combined.includes("teether") ||
    combined.includes("floss") ||
    combined.includes("dental") ||
    combined.includes("brush") ||
    combined.includes("baby") ||
    combined.includes("diaper") ||
    combined.includes("pacifier") ||
    combined.includes("feeder") ||
    combined.includes("soap") ||
    combined.includes("hygiene")
  ) {
    return {
      imageUrl: PRODUCT_3D_MEDIA.personalBabyCare,
      stageBg: "#FCF6EE",
      specBadge: "Daily Care",
      specBadgeTone: "warm",
    };
  }

  return {
    imageUrl: PRODUCT_3D_MEDIA.tabletsBox,
    stageBg: isLowStock ? "#FBF4E6" : "#E8F5EE",
    specBadge: isRx ? "Prescription Rx" : "Over-the-counter",
    specBadgeTone: isRx ? "warm" : isLowStock ? "warm" : "mint",
  };
}
