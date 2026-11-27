import React from "react";

export type DepartmentVisualKind =
  | "vitamins"
  | "medicines"
  | "general"
  | "cosmetics"
  | "local"
  | "essentials"
  | "baby"
  | "surgical"
  | "liquid"
  | "herbal"
  | "dental"
  | "vet"
  | "personal"
  | "cardiac";

export interface DepartmentVisualTheme {
  kind: DepartmentVisualKind;
  displayName: string;
  subtitle: string;
  stageBg: string;
  ringBg: string;
  accentStroke: string;
  accentFill: string;
  badgeBg: string;
  badgeText: string;
}

const THEME_PALETTES: Record<
  DepartmentVisualKind,
  Omit<DepartmentVisualTheme, "kind" | "displayName" | "subtitle">
> = {
  vitamins: {
    stageBg: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#059669",
    accentFill: "#A7F3D0",
    badgeBg: "#FFFFFF",
    badgeText: "#047857",
  },
  medicines: {
    stageBg: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#2563EB",
    accentFill: "#BFDBFE",
    badgeBg: "#FFFFFF",
    badgeText: "#1D4ED8",
  },
  general: {
    stageBg: "linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#0D9488",
    accentFill: "#99F6E4",
    badgeBg: "#FFFFFF",
    badgeText: "#0F766E",
  },
  cosmetics: {
    stageBg: "linear-gradient(135deg, #FFF1F2 0%, #FCE7F3 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#DB2777",
    accentFill: "#FBCFE8",
    badgeBg: "#FFFFFF",
    badgeText: "#BE185D",
  },
  local: {
    stageBg: "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#4F46E5",
    accentFill: "#C7D2FE",
    badgeBg: "#FFFFFF",
    badgeText: "#4338CA",
  },
  essentials: {
    stageBg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#D97706",
    accentFill: "#FDE68A",
    badgeBg: "#FFFFFF",
    badgeText: "#B45309",
  },
  baby: {
    stageBg: "linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#EA580C",
    accentFill: "#FED7AA",
    badgeBg: "#FFFFFF",
    badgeText: "#C2410C",
  },
  surgical: {
    stageBg: "linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#0891B2",
    accentFill: "#A5F3FC",
    badgeBg: "#FFFFFF",
    badgeText: "#0E7490",
  },
  liquid: {
    stageBg: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#7C3AED",
    accentFill: "#DDD6FE",
    badgeBg: "#FFFFFF",
    badgeText: "#6D28D9",
  },
  herbal: {
    stageBg: "linear-gradient(135deg, #F7FEE7 0%, #ECFCCB 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#65A30D",
    accentFill: "#D9F99D",
    badgeBg: "#FFFFFF",
    badgeText: "#4D7C0F",
  },
  dental: {
    stageBg: "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#0284C7",
    accentFill: "#BAE6FD",
    badgeBg: "#FFFFFF",
    badgeText: "#0369A1",
  },
  vet: {
    stageBg: "linear-gradient(135deg, #FEFCE8 0%, #ECFCCB 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#15803D",
    accentFill: "#BBF7D0",
    badgeBg: "#FFFFFF",
    badgeText: "#166534",
  },
  personal: {
    stageBg: "linear-gradient(135deg, #FDF4FF 0%, #FAE8FF 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#C026D3",
    accentFill: "#F5D0FE",
    badgeBg: "#FFFFFF",
    badgeText: "#A21CAF",
  },
  cardiac: {
    stageBg: "linear-gradient(135deg, #FEF2F2 0%, #FFE4E6 100%)",
    ringBg: "#FFFFFF",
    accentStroke: "#E11D48",
    accentFill: "#FECDD3",
    badgeBg: "#FFFFFF",
    badgeText: "#BE123C",
  },
};

const FALLBACK_ROTATION: DepartmentVisualKind[] = [
  "general",
  "medicines",
  "essentials",
  "cosmetics",
  "local",
  "surgical",
  "liquid",
  "vitamins",
];

