import type React from "react";
import type {
  StorefrontBrandingRecord,
  StorefrontCategoryRecord,
  StorefrontPublicContext,
  StorefrontRecord,
} from "../../shared/types";

export const DEFAULT_CLINICAL_PRIMARY = "#0E5146";
export const DEFAULT_CLINICAL_TEAL = "#087E78";
export const DEFAULT_WARM_ACCENT = "#E6A65B";
export const DEFAULT_SOFT_MINT = "#E9F5F1";
export const DEFAULT_WARM_IVORY = "#FFF8ED";
export const DEFAULT_DARK_INK = "#172B36";
export const DEFAULT_MUTED_SLATE = "#607481";

// Previous system-seeded defaults that were auto-generated (not custom owner brand picks)
const LEGACY_SEEDED_PRIMARIES = new Set(["#176B58", "#059669", "#10B981"]);
const LEGACY_SEEDED_ACCENTS = new Set(["#0D9488", "#14B8A6"]);

const HEX_SHORT_RE = /^#([0-9a-fA-F]{3})$/;
const HEX_FULL_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(raw: string | null | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  const shortMatch = trimmed.match(HEX_SHORT_RE);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (HEX_FULL_RE.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(r1 * (1 - w) + r2 * w, g1 * (1 - w) + g2 * w, b1 * (1 - w) + b2 * w);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getAccessibleForeground(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.42 ? "#172B36" : "#FFFFFF";
}

export function getReadableBrandInk(primaryHex: string): string {
  const lum = relativeLuminance(primaryHex);
  if (lum > 0.32) {
    return mixHex(primaryHex, "#0B222D", 0.48);
  }
  return primaryHex;
}

/**
 * Ensures hero/footer deep brand surfaces always achieve strong WCAG AA/AAA contrast
 * against white/ivory text even if a pharmacy owner picks a bright custom primary color.
 */
export function getDeepEditorialSurface(primaryHex: string): string {
  if (primaryHex === DEFAULT_CLINICAL_PRIMARY) return DEFAULT_CLINICAL_PRIMARY;
  const lum = relativeLuminance(primaryHex);
  if (lum > 0.18) {
    return mixHex(primaryHex, "#08222B", 0.52);
  }
  if (lum > 0.1) {
    return mixHex(primaryHex, "#08222B", 0.28);
  }
  return primaryHex;
}

export function buildTenantThemeVars(
  branding?: StorefrontBrandingRecord | null
): React.CSSProperties {
  const rawPrimary = normalizeHexColor(branding?.primary_color, DEFAULT_CLINICAL_PRIMARY);
  const isDefaultPalette = LEGACY_SEEDED_PRIMARIES.has(rawPrimary) || rawPrimary === DEFAULT_CLINICAL_PRIMARY;
  const primary = isDefaultPalette ? DEFAULT_CLINICAL_PRIMARY : rawPrimary;

  const rawAccent = normalizeHexColor(branding?.accent_color, DEFAULT_CLINICAL_TEAL);
  const teal =
    LEGACY_SEEDED_ACCENTS.has(rawAccent) || rawAccent === DEFAULT_CLINICAL_TEAL
      ? DEFAULT_CLINICAL_TEAL
      : rawAccent;

  const deepSurface = getDeepEditorialSurface(primary);
  const footerSurface =
    primary === DEFAULT_CLINICAL_PRIMARY
      ? "#08352E"
      : mixHex(deepSurface, "#071821", 0.42);

  const hover = mixHex(primary, "#061E1A", 0.2);
  const soft =
    primary === DEFAULT_CLINICAL_PRIMARY
      ? DEFAULT_SOFT_MINT
      : mixHex(primary, "#FFFFFF", 0.9);
  const border =
    primary === DEFAULT_CLINICAL_PRIMARY
      ? "#C5DFD7"
      : mixHex(primary, "#FFFFFF", 0.74);
  const fg = getAccessibleForeground(primary);
  const ink = getReadableBrandInk(primary);

  return {
    "--sf-primary": primary,
    "--sf-primary-hover": hover,
    "--sf-primary-soft": soft,
    "--sf-primary-border": border,
    "--sf-primary-fg": fg,
    "--sf-primary-ink": ink,
    "--sf-forest": deepSurface,
    "--sf-forest-deep": footerSurface,
    "--sf-teal": teal,
    "--sf-accent": teal,
    "--sf-mint": soft,
    "--sf-ivory": DEFAULT_WARM_IVORY,
    "--sf-warm-accent": DEFAULT_WARM_ACCENT,
    "--sf-ink": DEFAULT_DARK_INK,
    "--sf-slate": DEFAULT_MUTED_SLATE,
  } as React.CSSProperties;
}

/**
 * Resolves the authoritative customer-facing pharmacy name.
 * Priority:
 * 1. Owner-approved website branding display_name (if configured and non-empty)
 * 2. Verified pharmacy business name on the storefront tenant record
 */
export function resolvePharmacyDisplayName(
  sf: StorefrontPublicContext | Partial<StorefrontRecord> | null | undefined,
  branding?: StorefrontBrandingRecord | null
): string {
  const brandDisplay = branding?.display_name?.trim();
  const verifiedPharmacy = sf?.pharmacy_name?.trim();
  if (brandDisplay) return brandDisplay;
  if (verifiedPharmacy) return verifiedPharmacy;
  return "Community Pharmacy";
}

export function getPharmacyMonogram(displayName: string): string {
  const words = displayName
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "RX";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  if (words[0].length === 2 && words[0] === words[0].toUpperCase()) {
    return words[0];
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

const PLACEHOLDER_TOKENS = new Set([
  "0",
  "00",
  "000",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "nil",
]);

/**
 * Cleans POS metadata fields so raw placeholder entries such as "00" or "N/A"
 * are never displayed to customers as medicine strength, generic salt, or brand.
 */
export function cleanProductText(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_TOKENS.has(trimmed.toLowerCase())) return null;
  if (/^0+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Filters out raw numeric/placeholder POS category codes (such as "00").
 */
export function isMeaningfulCategory(cat: StorefrontCategoryRecord): boolean {
  const name = cleanProductText(cat.name);
  if (!name) return false;
  if (/^\d+$/.test(name)) return false;
  return true;
}

const UNVERIFIED_REGULATORY_RE =
  /\b(drap|pharmacy council|100%\s*authentic|licensed community pharmacy|registered pharmacist on duty)\b/i;

/**
 * Prevents unverified regulatory/compliance claims from appearing on public pages
 * unless backed by verified pharmacy license/pharmacist records.
 */
export function sanitizePublicCopy(
  text: string | null | undefined,
  sf: StorefrontPublicContext | Partial<StorefrontRecord> | null | undefined,
  fallback: string
): string {
  const trimmed = text?.trim();
  if (!trimmed) return fallback;
  const hasLicense = Boolean(sf?.drug_sale_license_no && sf.drug_sale_license_no.trim());
  const hasPharmacist = Boolean(sf?.pharmacist_name && sf.pharmacist_name.trim());
  if (!hasLicense && !hasPharmacist && UNVERIFIED_REGULATORY_RE.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
