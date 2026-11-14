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
  const res = await fetch(buildPublicUrl("/api/v1/public/categories"), {
    headers: buildHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.categories || [];
}

export async function fetchPublicBanners(): Promise<StorefrontBannerRecord[]> {
  const res = await fetch(buildPublicUrl("/api/v1/public/banners"), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.banners || []).map((b: StorefrontBannerRecord) => ({
    ...b,
    image_url: resolvePublicAssetUrl(b.image_url),
  }));
}

export async function fetchPublicPromotions(): Promise<StorefrontPromotionRecord[]> {
  const res = await fetch(buildPublicUrl("/api/v1/public/promotions"), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.promotions || [];
}

export async function fetchPublicDeliveryConfig(): Promise<any> {
  const res = await fetch(buildPublicUrl("/api/v1/public/delivery-config"), {
    headers: buildHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.delivery_config || null;
}

export async function fetchPublicOpeningHours(): Promise<any> {
  const res = await fetch(buildPublicUrl("/api/v1/public/opening-hours"), {
    headers: buildHeaders(),
  });
  if (!res.ok) return null;
  return await res.json();
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
}): Promise<{
  items: PublicStorefrontProduct[];
  next_cursor: string | null;
  has_more: boolean;
  stock_sync_stale?: boolean;
  last_sync_at?: string | null;
}> {
  const isSearch = Boolean(options?.search && options.search.trim());
  const endpoint = isSearch ? "/api/v1/public/products/search" : "/api/v1/public/products";
  const res = await fetch(
    buildPublicUrl(endpoint, {
      q: isSearch ? options?.search?.trim() : undefined,
      category: options?.category && options.category !== "all" ? options.category : undefined,
      cursor: options?.cursor,
      in_stock: options?.inStockOnly ? "true" : undefined,
      featured: options?.featuredOnly ? "true" : undefined,
      popular: options?.popularOnly ? "true" : undefined,
      sort: options?.sort,
      limit: String(options?.limit || 24),
    }),
    { headers: buildHeaders(), cache: "no-store" }
  );
  if (!res.ok) {
    return { items: [], next_cursor: null, has_more: false };
  }
  const data = await res.json();
  return {
    items: (data.items || []).map(normalizeProductMedia),
    next_cursor: data.next_cursor || null,
    has_more: Boolean(data.has_more),
    stock_sync_stale: Boolean(data.stock_sync_stale),
    last_sync_at: data.last_sync_at || null,
  };
}

export async function fetchPublicProductDetails(
  idOrSlug: string
): Promise<{
  product: PublicStorefrontProduct & { images?: Array<{ id: string; image_url: string; alt_text?: string }> };
  related_products: PublicStorefrontProduct[];
} | null> {
  const res = await fetch(
    buildPublicUrl(`/api/v1/public/products/${encodeURIComponent(idOrSlug)}`),
    { headers: buildHeaders(), cache: "no-store" }
  );
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
  return {
    product: normalizedProd,
    related_products: (data.related_products || []).map(normalizeProductMedia),
  };
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
