/**
 * AivraSol Storefront Platform — Input Validation, Hostname Normalization & Boundary Sanitizer
 */

import {
  FORBIDDEN_PRIVATE_POS_KEYS,
  LOCAL_DEV_BASE_DOMAINS,
  PLATFORM_PRIMARY_BASE_DOMAIN,
  RESERVED_STOREFRONT_SLUGS,
} from "./constants";

export interface SlugValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates and normalizes a pharmacy storefront slug.
 * Rules:
 * - Lowercase alphanumeric and hyphens only
 * - 3 to 42 characters
 * - Cannot start or end with a hyphen, no consecutive hyphens
 * - Cannot be in RESERVED_STOREFRONT_SLUGS
 */
export function validateStorefrontSlug(rawSlug: unknown): SlugValidationResult {
  if (typeof rawSlug !== "string") {
    return { valid: false, normalized: "", error: "Slug must be a string." };
  }
  const normalized = rawSlug.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 42) {
    return {
      valid: false,
      normalized,
      error: "Slug must be between 3 and 42 characters.",
    };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: "Slug may only contain lowercase letters, numbers, and single hyphens (cannot start or end with a hyphen).",
    };
  }
  if (RESERVED_STOREFRONT_SLUGS.has(normalized)) {
    return {
      valid: false,
      normalized,
      error: `The slug '${normalized}' is reserved by AivraSol platform infrastructure.`,
    };
  }
  return { valid: true, normalized };
}

/**
 * Normalizes an HTTP Host header or domain input:
 * - Strips port (:8787, :443, :3000)
 * - Strips trailing dots
 * - Converts to lowercase ASCII
 * - Rejects malformed hostnames, path traversal, or control characters
 */
export function normalizeHostname(rawHost: unknown): string | null {
  if (typeof rawHost !== "string") return null;
  let cleaned = rawHost.trim().toLowerCase();
  if (!cleaned) return null;

  // Strip protocol if someone passed a URL by mistake
  cleaned = cleaned.replace(/^https?:\/\//i, "");
  // Strip path or query
  cleaned = cleaned.split("/")[0].split("?")[0];
  // Strip IPv6 brackets avoidance / port
  const colonIdx = cleaned.indexOf(":");
  if (colonIdx !== -1) {
    cleaned = cleaned.slice(0, colonIdx);
  }
  // Strip trailing dots
  cleaned = cleaned.replace(/\.+$/, "");

  if (!cleaned || cleaned.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(cleaned)) return null;
  if (cleaned.includes("..")) return null;

  return cleaned;
}

/**
 * Extracts the tenant subdomain slug if the hostname belongs to the platform base domain
 * (`<slug>.aivrasol.pk`) or local development wildcard (`<slug>.localhost`, `<slug>.aivrasol.local`).
 */
export function extractSubdomainSlug(
  normalizedHost: string,
  baseDomain: string = PLATFORM_PRIMARY_BASE_DOMAIN
): { isPlatformSubdomain: boolean; slug: string | null; isRootPlatformDomain: boolean } {
  const candidates = [
    baseDomain.toLowerCase(),
    PLATFORM_PRIMARY_BASE_DOMAIN,
    ...LOCAL_DEV_BASE_DOMAINS,
  ];

  for (const base of candidates) {
    if (normalizedHost === base || normalizedHost === `www.${base}`) {
      return { isPlatformSubdomain: false, slug: null, isRootPlatformDomain: true };
    }
    const suffix = `.${base}`;
    if (normalizedHost.endsWith(suffix)) {
      let sub = normalizedHost.slice(0, normalizedHost.length - suffix.length);
      if (sub.startsWith("www.")) {
        sub = sub.slice(4);
      }
      // Single-level subdomain slug only
      if (sub && !sub.includes(".")) {
        return { isPlatformSubdomain: true, slug: sub, isRootPlatformDomain: false };
      }
    }
  }

  return { isPlatformSubdomain: false, slug: null, isRootPlatformDomain: false };
}

/**
 * Generates a URL-safe product or category slug from a name and optional SKU/ID suffix.
 */
export function toUrlSlug(name: string, suffix?: string): string {
  const base = String(name || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
  if (!suffix) return base;
  const cleanSuffix = String(suffix)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  return cleanSuffix ? `${base}-${cleanSuffix}` : base;
}

/**
 * Scans an incoming object recursively for any forbidden private POS financial/cost/Khata keys.
 * Returns the list of detected forbidden keys so the boundary can reject or strip them.
 */
export function detectForbiddenPrivateKeys(payload: unknown, pathPrefix = ""): string[] {
  const violations: string[] = [];
  if (!payload || typeof payload !== "object") return violations;

  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      violations.push(...detectForbiddenPrivateKeys(item, `${pathPrefix}[${idx}]`));
    });
    return violations;
  }

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (FORBIDDEN_PRIVATE_POS_KEYS.has(key)) {
      violations.push(fullPath);
    } else if (value && typeof value === "object") {
      violations.push(...detectForbiddenPrivateKeys(value, fullPath));
    }
  }
  return violations;
}

/**
 * Strips any forbidden private POS fields from a product object and returns a guaranteed-safe
 * public catalog projection.
 */
export function stripForbiddenPrivateFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (FORBIDDEN_PRIVATE_POS_KEYS.has(key)) continue;
    clean[key] = val;
  }
  return clean as Partial<T>;
}

/**
 * Encodes a keyset pagination cursor `(sortValue, id)` into URL-safe base64.
 */
export function encodeCursor(sortValue: string | number, id: string): string {
  const raw = JSON.stringify({ s: String(sortValue), id: String(id) });
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64url");
  }
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decodes a keyset pagination cursor back into `{ sortValue, id }`.
 */
export function decodeCursor(cursor: string | null | undefined): { sortValue: string; id: string } | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    let jsonStr: string;
    if (typeof Buffer !== "undefined") {
      jsonStr = Buffer.from(cursor, "base64url").toString("utf8");
    } else {
      const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
      jsonStr = decodeURIComponent(escape(atob(b64)));
    }
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.s === "string" && typeof parsed.id === "string") {
      return { sortValue: parsed.s, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

