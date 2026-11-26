import React, { useEffect, useRef, useState } from "react";
import type { PublicStorefrontProduct } from "../../shared/types";
import { fetchPublicSearchSuggestions, type SearchSuggestionsResponse } from "../api";
import { cleanProductText } from "../design/theme";
import {
  ArrowRightIcon,
  CloseIcon,
  MedicinePlaceholderIllustration,
  SearchIcon,
  ShoppingBagIcon,
} from "./Icons";

interface SmartSearchBarProps {
  value: string;
  onChange: (q: string) => void;
  onSubmit: (q: string) => void;
  onSelectProduct: (prod: PublicStorefrontProduct) => void;
  onQuickAdd?: (prod: PublicStorefrontProduct) => void;
  placeholder?: string;
  size?: "header" | "hero" | "catalog";
  testId?: string;
  showShortcutHint?: boolean;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q || q.length < 2) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#DCFCE7] text-[#065F46] font-bold rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function SuggestionRow({
  product,
  query,
  isActive,
  isAlternative,
  onSelect,
  onQuickAdd,
}: {
  product: PublicStorefrontProduct;
  query: string;
  isActive: boolean;
  isAlternative?: boolean;
  onSelect: () => void;
  onQuickAdd?: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const isOut =
    product.availability_status === "out_of_stock" ||
    product.availability_status === "unavailable";
  const generic = cleanProductText(product.generic_name);
  const strength = cleanProductText(product.strength);
  const price = Number(
    product.effective_price_pkr ??
      product.override_price_pkr ??
      product.public_selling_price_pkr ??
      0
  );
  const unitName =
    (Array.isArray(product.selling_units) && product.selling_units[0]?.unit_name) ||
    product.unit_label ||
    "Pack";

  return (
    <div
      role="option"
      aria-selected={isActive}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
        isActive ? "bg-[#F1F5F9]" : "bg-white hover:bg-[#F8FAFC]"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-12 h-12 rounded-lg bg-white border border-[#E2E8F0] p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
          {product.primary_image_url && !imgErr ? (
            <img
              src={product.primary_image_url}
              alt={product.name}
              loading="lazy"
              decoding="async"
              onError={() => setImgErr(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <MedicinePlaceholderIllustration
              name={product.name}
              dosageForm={product.dosage_form}
              categoryName={product.category_name}
              className="w-full h-full scale-90"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13.5px] font-bold text-[#0F172A] truncate">
              {isAlternative ? product.name : highlightMatch(product.name, query)}
            </span>
            {strength && (
              <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#E2E8F0] text-[10px] font-mono font-bold text-[#334155] shrink-0">
                {strength}
              </span>
            )}
            {product.requires_prescription && (
              <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-700 shrink-0">
                Rx
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-[#64748B] truncate">
            {generic && (
              <span className="truncate font-medium text-[#334155]">
                Salt: {isAlternative ? generic : highlightMatch(generic, query)}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 font-bold shrink-0 ${
                isOut
                  ? "text-rose-600"
                  : product.availability_status === "low_stock"
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOut
                    ? "bg-rose-500"
                    : product.availability_status === "low_stock"
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                }`}
              />
              {isOut ? "Out of Stock" : "In Stock"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="text-right">
          <span className="block text-[13px] font-extrabold text-[#0F172A] tabular-nums">
            PKR {price.toLocaleString()}
          </span>
          <span className="block text-[10.5px] text-[#64748B]">/ {unitName}</span>
        </div>

        {!isOut && onQuickAdd && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAdd();
            }}
            aria-label={`Add ${product.name} to cart`}
            className="h-8 px-2.5 rounded-lg sf-btn-primary text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
          >
            <ShoppingBagIcon className="w-3 h-3" />
            <span>Add</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function SmartSearchBar({
  value,
  onChange,
  onSubmit,
  onSelectProduct,
  onQuickAdd,
  placeholder = "Search medicines, generic salt (e.g. Paracetamol), or healthcare items…",
  size = "header",
  testId,
  showShortcutHint = false,
}: SmartSearchBarProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchSuggestionsResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Fetch debounced live suggestions + generic alternatives
  useEffect(() => {
    const trimmed = value.trim();
    if (!open || trimmed.length < 2) {
      setData(null);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetchPublicSearchSuggestions(trimmed, {
          limit: 6,
          signal: ctrl.signal,
        });
        if (!ctrl.signal.aborted) {
          setData(res);
          setActiveIndex(-1);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setData(null);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [value, open]);

  const flatItems: PublicStorefrontProduct[] = [
    ...(data?.suggestions || []),
    ...(data?.alternatives || []),
  ];

  const showDropdown = open && value.trim().length >= 2;

  const isHero = size === "hero";
  const isCatalog = size === "catalog";

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          onSubmit(value);
        }}
        className={`flex items-center bg-white border transition-all ${
          isHero
            ? "h-12 sm:h-[52px] rounded-xl border-[#CBD5E1] focus-within:border-[var(--sf-primary)] focus-within:ring-3 focus-within:ring-[var(--sf-primary-soft)] p-1.5 shadow-xs"
            : isCatalog
              ? "h-11 rounded-xl border-[#CBD5E1] focus-within:border-[var(--sf-primary)] focus-within:ring-2 focus-within:ring-[var(--sf-primary-soft)] px-1"
              : "h-10 sm:h-11 rounded-xl border-[#CBD5E1] bg-[#F8FAFC] focus-within:bg-white focus-within:border-[var(--sf-primary)] focus-within:ring-2 focus-within:ring-[var(--sf-primary-soft)] px-1"
        }`}
      >
        <SearchIcon className="w-4 h-4 text-[#64748B] ml-2.5 shrink-0" />
        <input
          type="search"
          value={value}
          data-testid={testId}
          aria-label="Search medicines and generic formulas"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!showDropdown) return;
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((prev) =>
                flatItems.length === 0 ? -1 : (prev + 1) % flatItems.length
              );
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((prev) =>
                flatItems.length === 0
                  ? -1
                  : prev <= 0
                    ? flatItems.length - 1
                    : prev - 1
              );
            } else if (e.key === "Enter" && activeIndex >= 0 && flatItems[activeIndex]) {
              e.preventDefault();
              setOpen(false);
              onSelectProduct(flatItems[activeIndex]);
            }
          }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 bg-transparent px-2.5 text-[#0F172A] placeholder:text-[#64748B] focus:outline-none ${
            isHero ? "text-sm font-medium" : "text-[13.5px] font-medium"
          }`}
        />

        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setData(null);
            }}
            aria-label="Clear search"
            className="w-7 h-7 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] transition shrink-0 mr-1"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        ) : showShortcutHint ? (
          <kbd
            aria-hidden="true"
            className="hidden sm:inline-flex items-center justify-center px-1.5 h-5 mr-2 rounded border border-[#CBD5E1] bg-[#F8FAFC] font-mono text-[10.5px] font-semibold text-[#64748B] pointer-events-none"
          >
            /
          </kbd>
        ) : null}

        {isHero && (
          <button
            type="submit"
            className="h-9 sm:h-10 px-4 sm:px-5 rounded-lg sf-btn-primary text-xs sm:text-[13px] font-bold inline-flex items-center gap-1.5 shrink-0"
          >
            <span>Search</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </form>

      {/* Solid E-Commerce Autocomplete & Generic-Salt Alternatives Dropdown */}
      {showDropdown && (
        <div
          role="listbox"
          data-testid="search-suggestions-dropdown"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-white rounded-xl border border-[#CBD5E1] shadow-xl overflow-hidden max-h-[72vh] overflow-y-auto"
        >
          {loading && !data ? (
            <div className="px-4 py-5 text-xs font-medium text-[#64748B] flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--sf-primary)] border-t-transparent animate-spin" />
              <span>Searching live pharmacy stock…</span>
            </div>
          ) : data && data.suggestions.length === 0 && data.alternatives.length === 0 ? (
            <div className="px-4 py-5 text-center space-y-1.5">
              <p className="text-sm font-bold text-[#0F172A]">
                No direct match for &ldquo;{value.trim()}&rdquo;
              </p>
              <p className="text-xs text-[#64748B]">
                Try searching by generic salt (e.g. Paracetamol, Amoxicillin, Omeprazole) or browse
                all medicines.
              </p>
            </div>
          ) : data ? (
            <>
              {/* Direct Matching Medicines */}
              {data.suggestions.length > 0 && (
                <div>
                  <div className="px-3.5 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                    <span>Matching Medicines</span>
                    <span className="tabular-nums">{data.total_matches} found</span>
                  </div>
                  <div className="divide-y divide-[#F1F5F9]">
                    {data.suggestions.map((prod, idx) => (
                      <SuggestionRow
                        key={prod.id}
                        product={prod}
                        query={value}
                        isActive={activeIndex === idx}
                        onSelect={() => {
                          setOpen(false);
                          onSelectProduct(prod);
                        }}
                        onQuickAdd={onQuickAdd ? () => onQuickAdd(prod) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Automatic Generic-Salt Alternatives When Searched Medicine Is Out of Stock / Unavailable */}
              {data.alternatives.length > 0 && (
                <div className="border-t border-[#E2E8F0]">
                  <div className="px-3.5 py-2.5 bg-[#ECFDF5] border-b border-[#BBF7D0] space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#065F46]">
                        {data.alternative_reason === "out_of_stock_match" ||
                        data.alternative_reason === "unavailable_brand"
                          ? "Available Same-Formula Alternatives"
                          : "More Options With Same Generic Formula"}
                      </span>
                      {data.matched_generic && (
                        <span className="px-2 py-0.5 rounded bg-white border border-[#A7F3D0] text-[10.5px] font-bold text-[#065F46] truncate max-w-[180px]">
                          {data.matched_generic}
                        </span>
                      )}
                    </div>
                    {(data.alternative_reason === "out_of_stock_match" ||
                      data.alternative_reason === "unavailable_brand") &&
                      data.matched_unavailable_name && (
                        <p className="text-[11.5px] text-[#047857] font-medium">
                          <strong>{data.matched_unavailable_name}</strong> is currently unavailable —
                          showing in-stock medicines with the exact same generic formula.
                        </p>
                      )}
                  </div>
                  <div className="divide-y divide-[#F1F5F9]">
                    {data.alternatives.map((alt, idx) => (
                      <SuggestionRow
                        key={alt.id}
                        product={alt}
                        query={value}
                        isAlternative
                        isActive={activeIndex === data.suggestions.length + idx}
                        onSelect={() => {
                          setOpen(false);
                          onSelectProduct(alt);
                        }}
                        onQuickAdd={onQuickAdd ? () => onQuickAdd(alt) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* View All Search Results Action Footer */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onSubmit(value);
                }}
                className="w-full px-4 py-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border-t border-[#E2E8F0] text-xs font-bold sf-text-brand flex items-center justify-between transition"
              >
                <span>See all results for &ldquo;{value.trim()}&rdquo;</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
