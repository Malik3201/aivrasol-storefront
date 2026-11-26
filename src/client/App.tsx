import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DomainResolutionResponse,
  PublicStorefrontProduct,
  StorefrontBannerRecord,
  StorefrontCategoryRecord,
  StorefrontOrderRecord,
  StorefrontPromotionRecord,
} from "../shared/types";
import {
  fetchPublicBanners,
  fetchPublicCategories,
  fetchPublicDeliveryConfig,
  fetchPublicProductDetails,
  fetchPublicProducts,
  fetchPublicPromotions,
  fetchStorefrontResolution,
  getEffectiveTargetHost,
  submitPublicOrder,
  trackPublicOrder,
} from "./api";
import { CartDrawer } from "./components/CartDrawer";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  PharmacyCrossIcon,
  PhoneIcon,
} from "./components/Icons";
import { ProductCard } from "./components/ProductCard";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import {
  buildTenantThemeVars,
  cleanProductText,
  getPharmacyMonogram,
  resolvePharmacyDisplayName,
} from "./design/theme";
import {
  buildCatalogFilterKey,
  buildStorefrontUrl,
  parseStorefrontRoute,
  type CatalogFilterState,
  type StorefrontHistoryState,
} from "./router";
import type { CartItem, ResolvedSellingUnit, StorefrontView } from "./types-ui";
import { CatalogView } from "./views/CatalogView";
import { CheckoutView } from "./views/CheckoutView";
import { HomeView } from "./views/HomeView";
import { InfoPagesView, OrderTrackingView } from "./views/InfoPagesView";
import { ProductDetailView, QuickProductModal } from "./views/ProductDetailView";

export type { CartItem, ResolvedSellingUnit, StorefrontView };

function getProductSellingUnits(prod: PublicStorefrontProduct): ResolvedSellingUnit[] {
  const isOut =
    prod.availability_status === "out_of_stock" || prod.availability_status === "unavailable";
  const rawAvailBase =
    prod.available_base_qty !== undefined && prod.available_base_qty !== null
      ? Number(prod.available_base_qty)
      : undefined;

  if (Array.isArray(prod.selling_units) && prod.selling_units.length > 0) {
    const valid = prod.selling_units
      .filter((u: any) => {
        if (!u || typeof u !== "object") return false;
        const nm = String(u.unit_name || u.name || "").trim();
        const mult = Number(u.multiplier);
        const price = Number(u.price_pkr);
        return (
          nm.length > 0 &&
          Number.isFinite(mult) &&
          mult > 0 &&
          Number.isFinite(price) &&
          price > 0
        );
      })
      .map((u: any) => {
        const cleanName = String(u.unit_name || u.name).trim();
        const mult = Number(u.multiplier);
        const computedAvailUnit =
          u.available_unit_qty !== undefined && u.available_unit_qty !== null
            ? Math.max(0, Math.floor(Number(u.available_unit_qty)))
            : rawAvailBase !== undefined && Number.isFinite(rawAvailBase)
              ? Math.max(0, Math.floor((rawAvailBase + 1e-9) / Math.max(0.0001, mult)))
              : undefined;
        const inStock =
          isOut || (computedAvailUnit !== undefined && computedAvailUnit < 1)
            ? false
            : u.in_stock !== false;
        return {
          ...u,
          unit_id: String(
            u.unit_id || `unit_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${mult}`
          ),
          name: cleanName,
          unit_name: cleanName,
          label: String(u.label || cleanName).trim(),
          multiplier: mult,
          price_pkr: Number(u.price_pkr),
          ...(computedAvailUnit !== undefined ? { available_unit_qty: computedAvailUnit } : {}),
          in_stock: inStock,
        } as ResolvedSellingUnit;
      });
    if (valid.length > 0) return valid;
  }

  const fallbackName = String(prod.unit_label || prod.packing_label || "Pack").trim() || "Pack";
  const fallbackId = `unit_${fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "pack"}_1`;
  const fallbackPrice = Number(
    prod.effective_price_pkr ?? prod.override_price_pkr ?? prod.public_selling_price_pkr ?? 0
  );
  const fallbackAvail =
    rawAvailBase !== undefined && Number.isFinite(rawAvailBase)
      ? Math.max(0, Math.floor(rawAvailBase))
      : undefined;
  return [
    {
      unit_id: fallbackId,
      name: fallbackName,
      unit_name: fallbackName,
      label: prod.packing_label || fallbackName,
      multiplier: 1,
      price_pkr: fallbackPrice,
      is_default: true,
      ...(fallbackAvail !== undefined ? { available_unit_qty: fallbackAvail } : {}),
      in_stock: !isOut && (fallbackAvail === undefined || fallbackAvail >= 1),
    },
  ];
}

function formatConvertedUnitStock(
  prod: PublicStorefrontProduct,
  unit: ResolvedSellingUnit
): string | null {
  const isOut =
    prod.availability_status === "out_of_stock" ||
    prod.availability_status === "unavailable" ||
    unit.in_stock === false;
  if (isOut) return "Out of stock";
  if (unit.available_unit_qty !== undefined && Number.isFinite(unit.available_unit_qty)) {
    return `${Number(unit.available_unit_qty).toLocaleString()} ${unit.unit_name} available`;
  }
  return null;
}

function pickSelectedUnit(
  prod: PublicStorefrontProduct,
  selectedUnitByProductId: Record<string, string>
): ResolvedSellingUnit {
  const units = getProductSellingUnits(prod);
  const chosenId = selectedUnitByProductId[prod.id];
  if (chosenId) {
    const matched = units.find((u) => u.unit_id === chosenId);
    if (matched) return matched;
  }
  return (
    units.find((u) => u.is_default && u.in_stock !== false) ||
    units.find((u) => u.in_stock !== false) ||
    units.find((u) => u.is_default) ||
    units[0]
  );
}

function buildCartKey(productId: string, unitId: string): string {
  return `${productId}::${unitId}`;
}

function normalizeRestoredCart(rawItems: any[]): CartItem[] {
  if (!Array.isArray(rawItems)) return [];
  const normalized: CartItem[] = [];
  for (const entry of rawItems) {
    if (!entry || !entry.product || !entry.product.id) continue;
    const units = getProductSellingUnits(entry.product);
    const rawSavedName = String(
      entry.selectedUnit?.unit_name || entry.selectedUnit?.name || ""
    )
      .trim()
      .toLowerCase();
    const matchedFromCatalog =
      entry.selectedUnit &&
      units.find(
        (u) =>
          u.unit_id === entry.selectedUnit.unit_id ||
          (rawSavedName &&
            (u.unit_name.toLowerCase() === rawSavedName ||
              u.name.toLowerCase() === rawSavedName))
      );
    const savedUnit: ResolvedSellingUnit =
      matchedFromCatalog ||
      (entry.selectedUnit &&
      (entry.selectedUnit.unit_name || entry.selectedUnit.name) &&
      Number(entry.selectedUnit.price_pkr) > 0
        ? {
            ...entry.selectedUnit,
            name: String(entry.selectedUnit.name || entry.selectedUnit.unit_name).trim(),
            unit_name: String(entry.selectedUnit.unit_name || entry.selectedUnit.name).trim(),
            label: String(
              entry.selectedUnit.label ||
                entry.selectedUnit.unit_name ||
                entry.selectedUnit.name
            ).trim(),
            multiplier: Math.max(0.0001, Number(entry.selectedUnit.multiplier || 1)),
            price_pkr: Number(entry.selectedUnit.price_pkr),
          }
        : units.find((u) => u.is_default) || units[0]);
    const qty = Math.max(1, Math.floor(Number(entry.qty || 1)));
    const cartKey = buildCartKey(entry.product.id, savedUnit.unit_id);
    const existingIdx = normalized.findIndex((n) => n.cartKey === cartKey);
    if (existingIdx >= 0) {
      normalized[existingIdx].qty += qty;
    } else {
      normalized.push({
        cartKey,
        product: entry.product,
        selectedUnit: savedUnit,
        qty,
      });
    }
  }
  return normalized;
}

