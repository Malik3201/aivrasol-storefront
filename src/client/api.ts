/**
 * Storefront Client API Helper
 * Resolves tenant strictly via Host header (or ?hostname= / ?__host= override in local dev preview).
 */

import type {
  DomainResolutionResponse,
  PublicStorefrontProduct,
  StorefrontBannerRecord,
  StorefrontCategoryRecord,
  StorefrontOrderRecord,
  StorefrontPromotionRecord,
} from "../shared/types";

const SLUG_PATH_RE = /^\/s\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(?:\/|$)/i;

// Lightweight tenant-safe in-memory TTL cache to eliminate redundant fetches on Back / filter switches
interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const CLIENT_CACHE_MAX = 80;
const clientCache = new Map<string, CacheEntry<any>>();

function readCache<T>(key: string): T | undefined {
  const entry = clientCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    clientCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function writeCache<T>(key: string, value: T, ttlMs: number): void {
  if (clientCache.size >= CLIENT_CACHE_MAX) {
    const oldestKey = clientCache.keys().next().value;
    if (oldestKey) clientCache.delete(oldestKey);
  }
  clientCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function clearStorefrontProductCache(): void {
  for (const key of clientCache.keys()) {
    if (key.includes("/api/v1/public/products")) {
      clientCache.delete(key);
    }
  }
}

export function getActiveStoreSlug(): string | null {
  if (typeof window === "undefined") return null;
  const pathMatch = window.location.pathname.match(SLUG_PATH_RE);
  if (pathMatch?.[1]) return pathMatch[1].toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const storeParam = params.get("store")?.trim();
  if (storeParam) return storeParam.toLowerCase();
  return null;
}

export function getEffectiveTargetHost(): string {
  if (typeof window === "undefined") return "localhost";
  const slug = getActiveStoreSlug();
  if (slug) return `${slug} (${window.location.host})`;
  const params = new URLSearchParams(window.location.search);
  const override = params.get("hostname") || params.get("__host");
  if (override && override.trim()) {
    return override.trim().toLowerCase();
  }
  return window.location.host;
}

function buildPublicUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path, window.location.origin);
  const storeSlug = getActiveStoreSlug();
  if (storeSlug) {
    url.searchParams.set("store", storeSlug);
  }
  const params = new URLSearchParams(window.location.search);
  const hostOverride = params.get("hostname") || params.get("__host");
  if (hostOverride) {
    url.searchParams.set("hostname", hostOverride);
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }
  return url.toString();
}

function buildHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra || {}),
  };
  const storeSlug = getActiveStoreSlug();
  if (storeSlug) {
    headers["X-Storefront-Slug"] = storeSlug;
  }
  const params = new URLSearchParams(window.location.search);
  const hostOverride = params.get("hostname") || params.get("__host");
  if (hostOverride) {
    headers["X-Storefront-Host"] = hostOverride;
  }
  return headers;
}

export function resolvePublicAssetUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  if (!rawUrl.startsWith("/api/v1/public/media/")) return rawUrl;
  if (typeof window === "undefined") return rawUrl;
  const storeSlug = getActiveStoreSlug();
  const params = new URLSearchParams(window.location.search);
  const hostOverride = params.get("hostname") || params.get("__host");
  if (!storeSlug && !hostOverride) return rawUrl;
  const u = new URL(rawUrl, window.location.origin);
  if (storeSlug) u.searchParams.set("store", storeSlug);
  if (hostOverride) u.searchParams.set("hostname", hostOverride);
  return u.toString();
}

function normalizeProductMedia(p: PublicStorefrontProduct): PublicStorefrontProduct {
  return {
    ...p,
    primary_image_url: resolvePublicAssetUrl(p.primary_image_url),
  };
}