function formatDepartmentDisplay(rawName: string): { displayName: string; hintSubtitle?: string } {
  const trimmed = (rawName || "").trim();
  const upper = trimmed.toUpperCase();

  if (upper === "COS" || upper === "COSMETIC" || upper === "COSMETICS") {
    return { displayName: "Cosmetics", hintSubtitle: "Beauty & Skincare" };
  }
  if (upper === "HUMAN" || upper === "HUMAN MEDICINE" || upper === "HUMAN MEDICINES") {
    return { displayName: "Human Medicines", hintSubtitle: "Rx & Allopathic" };
  }
  if (upper === "KARYANA" || upper === "KIRYANA") {
    return { displayName: "Daily Essentials", hintSubtitle: "Karyana & Home" };
  }
  if (upper === "LOCAL" || upper === "LOCAL MEDICINE") {
    return { displayName: "Local Pharma", hintSubtitle: "Everyday Brands" };
  }
  if (upper === "GENERAL" || upper === "GEN" || upper === "GENERAL MEDICINE") {
    return { displayName: "General Care", hintSubtitle: "OTC & Everyday" };
  }
  if (upper === "VET" || upper === "VETERINARY") {
    return { displayName: "Veterinary", hintSubtitle: "Pet & Livestock" };
  }
  if (upper === "INJ" || upper === "INJECTION" || upper === "INJECTIONS") {
    return { displayName: "Injections", hintSubtitle: "Ampoules & Vials" };
  }
  if (upper === "SURGICAL" || upper === "SURGICALS") {
    return { displayName: "Surgical Supplies", hintSubtitle: "Sterile & Devices" };
  }
  if (upper === "OTC") {
    return { displayName: "OTC & Relief", hintSubtitle: "Over-the-Counter" };
  }
  // Format pure ALL-CAPS labels cleanly to Title Case while preserving short acronyms
  if (trimmed.length > 3 && trimmed === upper && /^[A-Z0-9\s&/-]+$/.test(trimmed)) {
    const titleCased = trimmed
      .toLowerCase()
      .replace(/(^|[\s&/-])([a-z])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
    return { displayName: titleCased };
  }
  return { displayName: trimmed };
}

function classifyDepartment(rawName: string): { kind: DepartmentVisualKind | null; subtitle: string } {
  const k = (rawName || "").toLowerCase().trim();

  if (/\b(vitamin|supplement|nutri|wellness|calcium|mineral|protein|tonic|multivit)\b/.test(k)) {
    return { kind: "vitamins", subtitle: "Daily Nutrition" };
  }
  if (/\b(cos|cosmetic|beauty|skin|derma|makeup|cream|lotion|serum|sunblock|face|hair)\b/.test(k)) {
    return { kind: "cosmetics", subtitle: "Beauty & Skincare" };
  }
  if (/\b(karyana|kiryana|grocery|food|snack|water|drink|beverage|consumer|mart|daily|tea|milk powder)\b/.test(k)) {
    return { kind: "essentials", subtitle: "Home & Everyday" };
  }
  if (/\b(baby|mother|infant|diaper|pamper|child|kid|maternity|feeder|pacifier|formula)\b/.test(k)) {
    return { kind: "baby", subtitle: "Mother & Baby" };
  }
  if (/\b(surgical|device|equipment|diagnostic|syringe|bandage|gauze|cannula|drip|first aid|nebul|bp|gluco)\b/.test(k)) {
    return { kind: "surgical", subtitle: "Sterile & Devices" };
  }
  if (/\b(human|pharma|medicine|rx|prescription|antibiotic|tablet|capsule|allopathic|inj|injection)\b/.test(k)) {
    return { kind: "medicines", subtitle: "Counter Medicines" };
  }
  if (/\b(local|national|generic|standard|wholesale)\b/.test(k)) {
    return { kind: "local", subtitle: "Trusted Local Brands" };
  }
  if (/\b(syrup|liquid|drop|eye|ear|nasal|suspension|elixir|sachet)\b/.test(k)) {
    return { kind: "liquid", subtitle: "Syrups & Drops" };
  }
  if (/\b(herbal|unani|homeo|natural|organic|ayurved)\b/.test(k)) {
    return { kind: "herbal", subtitle: "Natural & Herbal" };
  }
  if (/\b(dental|oral|tooth|mouth|paste|brush)\b/.test(k)) {
    return { kind: "dental", subtitle: "Oral Hygiene" };
  }
  if (/\b(vet|veterinary|pet|animal|poultry|cattle)\b/.test(k)) {
    return { kind: "vet", subtitle: "Animal Health" };
  }
  if (/\b(personal|hygiene|soap|shampoo|wash|perfume|deo|sanitiz|tissue)\b/.test(k)) {
    return { kind: "personal", subtitle: "Personal Hygiene" };
  }
  if (/\b(heart|cardiac|diabet|sugar|bp|chronic|pain|fever)\b/.test(k)) {
    return { kind: "cardiac", subtitle: "Chronic Care" };
  }
  if (/\b(general|gen|otc|misc|other|health|care)\b/.test(k)) {
    return { kind: "general", subtitle: "Everyday Healthcare" };
  }
  return { kind: null, subtitle: "Pharmacy Counter" };
}

/**
 * Resolves visually distinct, curated department cards across an entire list so
 * neighboring cards NEVER show repetitive identical icons.
 */
export function resolveDepartmentThemes(categoryNames: string[]): DepartmentVisualTheme[] {
  const usedKinds = new Set<DepartmentVisualKind>();
  let fallbackCursor = 0;

  return categoryNames.map((rawName) => {
    const { displayName, hintSubtitle } = formatDepartmentDisplay(rawName);
    const matched = classifyDepartment(rawName);
    let kind: DepartmentVisualKind;

    if (matched.kind && !usedKinds.has(matched.kind)) {
      kind = matched.kind;
    } else if (matched.kind && usedKinds.size >= FALLBACK_ROTATION.length) {
      kind = matched.kind;
    } else {
      // Pick the first unused distinct visual from the rotation pool
      let chosen: DepartmentVisualKind =
        matched.kind || FALLBACK_ROTATION[fallbackCursor % FALLBACK_ROTATION.length];
      if (usedKinds.has(chosen)) {
        for (let step = 0; step < FALLBACK_ROTATION.length; step++) {
          const candidate = FALLBACK_ROTATION[(fallbackCursor + step) % FALLBACK_ROTATION.length];
          if (!usedKinds.has(candidate)) {
            chosen = candidate;
            fallbackCursor = (fallbackCursor + step + 1) % FALLBACK_ROTATION.length;
            break;
          }
        }
      } else {
        fallbackCursor = (fallbackCursor + 1) % FALLBACK_ROTATION.length;
      }
      kind = chosen;
    }

    usedKinds.add(kind);
    const palette = THEME_PALETTES[kind];

    return {
      kind,
      displayName,
      subtitle: hintSubtitle || matched.subtitle,
      ...palette,
    };
  });
}

export function DepartmentEmblemSvg({
  kind,
  stroke,
  fill,
  className = "w-8 h-8 sm:w-9 sm:h-9",
}: {
  kind: DepartmentVisualKind;
  stroke: string;
  fill: string;
  className?: string;
}) {
  switch (kind) {
    case "vitamins":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="9" y="10" width="14" height="20" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="11" y="5" width="10" height="5" rx="1.8" fill="#FFFFFF" stroke={stroke} strokeWidth="2" />
          <path d="M16 16v8M12 20h8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M26 27c4.5-1 6-5.5 5-10-4.5 1-6 5.5-5 10Z" fill={fill} stroke={stroke} strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      );
    case "medicines":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M18 4 30 9v8.5c0 7.2-5 12.2-12 14.5-7-2.3-12-7.3-12-14.5V9l12-5Z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M18 12v10M13 17h10" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case "general":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="5" y="11" width="26" height="19" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M13 11V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" stroke={stroke} strokeWidth="2" />
          <path d="M18 16v9M13.5 20.5h9" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "cosmetics":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="11" y="13" width="14" height="17" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M14 13V9.5A2.5 2.5 0 0 1 16.5 7h3A2.5 2.5 0 0 1 22 9.5V13" stroke={stroke} strokeWidth="2" />
          <path d="M18 5v2M27 7l1 2.2L30.2 10 28 11l-1 2.2L26 11l-2.2-1L26 9.2 27 7Z" fill={stroke} />
          <circle cx="18" cy="21.5" r="3" fill="#FFFFFF" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case "local":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="6" y="7" width="24" height="22" rx="4.5" fill={fill} stroke={stroke} strokeWidth="2" />
          <circle cx="13" cy="14" r="2.6" fill="#FFFFFF" stroke={stroke} strokeWidth="1.8" />
          <circle cx="23" cy="14" r="2.6" fill="#FFFFFF" stroke={stroke} strokeWidth="1.8" />
          <circle cx="13" cy="22" r="2.6" fill="#FFFFFF" stroke={stroke} strokeWidth="1.8" />
          <circle cx="23" cy="22" r="2.6" fill="#FFFFFF" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case "essentials":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M6 15h24l-2.4 13.5a2.5 2.5 0 0 1-2.5 2H10.9a2.5 2.5 0 0 1-2.5-2L6 15Z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 15 15.5 7M24 15 20.5 7" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M14 20v5M18 20v5M22 20v5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "baby":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="11" y="13" width="14" height="17" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M13 13v-2.5h10V13" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M15.5 10.5V8a2.5 2.5 0 0 1 5 0v2.5" stroke={stroke} strokeWidth="2" />
          <path d="M15 20.5h6M15 24.5h4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "surgical":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M11 6v9a7 7 0 0 0 14 0V6" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M18 22v4a5 5 0 0 0 10 0v-4" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="28" cy="19" r="3" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M9 6h4M23 6h4" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "liquid":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M18 6C18 6 9 16.2 9 22a9 9 0 0 0 18 0c0-5.8-9-16-9-16Z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M14.5 23.5a3.5 3.5 0 0 0 3.5 3.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "herbal":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M8 27C8 15 16 8 29 7c-1 13-8 21-21 20Z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 27c5-5 10-9.5 16-14" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "dental":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M12.5 7C9 7 7 10 7.5 14c.5 4 2 8 3 13 .5 2.5 2.5 2.5 3.5 0l2-5.5c.6-1.5 3.4-1.5 4 0l2 5.5c1 2.5 3 2.5 3.5 0 1-5 2.5-9 3-13 .5-4-1.5-7-5-7-2.3 0-3.8 1.2-5.5 1.2S14.8 7 12.5 7Z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "vet":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <circle cx="11" cy="14" r="2.8" fill={fill} stroke={stroke} strokeWidth="1.9" />
          <circle cx="18" cy="10.5" r="2.8" fill={fill} stroke={stroke} strokeWidth="1.9" />
          <circle cx="25" cy="14" r="2.8" fill={fill} stroke={stroke} strokeWidth="1.9" />
          <path d="M12 24.5c0-3.2 2.7-6 6-6s6 2.8 6 6c0 2.5-1.8 4-6 4s-6-1.5-6-4Z" fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case "personal":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect x="10" y="14" width="16" height="16" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M18 14V8M14 8h9l2 2" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="18" cy="22" r="3" fill="#FFFFFF" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case "cardiac":
      return (
        <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M18 30s-11-7-11-15.2A6.5 6.5 0 0 1 18 10a6.5 6.5 0 0 1 11 4.8C29 23 18 30 18 30Z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M11.5 18h3.5l1.8-3.5 2.4 7 1.8-3.5h3.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