export function App() {
  const initialRoute = useMemo(() => parseStorefrontRoute(), []);

  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState<DomainResolutionResponse | null>(null);
  const [categories, setCategories] = useState<StorefrontCategoryRecord[]>([]);
  const [banners, setBanners] = useState<StorefrontBannerRecord[]>([]);
  const [promotions, setPromotions] = useState<StorefrontPromotionRecord[]>([]);
  const [deliveryConfig, setDeliveryConfig] = useState<any>(null);

  // Navigation View State (Hydrated from URL so Reload & Browser Back preserve exact route)
  const [activeView, setActiveView] = useState<StorefrontView>(initialRoute.view);

  // Catalog State
  const [products, setProducts] = useState<PublicStorefrontProduct[]>([]);
  const [initialHomeCatalog, setInitialHomeCatalog] = useState<PublicStorefrontProduct[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [stockSyncStale, setStockSyncStale] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [selectedCategory, setSelectedCategoryState] = useState<string>(
    initialRoute.filters.selectedCategory
  );
  const [selectedDosageForm, setSelectedDosageFormState] = useState<string>(
    initialRoute.filters.selectedDosageForm
  );
  const [searchQuery, setSearchQueryState] = useState<string>(initialRoute.filters.searchQuery);
  const [inStockOnly, setInStockOnlyState] = useState<boolean>(initialRoute.filters.inStockOnly);
  const [sortBy, setSortByState] = useState<string>(initialRoute.filters.sortBy);

  // Product Detail & Unit Selection State
  const [selectedProduct, setSelectedProduct] = useState<
    | (PublicStorefrontProduct & {
        images?: Array<{ id: string; image_url: string; alt_text?: string }>;
      })
    | null
  >(null);
  const [loadingProductDetail, setLoadingProductDetail] = useState<boolean>(
    initialRoute.view === "product" && Boolean(initialRoute.productSlug)
  );
  const [relatedProducts, setRelatedProducts] = useState<PublicStorefrontProduct[]>([]);
  const [detailQty, setDetailQty] = useState<number>(1);
  const [modalQty, setModalQty] = useState<number>(1);
  const [cardQtyByProductId, setCardQtyByProductId] = useState<Record<string, number>>({});
  const [quickModalProduct, setQuickModalProduct] = useState<PublicStorefrontProduct | null>(null);
  const [selectedUnitByProductId, setSelectedUnitByProductId] = useState<Record<string, string>>(
    {}
  );

  // Shopping Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [cartToast, setCartToast] = useState<string | null>(null);

  // Checkout State
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "counter_pay" | "bank_transfer">(
    "cod"
  );
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromoCode, setAppliedPromoCode] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [rxAcknowledged, setRxAcknowledged] = useState(false);
  const [rxInquiryNote, setRxInquiryNote] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string>("");
  const [completedOrder, setCompletedOrder] = useState<
    (StorefrontOrderRecord & { applied_promo_code?: string | null }) | null
  >(null);
  const [invoiceEmailQueued, setInvoiceEmailQueued] = useState<boolean>(false);

  // Order Tracking State
  const [trackOrderNumber, setTrackOrderNumber] = useState(initialRoute.trackOrder);
  const [trackPhone, setTrackPhone] = useState("");
  const [trackToken, setTrackToken] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Refs for History API, instant scroll restoration, and zero-refetch Back navigation
  const activeViewRef = useRef<StorefrontView>(activeView);
  activeViewRef.current = activeView;

  const filtersRef = useRef<CatalogFilterState>({
    searchQuery,
    selectedCategory,
    selectedDosageForm,
    inStockOnly,
    sortBy,
  });

  const lastFetchedFilterKeyRef = useRef<string>("");
  const productsAbortRef = useRef<AbortController | null>(null);
  const catalogScrollYRef = useRef<number>(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const productsListRef = useRef<PublicStorefrontProduct[]>([]);
  productsListRef.current = products;
  const homeCatalogRef = useRef<PublicStorefrontProduct[]>([]);
  homeCatalogRef.current = initialHomeCatalog;

  // Synchronous-ref-updating filter setters so consecutive calls like `setSelectedCategory(cat); handleSelectView("shop")`
  // always serialize the brand-new filter into the pushed URL immediately.
  const setSearchQuery = useCallback((next: string) => {
    filtersRef.current = { ...filtersRef.current, searchQuery: next };
    setSearchQueryState(next);
  }, []);

  const setSelectedCategory = useCallback((next: string) => {
    filtersRef.current = { ...filtersRef.current, selectedCategory: next };
    setSelectedCategoryState(next);
  }, []);

  const setSelectedDosageForm = useCallback((next: string) => {
    filtersRef.current = { ...filtersRef.current, selectedDosageForm: next };
    setSelectedDosageFormState(next);
  }, []);

  const setInStockOnly = useCallback((next: boolean) => {
    filtersRef.current = { ...filtersRef.current, inStockOnly: next };
    setInStockOnlyState(next);
  }, []);

  const setSortBy = useCallback((next: string) => {
    filtersRef.current = { ...filtersRef.current, sortBy: next };
    setSortByState(next);
  }, []);

  const resetCatalogFilters = useCallback(() => {
    filtersRef.current = {
      searchQuery: "",
      selectedCategory: "all",
      selectedDosageForm: "all",
      inStockOnly: false,
      sortBy: "featured",
    };
    setSearchQueryState("");
    setSelectedCategoryState("all");
    setSelectedDosageFormState("all");
    setInStockOnlyState(false);
    setSortByState("featured");
  }, []);

  const targetHost = getEffectiveTargetHost();

  const snapshotCurrentHistoryScroll = useCallback(() => {
    if (typeof window === "undefined") return 0;
    const currentScroll = window.scrollY;
    if (activeViewRef.current === "shop") {
      catalogScrollYRef.current = currentScroll;
    }
    try {
      const prevState = (window.history.state || {}) as StorefrontHistoryState;
      window.history.replaceState(
        {
          ...prevState,
          view: activeViewRef.current,
          filters: { ...filtersRef.current },
          scrollY: currentScroll,
        },
        "",
        window.location.href
      );
    } catch {
      // ignore history errors in sandboxed iframes
    }
    return currentScroll;
  }, []);

  const handleSelectView = useCallback(
    (nextView: StorefrontView, opts?: { replace?: boolean; trackOrder?: string }) => {
      if (nextView !== "checkout" && nextView !== "cart") {
        setCompletedOrder(null);
      }
      const prevView = activeViewRef.current;
      snapshotCurrentHistoryScroll();

      const nextUrl = buildStorefrontUrl({
        view: nextView,
        filters: filtersRef.current,
        trackOrder: opts?.trackOrder,
      });
      const currentRelative = `${window.location.pathname}${window.location.search}`;
      const nextState: StorefrontHistoryState = {
        view: nextView,
        fromView: prevView,
        filters: { ...filtersRef.current },
        scrollY: 0,
      };

      try {
        if (opts?.replace || (nextView === prevView && nextUrl === currentRelative)) {
          window.history.replaceState(nextState, "", nextUrl);
        } else {
          window.history.pushState(nextState, "", nextUrl);
        }
      } catch {
        // ignore history API failures
      }

      activeViewRef.current = nextView;
      setActiveView(nextView);
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [snapshotCurrentHistoryScroll]
  );

  const loadProductsPage = useCallback(
    async (opts: {
      category: string;
      search: string;
      inStockOnly: boolean;
      sort: string;
      cursor?: string;
      append?: boolean;
    }) => {
      if (!opts.append && productsAbortRef.current) {
        productsAbortRef.current.abort();
      }
      const controller = new AbortController();
      if (!opts.append) {
        productsAbortRef.current = controller;
      }

      setLoadingProducts(true);
      try {
        const res = await fetchPublicProducts({
          category: opts.category,
          search: opts.search,
          inStockOnly: opts.inStockOnly,
          sort: opts.sort,
          cursor: opts.cursor,
          limit: 24,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        lastFetchedFilterKeyRef.current = buildCatalogFilterKey({
          category: opts.category,
          search: opts.search,
          inStockOnly: opts.inStockOnly,
          sort: opts.sort,
        });
        setProducts((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.next_cursor);
        setHasMore(res.has_more);
        if (res.stock_sync_stale !== undefined) {
          setStockSyncStale(Boolean(res.stock_sync_stale));
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("Failed to fetch products:", err);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProducts(false);
        }
      }
    },
    []
  );

  // Configure manual scroll restoration & seed initial history state
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    try {
      const existing = (window.history.state || {}) as StorefrontHistoryState;
      window.history.replaceState(
        {
          ...existing,
          view: initialRoute.view,
          productSlug: initialRoute.productSlug,
          filters: initialRoute.filters,
          scrollY: existing.scrollY ?? 0,
        },
        "",
        window.location.href
      );
    } catch {
      // ignore
    }
  }, [initialRoute]);

  // Restore saved scroll position immediately after Back / Forward view commit
  useEffect(() => {
    if (pendingScrollRestoreRef.current === null) return;
    const targetY = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;
    const raf1 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: "auto" });
      });
    });
    return () => window.cancelAnimationFrame(raf1);
  }, [activeView]);

  // Listen to Browser Back / Forward (`popstate`) — restores exact route, filters & scroll position!
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = (event: PopStateEvent) => {
      const parsed = parseStorefrontRoute(window.location);
      const state = (event.state || {}) as StorefrontHistoryState;

      // Close overlays cleanly on Back navigation
      setCartDrawerOpen(false);
      setQuickModalProduct(null);

      if (parsed.view === "shop") {
        filtersRef.current = { ...parsed.filters };
        setSearchQueryState(parsed.filters.searchQuery);
        setSelectedCategoryState(parsed.filters.selectedCategory);
        setSelectedDosageFormState(parsed.filters.selectedDosageForm);
        setInStockOnlyState(parsed.filters.inStockOnly);
        setSortByState(parsed.filters.sortBy);
        pendingScrollRestoreRef.current =
          typeof state.scrollY === "number" ? state.scrollY : catalogScrollYRef.current;
      } else if (parsed.view === "product" && parsed.productSlug) {
        const slug = parsed.productSlug;
        const cachedProd =
          productsListRef.current.find((p) => p.slug === slug || p.id === slug) ||
          homeCatalogRef.current.find((p) => p.slug === slug || p.id === slug) ||
          null;
        if (cachedProd) {
          setSelectedProduct(cachedProd);
          setLoadingProductDetail(false);
        } else {
          setLoadingProductDetail(true);
        }
        setDetailQty(1);
        pendingScrollRestoreRef.current = typeof state.scrollY === "number" ? state.scrollY : 0;
        void fetchPublicProductDetails(slug).then((full) => {
          if (full) {
            setSelectedProduct(full.product);
            setRelatedProducts(full.related_products || []);
          }
          setLoadingProductDetail(false);
        });
      } else {
        if (parsed.view === "track" && parsed.trackOrder) {
          setTrackOrderNumber(parsed.trackOrder);
        }
        pendingScrollRestoreRef.current = typeof state.scrollY === "number" ? state.scrollY : 0;
      }

      activeViewRef.current = parsed.view;
      setActiveView(parsed.view);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Global keyboard polish: Escape closes drawer/modal; `/` focuses catalog search cleanly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (quickModalProduct) {
          setQuickModalProduct(null);
          return;
        }
        if (cartDrawerOpen) {
          setCartDrawerOpen(false);
          return;
        }
      }
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "SELECT"
      ) {
        const searchInput = document.querySelector<HTMLInputElement>(
          '[data-testid="catalog-search-input"]'
        );
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartDrawerOpen, quickModalProduct]);

  // Bootstrap Storefront Resolution & Initial Data
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      try {
        const { data } = await fetchStorefrontResolution();
        if (cancelled) return;
        setResolution(data);

        if (data.storefront?.city) {
          setDeliveryCity(data.storefront.city);
        }

        // Restore tenant-scoped cart from localStorage
        if (data.storefront?.id) {
          try {
            const rawCart = localStorage.getItem(`aivrasol_cart_${data.storefront.id}`);
            if (rawCart) {
              const parsed = JSON.parse(rawCart);
              if (Array.isArray(parsed)) setCart(normalizeRestoredCart(parsed));
            }
          } catch {
            // ignore storage errors
          }
        }

        if (data.resolution_status === "active") {
          const initF = initialRoute.filters;
          const hasInitialUrlFilters =
            Boolean(initF.searchQuery) ||
            initF.selectedCategory !== "all" ||
            initF.inStockOnly ||
            initF.sortBy !== "featured";

          const [cats, bans, promos, deliv, initialProds, homeCatalogRes, initialProdDetail] =
            await Promise.all([
              fetchPublicCategories(),
              fetchPublicBanners(),
              fetchPublicPromotions(),
              fetchPublicDeliveryConfig(),
              fetchPublicProducts({
                category: initF.selectedCategory,
                search: initF.searchQuery,
                inStockOnly: initF.inStockOnly,
                sort: initF.sortBy,
                limit: 24,
              }),
              hasInitialUrlFilters
                ? fetchPublicProducts({ limit: 24, sort: "featured" })
                : Promise.resolve(null),
              initialRoute.view === "product" && initialRoute.productSlug
                ? fetchPublicProductDetails(initialRoute.productSlug)
                : Promise.resolve(null),
            ]);

          if (cancelled) return;
          setCategories(cats);
          setBanners(bans);
          setPromotions(promos);
          setDeliveryConfig(deliv);
          setProducts(initialProds.items);
          setInitialHomeCatalog(
            homeCatalogRes ? homeCatalogRes.items : initialProds.items
          );
          setNextCursor(initialProds.next_cursor);
          setHasMore(initialProds.has_more);
          setStockSyncStale(Boolean(initialProds.stock_sync_stale));
          lastFetchedFilterKeyRef.current = buildCatalogFilterKey({
            category: initF.selectedCategory,
            search: initF.searchQuery,
            inStockOnly: initF.inStockOnly,
            sort: initF.sortBy,
          });

          if (initialRoute.view === "product" && initialRoute.productSlug) {
            if (initialProdDetail) {
              setSelectedProduct(initialProdDetail.product);
              setRelatedProducts(initialProdDetail.related_products || []);
            } else {
              // Product slug no longer exists — fall back smoothly to catalog
              setActiveView("shop");
              activeViewRef.current = "shop";
            }
            setLoadingProductDetail(false);
          }

          if (initialRoute.view === "track" && initialRoute.trackOrder) {
            void trackPublicOrder({ orderNumber: initialRoute.trackOrder }).then((res) => {
              if (!cancelled && res.ok && res.order) {
                setTrackedOrder(res.order);
              }
            });
          }

          if (deliv && !deliv.delivery_enabled && deliv.pickup_enabled) {
            setFulfillmentType("pickup");
          }
        }
      } catch (err) {
        console.error("Failed to resolve storefront:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [initialRoute]);

  // Keep browser tab title informative across views & product detail pages
  useEffect(() => {
    if (!resolution?.storefront) return;
    const resolvedName = resolvePharmacyDisplayName(resolution.storefront, resolution.branding);
    const rawSeoTitle = resolution.settings?.seo_title?.trim();
    const hasStaleOwnerTitle =
      rawSeoTitle &&
      resolvedName.toLowerCase() !== "abdul rehman" &&
      /abdul\s*rehman/i.test(rawSeoTitle);
    const baseTitle =
      rawSeoTitle && !hasStaleOwnerTitle
        ? rawSeoTitle
        : `${resolvedName} — Online Pharmacy (${resolution.storefront.city})`;

    if (activeView === "product" && selectedProduct?.name) {
      document.title = `${selectedProduct.name} — ${resolvedName}`;
    } else if (activeView === "shop") {
      document.title =
        selectedCategory !== "all"
          ? `${selectedCategory} — ${resolvedName}`
          : `Medicines Catalog — ${resolvedName}`;
    } else if (activeView === "checkout" || activeView === "cart") {
      document.title = `Checkout — ${resolvedName}`;
    } else if (activeView === "track") {
      document.title = `Track Order — ${resolvedName}`;
    } else {
      document.title = baseTitle;
    }
  }, [resolution, activeView, selectedProduct?.name, selectedCategory]);

  // Persist tenant-scoped cart
  useEffect(() => {
    if (!resolution?.storefront?.id) return;
    try {
      localStorage.setItem(`aivrasol_cart_${resolution.storefront.id}`, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart, resolution?.storefront?.id]);

  // Keep Catalog URL synchronized in-place (replaceState) when filters change so F5 & Back never lose filters
  useEffect(() => {
    if (typeof window === "undefined" || activeView !== "shop") return;
    const nextUrl = buildStorefrontUrl({ view: "shop", filters: filtersRef.current });
    const currentRelative = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentRelative) {
      try {
        const currState = (window.history.state || {}) as StorefrontHistoryState;
        window.history.replaceState(
          { ...currState, view: "shop", filters: { ...filtersRef.current } },
          "",
          nextUrl
        );
      } catch {
        // ignore
      }
    }
  }, [activeView, selectedCategory, selectedDosageForm, searchQuery, inStockOnly, sortBy]);

  // Reload catalog ONLY when server filter key genuinely changes (zero refetch on Browser Back!)
  useEffect(() => {
    if (!resolution || resolution.resolution_status !== "active") return;
    const desiredKey = buildCatalogFilterKey({
      category: selectedCategory,
      search: searchQuery,
      inStockOnly,
      sort: sortBy,
    });
    if (desiredKey === lastFetchedFilterKeyRef.current) return;

    const delayMs = searchQuery.trim() ? 220 : 40;
    const timer = setTimeout(() => {
      void loadProductsPage({
        category: selectedCategory,
        search: searchQuery,
        inStockOnly,
        sort: sortBy,
        append: false,
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [selectedCategory, searchQuery, inStockOnly, sortBy, resolution, loadProductsPage]);

  // Generate fresh idempotency key when entering checkout
  useEffect(() => {
    if ((activeView === "checkout" || activeView === "cart") && !checkoutIdempotencyKey) {
      setCheckoutIdempotencyKey(`ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    }
  }, [activeView, checkoutIdempotencyKey]);

  const showToast = useCallback((msg: string) => {
    setCartToast(msg);
    setTimeout(() => {
      setCartToast((curr) => (curr === msg ? null : curr));
    }, 2600);
  }, []);

  const maxQtyPerItem = Number(resolution?.settings?.max_items_per_order || 20);

  const selectProductUnit = useCallback((productId: string, unitId: string) => {
    setSelectedUnitByProductId((prev) => ({ ...prev, [productId]: unitId }));
    setCardQtyByProductId((prev) => ({ ...prev, [productId]: 1 }));
    setModalQty(1);
  }, []);

  const changeCardDraftQty = useCallback((productId: string, qty: number) => {
    setCardQtyByProductId((prev) => ({ ...prev, [productId]: qty }));
  }, []);

  const addToCart = useCallback(
    (
      product: PublicStorefrontProduct,
      qtyToAdd = 1,
      openDrawer = false,
      explicitUnit?: ResolvedSellingUnit
    ) => {
      const unit = explicitUnit || pickSelectedUnit(product, selectedUnitByProductId);
      const isOut =
        product.availability_status === "out_of_stock" ||
        product.availability_status === "unavailable" ||
        unit.in_stock === false ||
        (unit.available_unit_qty !== undefined && unit.available_unit_qty <= 0);
      if (isOut) {
        showToast(`${product.name} (${unit.unit_name}) is currently out of stock.`);
        return;
      }
      const unitCap =
        unit.max_qty !== undefined && unit.max_qty > 0 ? unit.max_qty : maxQtyPerItem;
      const cartKey = buildCartKey(product.id, unit.unit_id);
      const unitMult = Math.max(0.0001, Number(unit.multiplier || 1));
      const availBase =
        product.available_base_qty !== undefined && product.available_base_qty > 0
          ? Number(product.available_base_qty)
          : undefined;

      let cappedWarning: string | null = null;
      let addedActual = 0;

      setCart((prev) => {
        const otherLinesBaseUsed = prev
          .filter((item) => item.product.id === product.id && item.cartKey !== cartKey)
          .reduce(
            (sum, item) =>
              sum + item.qty * Math.max(0.0001, Number(item.selectedUnit.multiplier || 1)),
            0
          );
        const remainingUnitsByStock =
          availBase !== undefined
            ? Math.max(0, Math.floor((availBase - otherLinesBaseUsed + 1e-9) / unitMult))
            : unitCap;
        const effectiveCap = Math.min(unitCap, remainingUnitsByStock);

        const existingIndex = prev.findIndex((item) => item.cartKey === cartKey);
        const prevQty = existingIndex >= 0 ? prev[existingIndex].qty : 0;
        if (effectiveCap <= prevQty) {
          cappedWarning =
            availBase !== undefined
              ? `Maximum available stock reached for ${product.name} (${unit.unit_name}).`
              : `Maximum ${effectiveCap} ${unit.unit_name} allowed per order.`;
          return prev;
        }

        const nextQty = Math.min(effectiveCap, prevQty + Math.max(1, qtyToAdd));
        addedActual = nextQty - prevQty;

        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            product,
            selectedUnit: unit,
            qty: nextQty,
          };
          return next;
        }
        return [
          ...prev,
          {
            cartKey,
            product,
            selectedUnit: unit,
            qty: nextQty,
          },
        ];
      });

      if (cappedWarning) {
        showToast(cappedWarning);
        return;
      }
      showToast(
        `Added ${addedActual || qtyToAdd} ${unit.unit_name} of ${product.name} (PKR ${Number(
          unit.price_pkr
        ).toLocaleString()})`
      );
      if (openDrawer) {
        setCartDrawerOpen(true);
      }
    },
    [maxQtyPerItem, selectedUnitByProductId, showToast]
  );

  const getCartItemMaxCap = useCallback(
    (targetItem: CartItem, currentCart: CartItem[]): number => {
      const unitCap =
        targetItem.selectedUnit.max_qty !== undefined && targetItem.selectedUnit.max_qty > 0
          ? targetItem.selectedUnit.max_qty
          : targetItem.selectedUnit.available_unit_qty !== undefined &&
              targetItem.selectedUnit.available_unit_qty > 0
            ? targetItem.selectedUnit.available_unit_qty
            : maxQtyPerItem;
      const unitMult = Math.max(0.0001, Number(targetItem.selectedUnit.multiplier || 1));
      const availBase =
        targetItem.product.available_base_qty !== undefined &&
        targetItem.product.available_base_qty > 0
          ? Number(targetItem.product.available_base_qty)
          : undefined;
      const otherBaseUsed = currentCart
        .filter((o) => o.product.id === targetItem.product.id && o.cartKey !== targetItem.cartKey)
        .reduce(
          (sum, o) => sum + o.qty * Math.max(0.0001, Number(o.selectedUnit.multiplier || 1)),
          0
        );
      const stockCap =
        availBase !== undefined
          ? Math.max(1, Math.floor((availBase - otherBaseUsed + 1e-9) / unitMult))
          : unitCap;
      return Math.max(1, Math.min(unitCap, stockCap));
    },
    [maxQtyPerItem]
  );

  const updateCartQty = useCallback(
    (cartKey: string, nextQty: number) => {
      if (nextQty <= 0) {
        setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
        return;
      }
      setCart((prev) =>
        prev.map((item) => {
          if (item.cartKey !== cartKey) return item;
          const cap = getCartItemMaxCap(item, prev);
          return { ...item, qty: Math.min(cap, Math.floor(nextQty)) };
        })
      );
    },
    [getCartItemMaxCap]
  );

  const removeFromCart = useCallback(
    (cartKey: string) => {
      const existing = cart.find((item) => item.cartKey === cartKey);
      setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
      if (existing) {
        showToast(
          `Removed ${existing.product.name} (${existing.selectedUnit.unit_name}) from cart`
        );
      }
    },
    [cart, showToast]
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setAppliedPromoCode("");
    setPromoCodeInput("");
  }, []);

  const openProductDetailPage = useCallback(
    async (prod: PublicStorefrontProduct) => {
      const prevView = activeViewRef.current;
      snapshotCurrentHistoryScroll();

      const slug = prod.slug || prod.id;
      const nextUrl = buildStorefrontUrl({ view: "product", productSlug: slug });
      const nextState: StorefrontHistoryState = {
        view: "product",
        productSlug: slug,
        fromView: prevView,
        filters: { ...filtersRef.current },
        scrollY: 0,
      };
      try {
        window.history.pushState(nextState, "", nextUrl);
      } catch {
        // ignore history errors
      }

      setCartDrawerOpen(false);
      setQuickModalProduct(null);
      setSelectedProduct(prod);
      setLoadingProductDetail(false);
      setDetailQty(1);
      setRelatedProducts([]);
      activeViewRef.current = "product";
      setActiveView("product");
      window.scrollTo({ top: 0, behavior: "auto" });

      const full = await fetchPublicProductDetails(slug);
      if (full) {
        setSelectedProduct(full.product);
        setRelatedProducts(full.related_products || []);
      }
    },
    [snapshotCurrentHistoryScroll]
  );

  const handleBackToCatalog = useCallback(() => {
    const state = (window.history.state || {}) as StorefrontHistoryState;
    if (state?.fromView === "shop" && window.history.length > 1) {
      window.history.back();
      return;
    }
    handleSelectView("shop");
  }, [handleSelectView]);

  // Filtered products client-side refinement for dosage form
  const displayedProducts = useMemo(() => {
    if (selectedDosageForm === "all") return products;
    return products.filter(
      (p) => (p.dosage_form || "").toLowerCase() === selectedDosageForm.toLowerCase()
    );
  }, [products, selectedDosageForm]);

  const availableDosageForms = useMemo(() => {
    const forms = new Set<string>();
    for (const p of [...products, ...initialHomeCatalog]) {
      const clean = cleanProductText(p.dosage_form);
      if (clean) {
        forms.add(clean);
      }
    }
    return Array.from(forms).sort().slice(0, 12);
  }, [products, initialHomeCatalog]);

  const homeProducts = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return displayedProducts.slice(0, 8);
    }
    const source = initialHomeCatalog.length > 0 ? initialHomeCatalog : products;
    const featured = source.filter((p) => p.is_featured);
    if (featured.length >= 4) {
      return featured.slice(0, 8);
    }
    return source.slice(0, 8);
  }, [searchQuery, displayedProducts, initialHomeCatalog, products]);

  // Cart Totals Calculation (Strictly Preserved Business Logic)
  const cartCalculations = useMemo(() => {
    const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
    const subtotalPkr = cart.reduce((acc, item) => {
      const unitPrice = Number(
        item.selectedUnit?.price_pkr ??
          item.product.effective_price_pkr ??
          item.product.override_price_pkr ??
          item.product.public_selling_price_pkr ??
          0
      );
      return Number((acc + unitPrice * item.qty).toFixed(2));
    }, 0);

    const hasPrescriptionItems = cart.some((item) => item.product.requires_prescription);

    // Promo discount preview with transparent validation states
    let discountPkr = 0;
    let activePromo: StorefrontPromotionRecord | null = null;
    let matchedPromo: StorefrontPromotionRecord | null = null;
    let promoStatus: "none" | "applied" | "below_min" | "invalid" = "none";
    let promoMinOrderPkr = 0;
    let promoRemainingMinPkr = 0;

    const normalizedPromo = appliedPromoCode.trim().toUpperCase();
    if (normalizedPromo) {
      const matched = promotions.find(
        (p) => p.code && String(p.code).trim().toUpperCase() === normalizedPromo
      );
      if (!matched) {
        promoStatus = "invalid";
      } else {
        matchedPromo = matched;
        promoMinOrderPkr = Math.max(0, Number(matched.min_order_pkr || 0));
        if (subtotalPkr < promoMinOrderPkr) {
          promoStatus = "below_min";
          promoRemainingMinPkr = Number((promoMinOrderPkr - subtotalPkr).toFixed(2));
        } else {
          activePromo = matched;
          promoStatus = "applied";
          const pType = (matched as any).promotion_type || matched.promo_type;
          if (pType === "percentage") {
            discountPkr = Number(
              ((subtotalPkr * Number(matched.discount_value || 0)) / 100).toFixed(2)
            );
          } else if (pType === "fixed_amount") {
            discountPkr = Number(
              Math.min(subtotalPkr, Number(matched.discount_value || 0)).toFixed(2)
            );
          }
        }
      }
    }

    // Delivery Fee calculation
    const zones = (deliveryConfig?.zones || []) as Array<any>;
    const selectedZone = zones.find((z) => z.id === selectedZoneId);
    const baseDeliveryFee = selectedZone
      ? Number(selectedZone.fee_pkr ?? selectedZone.delivery_fee_pkr ?? 150)
      : Number(deliveryConfig?.standard_delivery_fee_pkr ?? 150);
    const freeThreshold = Number(deliveryConfig?.free_delivery_threshold_pkr ?? 2000);
    const minOrderValue = selectedZone
      ? Number(
          selectedZone.min_order_pkr ||
            deliveryConfig?.min_order_amount_pkr ||
            deliveryConfig?.minimum_order_value_pkr ||
            0
        )
      : Number(
          deliveryConfig?.min_order_amount_pkr ||
            deliveryConfig?.minimum_order_value_pkr ||
            0
        );

    let deliveryFeePkr = 0;
    if (fulfillmentType === "delivery") {
      if (freeThreshold > 0 && subtotalPkr >= freeThreshold) {
        deliveryFeePkr = 0;
      } else {
        deliveryFeePkr = baseDeliveryFee;
      }
    }

      const totalPkr = Number(
      Math.max(0, subtotalPkr - discountPkr + deliveryFeePkr).toFixed(2)
    );
    const remainingForFreeDelivery =
      freeThreshold > 0 ? Math.max(0, freeThreshold - subtotalPkr) : 0;

    return {
      totalItems,
      subtotalPkr,
      discountPkr,
      activePromo,
      matchedPromo,
      promoStatus,
      promoMinOrderPkr,
      promoRemainingMinPkr,
      deliveryFeePkr,
      totalPkr,
      freeThreshold,
      remainingForFreeDelivery,
      minOrderValue,
      hasPrescriptionItems,
    };
  }, [cart, appliedPromoCode, promotions, deliveryConfig, selectedZoneId, fulfillmentType]);

  const handleApplyPromoCode = useCallback(
    async (rawCode: string) => {
      const cleaned = rawCode.trim().toUpperCase();
      setPromoCodeInput(cleaned);
      if (!cleaned) {
        setAppliedPromoCode("");
        return;
      }

      let currentPromos = promotions;
      let matched = currentPromos.find(
        (p) => p.code && String(p.code).trim().toUpperCase() === cleaned
      );

      // Refresh live promotions in case the owner just added or updated the code in Owner Panel
      if (!matched) {
        try {
          const fresh = await fetchPublicPromotions(true);
          setPromotions(fresh);
          currentPromos = fresh;
          matched = fresh.find((p) => p.code && String(p.code).trim().toUpperCase() === cleaned);
        } catch {
          // Keep current local promotions list
        }
      }

      setAppliedPromoCode(cleaned);

      if (!matched) {
        showToast(`Promo code "${cleaned}" is invalid or inactive.`);
        return;
      }

      const minOrder = Math.max(0, Number(matched.min_order_pkr || 0));
      if (cartCalculations.subtotalPkr < minOrder) {
        showToast(
          `Code ${cleaned} requires minimum order PKR ${minOrder.toLocaleString()}.`
        );
        return;
      }

      const pType = (matched as any).promotion_type || matched.promo_type;
      const previewDisc =
        pType === "percentage"
          ? Number(
              ((cartCalculations.subtotalPkr * Number(matched.discount_value || 0)) / 100).toFixed(2)
            )
          : Number(
              Math.min(cartCalculations.subtotalPkr, Number(matched.discount_value || 0)).toFixed(2)
            );

      showToast(
        previewDisc > 0
          ? `Promo code ${cleaned} applied — PKR ${previewDisc.toLocaleString()} deducted`
          : `Promo code ${cleaned} applied`
      );
    },
    [promotions, cartCalculations.subtotalPkr, showToast]
  );

  // Checkout Submission Handler
  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError("Your cart is empty.");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setCheckoutError("Please provide your full name and active mobile number.");
      return;
    }
    if (fulfillmentType === "delivery" && !deliveryAddress.trim()) {
      setCheckoutError("Please enter your complete delivery address.");
      return;
    }
    if (
      fulfillmentType === "delivery" &&
      cartCalculations.minOrderValue > 0 &&
      cartCalculations.subtotalPkr < cartCalculations.minOrderValue
    ) {
      setCheckoutError(
        `Minimum order value for delivery is PKR ${cartCalculations.minOrderValue.toLocaleString()}.`
      );
      return;
    }
    if (cartCalculations.hasPrescriptionItems && !rxAcknowledged) {
      setCheckoutError(
        "Your order includes prescription-required medicine(s). Please confirm prescription verification before placing your order."
      );
      return;
    }

    const idempKey =
      checkoutIdempotencyKey ||
      `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    setCheckoutSubmitting(true);
    try {
      const result = await submitPublicOrder({
        idempotency_key: idempKey,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        fulfillment_type: fulfillmentType,
        delivery_address: fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
        delivery_city: deliveryCity.trim() || resolution?.storefront?.city || undefined,
        delivery_instructions:
          fulfillmentType === "delivery" && deliveryInstructions.trim()
            ? deliveryInstructions.trim()
            : undefined,
        delivery_zone_id: selectedZoneId || undefined,
        branch_id: selectedBranchId || undefined,
        payment_method: paymentMethod,
        customer_notes: customerNotes.trim() || undefined,
        rx_acknowledged: cartCalculations.hasPrescriptionItems ? rxAcknowledged : undefined,
        rx_inquiry_note: rxInquiryNote.trim() || undefined,
        promo_code: appliedPromoCode.trim() || undefined,
        items: cart.map((item) => ({
          product_id: item.product.id,
          qty: item.qty,
          selling_unit_id: item.selectedUnit.unit_id,
          selling_unit_name: item.selectedUnit.unit_name,
        })),
      });

      if (!result.ok || !result.order) {
        setCheckoutError(result.message || "Unable to place order. Please review your details.");
        return;
      }

      setCompletedOrder(result.order);
      setInvoiceEmailQueued(Boolean(result.invoice_email_queued));
      clearCart();
      setCheckoutIdempotencyKey("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setCheckoutError(err?.message || "Network error while submitting your order.");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  // Order Tracking Handler
  async function handleTrackOrder(
    e?: React.FormEvent,
    overrideOrderNo?: string,
    overrideToken?: string
  ) {
    if (e) e.preventDefault();
    const ordNo = (overrideOrderNo ?? trackOrderNumber).trim();
    const tok = (overrideToken ?? trackToken).trim();
    if (!ordNo) {
      setTrackingError("Please enter your Order Reference Number (e.g. ORD-...).");
      return;
    }
    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const res = await trackPublicOrder({
        orderNumber: ordNo,
        token: tok || undefined,
      });
      if (!res.ok || !res.order) {
        setTrackedOrder(null);
        setTrackingError(
          res.message || "No order found with that reference number on this pharmacy website."
        );
      } else {
        setTrackedOrder(res.order);
      }
    } catch {
      setTrackingError("Unable to check order status right now.");
    } finally {
      setTrackingLoading(false);
    }
  }

  // =========================================================================
  // INITIAL LOADING STATE
  // =========================================================================
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF8F4] p-6">
        <div className="w-11 h-11 rounded-full border-[3px] border-[#0E5146] border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#172B36]">Loading pharmacy storefront…</p>
      </div>
    );
  }

  // =========================================================================
  // 1. SAFE REDIRECT STATE
  // =========================================================================
  if (resolution?.resolution_status === "redirect") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F4] p-6">
        <div className="max-w-md w-full sf-card-elevated rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#E9F5F1] border border-[#CBE4DC] text-[#0E5146] flex items-center justify-center mx-auto">
            <PharmacyCrossIcon className="w-5 h-5" />
          </div>
          <h1 className="sf-display text-xl font-bold text-[#172B36]">Pharmacy Address Updated</h1>
          <p className="text-sm text-[#607481]">
            This pharmacy website has moved to{" "}
            <span className="font-mono font-semibold text-[#172B36]">
              {resolution.redirect_to_hostname}
            </span>
            .
          </p>
          <a
            href={`/?hostname=${encodeURIComponent(resolution.redirect_to_hostname || "")}`}
            className="w-full h-11 px-4 rounded-xl sf-btn-primary text-sm font-semibold inline-flex items-center justify-center"
          >
            Continue to {resolution.redirect_to_hostname}
          </a>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. MISSING PHARMACY 404 STATE
  // =========================================================================
  if (!resolution || resolution.resolution_status === "not_found" || !resolution.storefront) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[#FAF8F4] p-6"
        data-testid="storefront-not-found"
      >
        <div className="max-w-md w-full sf-card-elevated rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#E9F5F1] border border-[#CBE4DC] text-[#0E5146] flex items-center justify-center mx-auto font-bold text-sm">
            404
          </div>
          <h1 className="sf-display text-xl font-bold text-[#172B36]">Storefront Not Found</h1>
          <p className="text-sm text-[#607481] leading-relaxed">
            No active pharmacy website was found at{" "}
            <span className="font-mono text-xs font-semibold text-[#172B36] bg-[#FAF8F4] border border-[#DCE7E2] px-2 py-0.5 rounded">
              {targetHost}
            </span>
            .
          </p>
        </div>
      </div>
    );
  }

  const sf = resolution.storefront;
  const branding = resolution.branding;
  const settings = resolution.settings;
  const displayName = resolvePharmacyDisplayName(sf, branding);
  const themeVars = buildTenantThemeVars(branding);

  // =========================================================================
  // 3. SUSPENDED PHARMACY STATE
  // =========================================================================
  if (resolution.resolution_status === "suspended") {
    return (
      <div
        style={themeVars}
        className="min-h-screen flex items-center justify-center bg-[#FAF8F4] p-6"
        data-testid="storefront-suspended"
      >
        <div className="max-w-md w-full sf-card-elevated rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircleIcon className="w-5 h-5" />
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Temporarily Unavailable
          </span>
          <h1 className="sf-display text-xl font-bold text-[#172B36]">{displayName}</h1>
          <p className="text-sm text-[#607481] leading-relaxed">
            {resolution.message || "This pharmacy website is currently unavailable."}
          </p>
          {sf.contact_phone && (
            <a
              href={`tel:${sf.contact_phone}`}
              className="h-10 px-4 rounded-xl sf-btn-secondary text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <PhoneIcon className="w-3.5 h-3.5 sf-text-brand" />
              <span>Counter Phone: {sf.contact_phone}</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. INACTIVE / MAINTENANCE STATE
  // =========================================================================
  if (
    resolution.resolution_status === "inactive" ||
    Number(settings?.maintenance_mode || 0) === 1
  ) {
    return (
      <div
        style={themeVars}
        className="min-h-screen flex items-center justify-center bg-[#FAF8F4] p-6"
        data-testid="storefront-inactive"
      >
        <div className="max-w-md w-full sf-card-elevated rounded-3xl p-8 text-center space-y-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto font-bold text-lg border border-[var(--sf-primary-border)] sf-text-brand"
            style={{ backgroundColor: "var(--sf-primary-soft)" }}
          >
            {getPharmacyMonogram(displayName)}
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Online Ordering Offline
          </span>
          <h1 className="sf-display text-xl font-bold text-[#172B36]">{displayName}</h1>
          <p className="text-sm text-[#607481] leading-relaxed">
            {settings?.maintenance_message ||
              resolution.message ||
              "Our online storefront is currently undergoing scheduled maintenance. Please contact or visit our pharmacy counter directly."}
          </p>
          <div className="bg-[#FAF8F4] rounded-2xl p-4 text-left space-y-1.5 text-xs text-[#4A606D] border border-[#DCE7E2]">
            {sf.address_line && (
              <p>
                <strong className="text-[#172B36]">Address:</strong> {sf.address_line}, {sf.city}
              </p>
            )}
            {sf.contact_phone && (
              <p>
                <strong className="text-[#172B36]">Phone:</strong> {sf.contact_phone}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. ACTIVE COMMERCIAL STOREFRONT RUNTIME
  // =========================================================================
  const heroBanner = banners.find((b) => b.placement === "hero");
  const secondaryBanners = banners.filter((b) => b.placement !== "hero");
  const openingHours = (settings?.opening_hours || {}) as Record<string, any>;
  const deliveryZones = (deliveryConfig?.zones || []) as Array<any>;
  const branchesList = (deliveryConfig?.branches || []) as Array<any>;

  const buildWhatsAppOrderShareUrl = (order: StorefrontOrderRecord) => {
    const rawPhone = (sf.whatsapp_phone || sf.contact_phone || "").replace(/[^0-9]/g, "");
    const lines = [
      `Assalam-o-Alaikum ${displayName},`,
      `I have placed an online order on your website.`,
      ``,
      `Order Reference: *${order.order_number}*`,
      `Customer: ${order.customer_name} (${order.customer_phone})`,
      `Fulfillment: ${order.fulfillment_type === "pickup" ? "Counter Pickup" : "Home Delivery"}`,
      order.delivery_address
        ? `Address: ${order.delivery_address}, ${order.delivery_city || sf.city}`
        : "",
      `Payment Method: ${order.payment_method.toUpperCase()}`,
      `Order Total: *PKR ${Number(order.total_pkr).toLocaleString()}*`,
      order.requires_prescription
        ? `Note: Contains Rx item(s) for prescription verification.`
        : "",
    ].filter(Boolean);
    const encoded = encodeURIComponent(lines.join("\n"));
    return rawPhone ? `https://wa.me/${rawPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  };

  const renderProductCard = (prod: PublicStorefrontProduct) => {
    const units = getProductSellingUnits(prod);
    const activeUnit = pickSelectedUnit(prod, selectedUnitByProductId);
    const activeCartKey = buildCartKey(prod.id, activeUnit.unit_id);
    const inCartItem = cart.find((c) => c.cartKey === activeCartKey);
    const cardUnitCap =
      activeUnit.max_qty !== undefined && activeUnit.max_qty > 0
        ? activeUnit.max_qty
        : activeUnit.available_unit_qty !== undefined && activeUnit.available_unit_qty > 0
          ? activeUnit.available_unit_qty
          : maxQtyPerItem;
    const cardDraftQty = Math.min(
      Math.max(1, cardUnitCap),
      Math.max(1, cardQtyByProductId[prod.id] || 1)
    );
    const inCartCap = inCartItem ? getCartItemMaxCap(inCartItem, cart) : cardUnitCap;
    const convertedStockText = formatConvertedUnitStock(prod, activeUnit);

    return (
      <ProductCard
        key={prod.id}
        product={prod}
        units={units}
        activeUnit={activeUnit}
        activeCartKey={activeCartKey}
        inCartItem={inCartItem}
        cardDraftQty={cardDraftQty}
        cardUnitCap={cardUnitCap}
        inCartCap={inCartCap}
        convertedStockText={convertedStockText}
        onSelectUnit={selectProductUnit}
        onChangeDraftQty={changeCardDraftQty}
        onAddToCart={addToCart}
        onUpdateCartQty={updateCartQty}
        onRemoveFromCart={removeFromCart}
        onOpenProductDetail={(p) => void openProductDetailPage(p)}
        onShowToast={showToast}
      />
    );
  };

  // Detail page active unit props
  const detailUnits = selectedProduct ? getProductSellingUnits(selectedProduct) : [];
  const activeDetailUnit = selectedProduct
    ? pickSelectedUnit(selectedProduct, selectedUnitByProductId)
    : null;
  const activeDetailCartKey =
    selectedProduct && activeDetailUnit
      ? buildCartKey(selectedProduct.id, activeDetailUnit.unit_id)
      : "";
  const detailInCartItem = activeDetailCartKey
    ? cart.find((c) => c.cartKey === activeDetailCartKey)
    : undefined;
  const detailUnitCap = activeDetailUnit
    ? activeDetailUnit.max_qty !== undefined && activeDetailUnit.max_qty > 0
      ? activeDetailUnit.max_qty
      : activeDetailUnit.available_unit_qty !== undefined &&
          activeDetailUnit.available_unit_qty > 0
        ? activeDetailUnit.available_unit_qty
        : maxQtyPerItem
    : maxQtyPerItem;
  const detailInCartCap = detailInCartItem
    ? getCartItemMaxCap(detailInCartItem, cart)
    : detailUnitCap;
  const detailStockText =
    selectedProduct && activeDetailUnit
      ? formatConvertedUnitStock(selectedProduct, activeDetailUnit)
      : null;

  // Quick modal props (if invoked)
  const modalUnits = quickModalProduct ? getProductSellingUnits(quickModalProduct) : [];
  const activeModalUnit = quickModalProduct
    ? pickSelectedUnit(quickModalProduct, selectedUnitByProductId)
    : null;
  const modalUnitCap = activeModalUnit
    ? activeModalUnit.max_qty !== undefined && activeModalUnit.max_qty > 0
      ? activeModalUnit.max_qty
      : activeModalUnit.available_unit_qty !== undefined &&
          activeModalUnit.available_unit_qty > 0
        ? activeModalUnit.available_unit_qty
        : maxQtyPerItem
    : maxQtyPerItem;
  const modalStockText =
    quickModalProduct && activeModalUnit
      ? formatConvertedUnitStock(quickModalProduct, activeModalUnit)
      : null;

  return (
    <div
      style={themeVars}
      className="min-h-screen flex flex-col bg-[#F6F8F7] text-[#11242D] antialiased"
      data-testid="storefront-active"
    >
      {/* Global Header */}
      <SiteHeader
        sf={sf}
        branding={branding}
        settings={settings}
        displayName={displayName}
        activeView={activeView}
        onSelectView={handleSelectView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSubmitSearch={() => handleSelectView("shop")}
        cartTotalItems={cartCalculations.totalItems}
        cartSubtotalPkr={cartCalculations.subtotalPkr}
        onOpenCartDrawer={() => setCartDrawerOpen(true)}
      />

      {/* Subtle Counter Sync Freshness Notice (Only when applicable) */}
      {stockSyncStale && (
        <div className="bg-[#FFF8ED] border-b border-[#EADBC4] px-4 py-2 text-center text-xs font-medium text-[#7A5B2B]">
          Live stock sync is refreshing — final item availability will be confirmed by {displayName}{" "}
          upon order review.
        </div>
      )}

      {/* Toast Feedback */}
      {cartToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-4 sm:right-6 z-50 max-w-sm bg-[#08352E] text-white px-4 py-3 rounded-2xl shadow-xl border border-white/15 text-xs font-semibold flex items-center gap-2.5"
        >
          <CheckCircleIcon className="w-4 h-4 text-[#E6A65B] shrink-0" />
          <span>{cartToast}</span>
        </div>
      )}

      {/* VIEW 1A: HOMEPAGE */}
      {activeView === "home" && (
        <main className="flex-1">
          <HomeView
            sf={sf}
            branding={branding}
            settings={settings}
            displayName={displayName}
            categories={categories}
            heroBanner={heroBanner}
            secondaryBanners={secondaryBanners}
            promotions={promotions}
            deliveryConfig={deliveryConfig}
            openingHours={openingHours}
            homeProducts={homeProducts}
            catalogSourceProducts={initialHomeCatalog.length > 0 ? initialHomeCatalog : products}
            loadingProducts={loadingProducts}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSubmitSearch={() => handleSelectView("shop")}
            onSelectCategory={setSelectedCategory}
            onSelectView={handleSelectView}
            onApplyPromoCode={(code) => {
              void handleApplyPromoCode(code);
            }}
            onOpenProductDetail={(prod) => {
              void openProductDetailPage(prod);
            }}
            onQuickAddToCart={(prod) => {
              addToCart(prod, 1, false);
            }}
            onQuickTrackOrder={(orderNo) => {
              const cleaned = orderNo.trim().toUpperCase();
              setTrackOrderNumber(cleaned);
              handleSelectView("track", { trackOrder: cleaned });
              if (cleaned) {
                void handleTrackOrder(undefined, cleaned);
              }
            }}
            renderProductCard={renderProductCard}
          />
        </main>
      )}

      {/* VIEW 1B: MEDICINES CATALOG */}
      {activeView === "shop" && (
        <CatalogView
          sf={sf}
          displayName={displayName}
          categories={categories}
          availableDosageForms={availableDosageForms}
          displayedProducts={displayedProducts}
          loadingProducts={loadingProducts}
          hasMore={hasMore}
          nextCursor={nextCursor}
          searchQuery={searchQuery}
          selectedCategory={selectedCategory}
          selectedDosageForm={selectedDosageForm}
          inStockOnly={inStockOnly}
          sortBy={sortBy}
          onSearchChange={setSearchQuery}
          onSelectCategory={setSelectedCategory}
          onSelectDosageForm={setSelectedDosageForm}
          onToggleInStockOnly={setInStockOnly}
          onSortChange={setSortBy}
          onLoadMore={() => {
            if (nextCursor) {
              void loadProductsPage({
                category: selectedCategory,
                search: searchQuery,
                inStockOnly,
                sort: sortBy,
                cursor: nextCursor,
                append: true,
              });
            }
          }}
          onResetFilters={resetCatalogFilters}
          renderProductCard={renderProductCard}
        />
      )}

      {/* VIEW 2: PRODUCT DETAIL PAGE */}
      {activeView === "product" && loadingProductDetail && !selectedProduct && (
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
          <div className="sf-card rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 animate-pulse">
            <div className="lg:col-span-5 aspect-[4/3] rounded-2xl bg-[#EEF3F0]" />
            <div className="lg:col-span-7 space-y-4">
              <div className="h-5 w-32 bg-[#E6EEEA] rounded-full" />
              <div className="h-8 w-3/4 bg-[#E6EEEA] rounded-xl" />
              <div className="h-4 w-1/2 bg-[#EEF3F0] rounded-lg" />
              <div className="h-36 w-full bg-[#EEF3F0] rounded-2xl mt-4" />
            </div>
          </div>
        </main>
      )}

      {activeView === "product" && selectedProduct && activeDetailUnit && (
        <ProductDetailView
          sf={sf}
          displayName={displayName}
          product={selectedProduct}
          units={detailUnits}
          activeUnit={activeDetailUnit}
          activeCartKey={activeDetailCartKey}
          inCartItem={detailInCartItem}
          detailQty={detailQty}
          detailUnitCap={detailUnitCap}
          inCartCap={detailInCartCap}
          convertedStockText={detailStockText}
          relatedProducts={relatedProducts}
          onChangeDetailQty={setDetailQty}
          onSelectUnit={selectProductUnit}
          onAddToCart={addToCart}
          onBuyNow={(prod, qty, unit) => {
            addToCart(prod, qty, false, unit);
            setCompletedOrder(null);
            handleSelectView("checkout");
          }}
          onUpdateCartQty={updateCartQty}
          onRemoveFromCart={removeFromCart}
          onSelectView={handleSelectView}
          onBackToCatalog={handleBackToCatalog}
          onSelectCategory={setSelectedCategory}
          onShowToast={showToast}
          renderProductCard={renderProductCard}
        />
      )}

      {/* VIEW 3: SHOPPING CART & CHECKOUT */}
      {(activeView === "cart" || activeView === "checkout") && (
        <CheckoutView
          sf={sf}
          branding={branding}
          settings={settings}
          displayName={displayName}
          cart={cart}
          cartCalculations={cartCalculations}
          deliveryConfig={deliveryConfig}
          deliveryZones={deliveryZones}
          branchesList={branchesList}
          customerName={customerName}
          onChangeCustomerName={setCustomerName}
          customerPhone={customerPhone}
          onChangeCustomerPhone={setCustomerPhone}
          customerEmail={customerEmail}
          onChangeCustomerEmail={setCustomerEmail}
          fulfillmentType={fulfillmentType}
          onChangeFulfillmentType={setFulfillmentType}
          deliveryAddress={deliveryAddress}
          onChangeDeliveryAddress={setDeliveryAddress}
          deliveryCity={deliveryCity}
          onChangeDeliveryCity={setDeliveryCity}
          deliveryInstructions={deliveryInstructions}
          onChangeDeliveryInstructions={setDeliveryInstructions}
          selectedZoneId={selectedZoneId}
          onChangeSelectedZoneId={setSelectedZoneId}
          selectedBranchId={selectedBranchId}
          onChangeSelectedBranchId={setSelectedBranchId}
          paymentMethod={paymentMethod}
          onChangePaymentMethod={setPaymentMethod}
          promoCodeInput={promoCodeInput}
          onChangePromoCodeInput={setPromoCodeInput}
          appliedPromoCode={appliedPromoCode}
          onApplyPromoCode={(code) => {
            void handleApplyPromoCode(code);
          }}
          customerNotes={customerNotes}
          onChangeCustomerNotes={setCustomerNotes}
          rxAcknowledged={rxAcknowledged}
          onChangeRxAcknowledged={setRxAcknowledged}
          rxInquiryNote={rxInquiryNote}
          onChangeRxInquiryNote={setRxInquiryNote}
          checkoutSubmitting={checkoutSubmitting}
          checkoutError={checkoutError}
          completedOrder={completedOrder}
          invoiceEmailQueued={invoiceEmailQueued}
          onClearCompletedOrder={() => {
            setCompletedOrder(null);
            setInvoiceEmailQueued(false);
          }}
          onSubmitOrder={handleCheckoutSubmit}
          getCartItemMaxCap={getCartItemMaxCap}
          onUpdateCartQty={updateCartQty}
          onRemoveFromCart={removeFromCart}
          onSelectView={handleSelectView}
          onTrackCompletedOrder={(orderNo, tok) => {
            setTrackOrderNumber(orderNo);
            setTrackToken(tok);
            setCompletedOrder(null);
            setInvoiceEmailQueued(false);
            handleSelectView("track");
            void handleTrackOrder(undefined, orderNo, tok);
          }}
          buildWhatsAppOrderShareUrl={buildWhatsAppOrderShareUrl}
          onShowToast={showToast}
        />
      )}

      {/* VIEW 4: ORDER TRACKING */}
      {activeView === "track" && (
        <OrderTrackingView
          sf={sf}
          branding={branding}
          displayName={displayName}
          trackOrderNumber={trackOrderNumber}
          onChangeTrackOrderNumber={setTrackOrderNumber}
          trackPhone={trackPhone}
          onChangeTrackPhone={setTrackPhone}
          trackingLoading={trackingLoading}
          trackedOrder={trackedOrder}
          trackingError={trackingError}
          onSubmitTrack={(e) => void handleTrackOrder(e)}
          onSelectView={handleSelectView}
        />
      )}

      {/* VIEW 5: INFORMATION PAGES */}
      {(activeView === "about" ||
        activeView === "branches" ||
        activeView === "delivery" ||
        activeView === "hours" ||
        activeView === "contact" ||
        activeView === "privacy" ||
        activeView === "terms") && (
        <InfoPagesView
          activeView={activeView}
          sf={sf}
          branding={branding}
          settings={settings}
          displayName={displayName}
          deliveryConfig={deliveryConfig}
          deliveryZones={deliveryZones}
          branchesList={branchesList}
          openingHours={openingHours}
          onSelectView={handleSelectView}
        />
      )}

      {/* Optional Quick Product Preview Modal */}
      <QuickProductModal
        product={quickModalProduct}
        units={modalUnits}
        activeUnit={activeModalUnit}
        modalQty={modalQty}
        modalUnitCap={modalUnitCap}
        convertedStockText={modalStockText}
        onChangeModalQty={setModalQty}
        onSelectUnit={selectProductUnit}
        onClose={() => setQuickModalProduct(null)}
        onOpenFullDetails={(p) => void openProductDetailPage(p)}
        onAddToCart={addToCart}
        onShowToast={showToast}
      />

      {/* Slide-Over Cart Drawer */}
      <CartDrawer
        open={cartDrawerOpen}
        displayName={displayName}
        cart={cart}
        totalItems={cartCalculations.totalItems}
        subtotalPkr={cartCalculations.subtotalPkr}
        remainingForFreeDelivery={cartCalculations.remainingForFreeDelivery}
        freeThreshold={cartCalculations.freeThreshold}
        deliveryEnabled={deliveryConfig?.delivery_enabled !== false}
        getCartItemMaxCap={getCartItemMaxCap}
        onUpdateCartQty={updateCartQty}
        onRemoveFromCart={removeFromCart}
        onClearCart={clearCart}
        onClose={() => setCartDrawerOpen(false)}
        onProceedToCheckout={() => {
          setCartDrawerOpen(false);
          setCompletedOrder(null);
          handleSelectView("checkout");
        }}
        onBrowseMedicines={() => handleSelectView("shop")}
        onOpenProductDetail={(prod) => {
          setCartDrawerOpen(false);
          void openProductDetailPage(prod);
        }}
        onShowToast={showToast}
      />

      {/* Global Commercial Footer */}
      <SiteFooter
        sf={sf}
        branding={branding}
        settings={settings}
        displayName={displayName}
        openingHours={openingHours}
        onSelectView={handleSelectView}
      />
    </div>
  );
}
