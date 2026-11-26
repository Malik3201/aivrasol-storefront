/**
 * Optimized local WebP commercial retail pharmacy photography
 * bundled in `public/media/storefront/` and served directly from Cloudflare Workers Static Assets (`ASSETS`).
 *
 * Owner-uploaded media (`branding.hero_banner_url`, `branding.hero_image_url`,
 * `cat.image_url`, `promo.banner_image_url`, `product.primary_image_url`) always takes priority.
 */

export const EDITORIAL_MEDIA = {
  // Primary Commercial Pharmacy Hero Photo (default when owner has not uploaded their own pharmacy photo)
  heroDesktopWebp: "/media/storefront/hero-pharmacy-retail.webp",
  heroMobileWebp: "/media/storefront/hero-pharmacy-retail.webp",
  heroFlagshipDesktopWebp: "/media/storefront/hero-pharmacy-retail.webp",
  heroFlagshipMobileWebp: "/media/storefront/hero-pharmacy-retail.webp",
  // Supporting Commercial Pharmacy Photography
  counterInteriorWebp: "/media/storefront/hero-pharmacy-retail.webp",
  careParcelWebp: "/media/storefront/pharmacy-delivery-express.webp",
  dispensingDeskWebp: "/media/storefront/pharmacist-care-desk.webp",
  conciergeSupportWebp: "/media/storefront/pharmacist-care-desk.webp",
  wellnessEssentialsWebp: "/media/storefront/pharmacy-wellness-shelf.webp",
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
      stageBg: "#FFFFFF",
      specBadge: "Medical Device",
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
      stageBg: "#FFFFFF",
      specBadge: "Surgical Supply",
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
      stageBg: "#FFFFFF",
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
      stageBg: "#FFFFFF",
      specBadge: "Personal Care",
      specBadgeTone: "warm",
    };
  }

  return {
    imageUrl: PRODUCT_3D_MEDIA.tabletsBox,
    stageBg: "#FFFFFF",
    specBadge: isRx ? "Prescription Rx" : "Healthcare",
    specBadgeTone: isRx ? "warm" : "mint",
  };
}