export async function fetchStorefrontResolution(): Promise<{
  httpStatus: number;
  data: DomainResolutionResponse;
}> {
  const res = await fetch(buildPublicUrl("/api/v1/public/resolve"), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  const data = (await res.json()) as DomainResolutionResponse;
  if (data?.branding) {
    data.branding = {
      ...data.branding,
      logo_url: resolvePublicAssetUrl(data.branding.logo_url),
      hero_image_url: resolvePublicAssetUrl(data.branding.hero_image_url),
      favicon_url: resolvePublicAssetUrl(data.branding.favicon_url),
    };
  }
  return { httpStatus: res.status, data };
}

export async function fetchPublicSettings(): Promise<any> {
  const res = await fetch(buildPublicUrl("/api/v1/public/settings"), {
    headers: buildHeaders(),
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchPublicCategories(): Promise<StorefrontCategoryRecord[]> {
  const url = buildPublicUrl("/api/v1/public/categories");
  const cached = readCache<StorefrontCategoryRecord[]>(url);
  if (cached) return cached;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  const categories = (data.categories || []) as StorefrontCategoryRecord[];
  writeCache(url, categories, 180_000);
  return categories;
}

export async function fetchPublicBanners(): Promise<StorefrontBannerRecord[]> {
  const url = buildPublicUrl("/api/v1/public/banners");
  const cached = readCache<StorefrontBannerRecord[]>(url);
  if (cached) return cached;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  const banners = (data.banners || []).map((b: StorefrontBannerRecord) => ({
    ...b,
    image_url: resolvePublicAssetUrl(b.image_url),
  }));
  writeCache(url, banners, 180_000);
  return banners;
}

export async function fetchPublicPromotions(
  bypassCache = false
): Promise<StorefrontPromotionRecord[]> {
  const url = buildPublicUrl("/api/v1/public/promotions");
  if (!bypassCache) {
    const cached = readCache<StorefrontPromotionRecord[]>(url);
    if (cached) return cached;
  }
  const res = await fetch(url, {
    headers: buildHeaders(),
    ...(bypassCache ? { cache: "no-store" as RequestCache } : {}),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const promotions = (data.promotions || []) as StorefrontPromotionRecord[];
  writeCache(url, promotions, 120_000);
  return promotions;
}

export async function fetchPublicDeliveryConfig(): Promise<any> {
  const url = buildPublicUrl("/api/v1/public/delivery-config");
  const cached = readCache<any>(url);
  if (cached !== undefined) return cached;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const config = data.delivery_config || null;
  writeCache(url, config, 180_000);
  return config;
}

export async function fetchPublicOpeningHours(): Promise<any> {
  const url = buildPublicUrl("/api/v1/public/opening-hours");
  const cached = readCache<any>(url);
  if (cached !== undefined) return cached;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) return null;
  const parsed = await res.json();
  writeCache(url, parsed, 180_000);
  return parsed;
}

export async function fetchPublicProducts(options?: {
  category?: string;
  search?: string;
  cursor?: string;
  inStockOnly?: boolean;
  featuredOnly?: boolean;
  popularOnly?: boolean;
  sort?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{
  items: PublicStorefrontProduct[];
  next_cursor: string | null;
  has_more: boolean;
  stock_sync_stale?: boolean;
  last_sync_at?: string | null;
}> {
  const isSearch = Boolean(options?.search && options.search.trim());
  const endpoint = isSearch ? "/api/v1/public/products/search" : "/api/v1/public/products";
  const url = buildPublicUrl(endpoint, {
    q: isSearch ? options?.search?.trim() : undefined,
    category: options?.category && options.category !== "all" ? options.category : undefined,
    cursor: options?.cursor,
    in_stock: options?.inStockOnly ? "true" : undefined,
    featured: options?.featuredOnly ? "true" : undefined,
    popular: options?.popularOnly ? "true" : undefined,
    sort: options?.sort,
    limit: String(options?.limit || 24),
  });

  const cached = readCache<{
    items: PublicStorefrontProduct[];
    next_cursor: string | null;
    has_more: boolean;
    stock_sync_stale?: boolean;
    last_sync_at?: string | null;
  }>(url);
  if (cached) return cached;

  const res = await fetch(url, {
    headers: buildHeaders(),
    signal: options?.signal,
  });
  if (!res.ok) {
    return { items: [], next_cursor: null, has_more: false };
  }
  const data = await res.json();
  const payload = {
    items: (data.items || []).map(normalizeProductMedia),
    next_cursor: data.next_cursor || null,
    has_more: Boolean(data.has_more),
    stock_sync_stale: Boolean(data.stock_sync_stale),
    last_sync_at: data.last_sync_at || null,
  };
  writeCache(url, payload, 90_000);
  return payload;
}

export async function fetchPublicProductDetails(
  idOrSlug: string
): Promise<{
  product: PublicStorefrontProduct & { images?: Array<{ id: string; image_url: string; alt_text?: string }> };
  related_products: PublicStorefrontProduct[];
} | null> {
  const url = buildPublicUrl(`/api/v1/public/products/${encodeURIComponent(idOrSlug)}`);
  const cached = readCache<{
    product: PublicStorefrontProduct & { images?: Array<{ id: string; image_url: string; alt_text?: string }> };
    related_products: PublicStorefrontProduct[];
  }>(url);
  if (cached) return cached;

  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.product) return null;
  const normalizedProd = {
    ...normalizeProductMedia(data.product),
    ...(Array.isArray(data.product.images)
      ? {
          images: data.product.images.map((img: any) => ({
            ...img,
            image_url: resolvePublicAssetUrl(img.image_url) || img.image_url,
          })),
        }
      : {}),
  };
  const result = {
    product: normalizedProd,
    related_products: (data.related_products || []).map(normalizeProductMedia),
  };
  writeCache(url, result, 180_000);
  return result;
}

export interface SubmitPublicOrderInput {
  idempotency_key: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  fulfillment_type: "delivery" | "pickup";
  delivery_address?: string;
  delivery_city?: string;
  delivery_instructions?: string;
  delivery_zone_id?: string;
  branch_id?: string;
  payment_method: "cod" | "bank_transfer" | "counter_pay";
  customer_notes?: string;
  rx_acknowledged?: boolean;
  rx_inquiry_note?: string;
  promo_code?: string;
  items: Array<{
    product_id: string;
    qty: number;
    selling_unit_id?: string;
    selling_unit_name?: string;
  }>;
}

export async function submitPublicOrder(input: SubmitPublicOrderInput): Promise<{
  ok: boolean;
  duplicate?: boolean;
  invoice_email_queued?: boolean;
  order?: StorefrontOrderRecord & { applied_promo_code?: string | null };
  error?: string;
  message?: string;
}> {
  const res = await fetch(buildPublicUrl("/api/v1/public/orders"), {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (res.ok && data.ok) {
    clearStorefrontProductCache();
  }
  return {
    ok: Boolean(res.ok && data.ok),
    duplicate: data.duplicate,
    invoice_email_queued: Boolean(data.invoice_email_queued),
    order: data.order,
    error: data.error,
    message: data.message,
  };
}

export async function trackPublicOrder(params: {
  orderNumber: string;
  phone?: string;
  token?: string;
}): Promise<{
  ok: boolean;
  order?: any;
  error?: string;
  message?: string;
}> {
  const res = await fetch(
    buildPublicUrl("/api/v1/public/orders/track", {
      order_number: params.orderNumber.trim(),
      phone: params.phone?.trim(),
      token: params.token?.trim(),
    }),
    { headers: buildHeaders(), cache: "no-store" }
  );
  const data = await res.json();
  return {
    ok: Boolean(res.ok && data.ok),
    order: data.order,
    error: data.error,
    message: data.message,
  };
}
