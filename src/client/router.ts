/**
 * Lightweight History API Router for Multi-Tenant Pharmacy Storefront
 *
 * Preserves multi-tenant routing prefixes (`/s/:slug`) and preview query params
 * (`?store=`, `?hostname=`, `?__host=`) across every pushState / replaceState,
 * while encoding Catalog filters and Product slugs cleanly in the URL so
 * Browser Back, Reload (F5), and shared links work reliably with zero filter loss.
 */

import type { StorefrontView } from "./types-ui";

const SLUG_PREFIX_RE = /^\/s\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(?=\/|$)/i;

const STATIC_VIEW_PATHS = new Set<StorefrontView>([
  "checkout",
  "track",
  "about",
  "branches",
  "delivery",
  "hours",
  "contact",
  "privacy",
  "terms",
]);

export interface CatalogFilterState {
  searchQuery: string;
  selectedCategory: string;
  selectedDosageForm: string;
  inStockOnly: boolean;
  sortBy: string;
}

export interface ParsedStorefrontRoute {
  view: StorefrontView;
  productSlug: string | null;
  filters: CatalogFilterState;
  trackOrder: string;
}

export interface StorefrontHistoryState {
  view: StorefrontView;
  productSlug?: string | null;
  fromView?: StorefrontView | null;
  scrollY?: number;
  filters?: CatalogFilterState;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  searchQuery: "",
  selectedCategory: "all",
  selectedDosageForm: "all",
  inStockOnly: false,
  sortBy: "featured",
};

export function getStorefrontBasePath(pathname: string): string {
  const match = pathname.match(SLUG_PREFIX_RE);
  return match ? `/s/${match[1].toLowerCase()}` : "";
}

export function stripStorefrontBasePath(pathname: string): string {
  const base = getStorefrontBasePath(pathname);
  const rest = base ? pathname.slice(base.length) : pathname;
  const trimmed = rest.replace(/\/+$/, "");
  return trimmed || "/";
}

export function parseStorefrontRoute(loc?: Location): ParsedStorefrontRoute {
  if (typeof window === "undefined" && !loc) {
    return {
      view: "home",
      productSlug: null,
      filters: { ...DEFAULT_CATALOG_FILTERS },
      trackOrder: "",
    };
  }
  const target = loc || window.location;
  const subPath = stripStorefrontBasePath(target.pathname);
  const params = new URLSearchParams(target.search);

  const rawSort = (params.get("sort") || "featured").trim();
  const validSort =
    rawSort === "name_asc" || rawSort === "price_asc" || rawSort === "price_desc"
      ? rawSort
      : "featured";

  const filters: CatalogFilterState = {
    searchQuery: (params.get("q") || "").trim(),
    selectedCategory: (params.get("category") || "all").trim() || "all",
    selectedDosageForm: (params.get("form") || "all").trim() || "all",
    inStockOnly: params.get("stock") === "1" || params.get("in_stock") === "true",
    sortBy: validSort,
  };

  const trackOrder = (params.get("order") || "").trim().toUpperCase();

  if (subPath === "/" || subPath === "/home") {
    return { view: "home", productSlug: null, filters, trackOrder };
  }

  if (subPath === "/catalog" || subPath === "/shop" || subPath === "/medicines") {
    return { view: "shop", productSlug: null, filters, trackOrder };
  }

  const prodMatch = subPath.match(/^\/product\/([^/]+)$/i);
  if (prodMatch?.[1]) {
    let decoded = prodMatch[1];
    try {
      decoded = decodeURIComponent(prodMatch[1]);
    } catch {
      // keep raw segment
    }
    return { view: "product", productSlug: decoded, filters, trackOrder };
  }

  if (subPath === "/cart") {
    return { view: "checkout", productSlug: null, filters, trackOrder };
  }

  const bareSegment = subPath.slice(1).toLowerCase() as StorefrontView;
  if (STATIC_VIEW_PATHS.has(bareSegment)) {
    return { view: bareSegment, productSlug: null, filters, trackOrder };
  }

  return { view: "home", productSlug: null, filters, trackOrder };
}

export function buildStorefrontUrl(opts: {
  view: StorefrontView;
  productSlug?: string | null;
  filters?: Partial<CatalogFilterState>;
  trackOrder?: string;
}): string {
  if (typeof window === "undefined") return "/";

  const basePath = getStorefrontBasePath(window.location.pathname);
  const currentParams = new URLSearchParams(window.location.search);
  const nextParams = new URLSearchParams();

  // Always preserve multi-tenant preview overrides if present
  const storeParam = currentParams.get("store");
  if (storeParam && !basePath) {
    nextParams.set("store", storeParam);
  }
  const hostnameParam = currentParams.get("hostname");
  if (hostnameParam) {
    nextParams.set("hostname", hostnameParam);
  }
  const devHostParam = currentParams.get("__host");
  if (devHostParam) {
    nextParams.set("__host", devHostParam);
  }

  let subPath = "";
  switch (opts.view) {
    case "home":
      subPath = "";
      break;
    case "shop": {
      subPath = "/catalog";
      const f = opts.filters;
      if (f?.searchQuery && f.searchQuery.trim()) {
        nextParams.set("q", f.searchQuery.trim());
      }
      if (f?.selectedCategory && f.selectedCategory !== "all") {
        nextParams.set("category", f.selectedCategory);
      }
      if (f?.selectedDosageForm && f.selectedDosageForm !== "all") {
        nextParams.set("form", f.selectedDosageForm);
      }
      if (f?.inStockOnly) {
        nextParams.set("stock", "1");
      }
      if (f?.sortBy && f.sortBy !== "featured") {
        nextParams.set("sort", f.sortBy);
      }
      break;
    }
    case "product": {
      const slug = (opts.productSlug || "").trim();
      subPath = slug ? `/product/${encodeURIComponent(slug)}` : "/catalog";
      break;
    }
    case "cart":
    case "checkout":
      subPath = "/checkout";
      break;
    case "track":
      subPath = "/track";
      if (opts.trackOrder && opts.trackOrder.trim()) {
        nextParams.set("order", opts.trackOrder.trim().toUpperCase());
      }
      break;
    default:
      subPath = `/${opts.view}`;
      break;
  }

  const fullPath = `${basePath}${subPath}` || "/";
  const qs = nextParams.toString();
  return qs ? `${fullPath}?${qs}` : fullPath;
}

export function buildCatalogFilterKey(opts: {
  category: string;
  search: string;
  inStockOnly: boolean;
  sort: string;
}): string {
  return JSON.stringify([
    (opts.category || "all").toLowerCase(),
    (opts.search || "").trim().toLowerCase(),
    Boolean(opts.inStockOnly),
    opts.sort || "featured",
  ]);
}
