import React, { useEffect, useState } from "react";
import type {
  PublicStorefrontProduct,
  StorefrontCategoryRecord,
  StorefrontPublicContext,
} from "../../shared/types";
import { isMeaningfulCategory } from "../design/theme";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CloseIcon,
  SearchIcon,
  SlidersIcon,
} from "../components/Icons";
import { SmartSearchBar } from "../components/SmartSearchBar";

interface CatalogViewProps {
  sf: StorefrontPublicContext;
  displayName: string;
  categories: StorefrontCategoryRecord[];
  availableDosageForms: string[];
  displayedProducts: PublicStorefrontProduct[];
  genericAlternatives?: PublicStorefrontProduct[];
  matchedGeneric?: string | null;
  loadingProducts: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  searchQuery: string;
  selectedCategory: string;
  selectedDosageForm: string;
  inStockOnly: boolean;
  sortBy: string;
  onSearchChange: (q: string) => void;
  onSelectCategory: (cat: string) => void;
  onSelectDosageForm: (form: string) => void;
  onToggleInStockOnly: (checked: boolean) => void;
  onSortChange: (sort: string) => void;
  onSelectHome?: () => void;
  onOpenProductDetail: (prod: PublicStorefrontProduct) => void;
  onQuickAddToCart: (prod: PublicStorefrontProduct) => void;
  onLoadMore: () => void;
  onResetFilters: () => void;
  renderProductCard: (prod: PublicStorefrontProduct) => React.ReactNode;
}

const SORT_LABELS: Record<string, string> = {
  featured: "Featured",
  name_asc: "Name: A–Z",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
};

export function CatalogView({
  sf,
  displayName,
  categories,
  availableDosageForms,
  displayedProducts,
  genericAlternatives = [],
  matchedGeneric = null,
  loadingProducts,
  hasMore,
  nextCursor,
  searchQuery,
  selectedCategory,
  selectedDosageForm,
  inStockOnly,
  sortBy,
  onSearchChange,
  onSelectCategory,
  onSelectDosageForm,
  onToggleInStockOnly,
  onSortChange,
  onSelectHome,
  onOpenProductDetail,
  onQuickAddToCart,
  onLoadMore,
  onResetFilters,
  renderProductCard,
}: CatalogViewProps) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    if (!filterSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterSheetOpen]);

  const validCategories = categories.filter(isMeaningfulCategory);

  const activeFilterChips: Array<{ id: string; label: string; onRemove: () => void }> = [];
  if (searchQuery.trim()) {
    activeFilterChips.push({
      id: "q",
      label: `Search: "${searchQuery.trim()}"`,
      onRemove: () => onSearchChange(""),
    });
  }
  if (selectedCategory !== "all") {
    activeFilterChips.push({
      id: "cat",
      label: `Department: ${selectedCategory}`,
      onRemove: () => onSelectCategory("all"),
    });
  }
  if (selectedDosageForm !== "all") {
    activeFilterChips.push({
      id: "form",
      label: `Form: ${selectedDosageForm}`,
      onRemove: () => onSelectDosageForm("all"),
    });
  }
  if (inStockOnly) {
    activeFilterChips.push({
      id: "stock",
      label: "In-Stock Only",
      onRemove: () => onToggleInStockOnly(false),
    });
  }
  if (sortBy !== "featured") {
    activeFilterChips.push({
      id: "sort",
      label: `Sort: ${SORT_LABELS[sortBy] || sortBy}`,
      onRemove: () => onSortChange("featured"),
    });
  }

  const hasActiveFilters = activeFilterChips.length > 0;
  const mobileSheetFilterCount =
    (selectedCategory !== "all" ? 1 : 0) +
    (selectedDosageForm !== "all" ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (sortBy !== "featured" ? 1 : 0);

  return (
    <main id="catalog" className="flex-1 flex flex-col bg-[#F6F7F9] sf-fade-up">
      {/* 1. Clean E-Commerce Breadcrumb & Department Title Bar */}
      <section className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2.5">
          <div className="space-y-0.5 min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#6B7280]">
              <button
                type="button"
                onClick={onSelectHome}
                className="hover:text-[#111827] font-medium transition"
              >
                Home
              </button>
              <ChevronRightIcon className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span className="font-semibold text-[#111827] truncate">
                {selectedCategory !== "all" ? selectedCategory : "All Medicines"}
              </span>
            </nav>
            <h1 className="sf-heading text-lg sm:text-2xl font-extrabold text-[#111827] truncate">
              {selectedCategory !== "all" ? selectedCategory : `${displayName} Medicines`}
            </h1>
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#4B5563] tabular-nums shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>
              Showing <strong className="text-[#111827]">{displayedProducts.length}</strong> of{" "}
              <strong className="text-[#111827]">{sf.published_products_count}</strong> live products
            </span>
          </div>
        </div>
      </section>

      {/* 1B. Sticky Compact Mobile Filter + Sort Bar (Instant Thumb Access Above Products) */}
      <div
        data-testid="mobile-catalog-filter-bar"
        className="lg:hidden sticky top-[116px] md:top-[68px] z-20 bg-white border-b border-[#E5E7EB] shadow-[0_2px_8px_rgba(17,24,39,0.04)]"
      >
        {validCategories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto snap-x no-scrollbar px-3.5 pt-2.5 pb-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory("all")}
              className={`snap-start min-h-[34px] px-3 rounded-full text-xs whitespace-nowrap border transition active:scale-[0.96] shrink-0 ${
                selectedCategory === "all"
                  ? "bg-[#111827] text-white border-[#111827] font-bold"
                  : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB] font-semibold"
              }`}
            >
              All ({sf.published_products_count})
            </button>
            {validCategories.map((cat) => {
              const active = selectedCategory.toLowerCase() === cat.name.toLowerCase();
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(active ? "all" : cat.name)}
                  className={`snap-start min-h-[34px] px-3 rounded-full text-xs whitespace-nowrap border transition active:scale-[0.96] shrink-0 ${
                    active
                      ? "bg-[#111827] text-white border-[#111827] font-bold"
                      : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB] font-semibold"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="px-3.5 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            data-testid="mobile-open-filter-sheet-btn"
            className="flex-1 min-h-[42px] px-3 rounded-lg sf-btn-secondary text-xs font-bold inline-flex items-center justify-center gap-1.5"
          >
            <SlidersIcon className="w-4 h-4 sf-text-brand shrink-0" />
            <span>Filter &amp; Sort</span>
            {mobileSheetFilterCount > 0 && (
              <span
                className="min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-extrabold inline-flex items-center justify-center tabular-nums"
                style={{ backgroundColor: "var(--sf-primary)" }}
              >
                {mobileSheetFilterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={inStockOnly}
            onClick={() => onToggleInStockOnly(!inStockOnly)}
            className={`min-h-[42px] px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition active:scale-[0.97] ${
              inStockOnly
                ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary-ink)] border-[var(--sf-primary-border)]"
                : "bg-[#F9FAFB] text-[#374151] border-[#D1D5DB]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                inStockOnly ? "bg-[var(--sf-primary)]" : "bg-[#9CA3AF]"
              }`}
            />
            <span>In Stock Only</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              aria-label="Reset all filters"
              className="min-h-[42px] px-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold shrink-0 active:scale-[0.97]"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* 2. Flagship Retail 2-Column Catalog Grid */}
      <div className="max-w-7xl mx-auto w-full px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
          {/* Desktop Sticky Left Filter Sidebar */}
          <aside
            aria-label="Catalog Filters"
            className="hidden lg:block lg:col-span-3 sticky top-[120px] space-y-4"
          >
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-5">
              <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-3">
                <h2 className="sf-heading text-xs font-extrabold text-[#111827] uppercase tracking-wider">
                  Filter Products
                </h2>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="text-xs font-bold text-rose-600 hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Availability */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
                  Availability
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inStockOnly}
                  onClick={() => onToggleInStockOnly(!inStockOnly)}
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-bold flex items-center justify-between transition ${
                    inStockOnly
                      ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary-ink)] border-[var(--sf-primary-border)]"
                      : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB] hover:border-[#D1D5DB]"
                  }`}
                >
                  <span>In-Stock Only</span>
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center transition ${
                      inStockOnly
                        ? "bg-[var(--sf-primary)] text-white"
                        : "bg-white border border-[#D1D5DB]"
                    }`}
                  >
                    {inStockOnly && <CheckCircleIcon className="w-3 h-3" />}
                  </span>
                </button>
              </div>

              {/* Departments */}
              {validCategories.length > 0 && (
                <div className="space-y-1 border-t border-[#F3F4F6] pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block pb-1">
                    Department
                  </span>
                  <div className="space-y-0.5 max-h-[280px] overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => onSelectCategory("all")}
                      className={`w-full px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                        selectedCategory === "all"
                          ? "bg-[#111827] text-white font-bold"
                          : "text-[#374151] hover:bg-[#F3F4F6] font-medium"
                      }`}
                    >
                      <span>All Departments</span>
                      <span
                        className={`tabular-nums text-[11px] ${
                          selectedCategory === "all" ? "text-slate-300" : "text-[#6B7280]"
                        }`}
                      >
                        {sf.published_products_count}
                      </span>
                    </button>

                    {validCategories.map((cat) => {
                      const active = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                      const count = Number(cat.published_product_count || 0);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => onSelectCategory(active ? "all" : cat.name)}
                          className={`w-full px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition ${
                            active
                              ? "bg-[#111827] text-white font-bold"
                              : "text-[#374151] hover:bg-[#F3F4F6] font-medium"
                          }`}
                        >
                          <span className="truncate text-left">{cat.name}</span>
                          {count > 0 && (
                            <span
                              className={`tabular-nums text-[11px] shrink-0 ${
                                active ? "text-slate-300" : "text-[#6B7280]"
                              }`}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dosage Form */}
              {availableDosageForms.length > 1 && (
                <div className="space-y-2 border-t border-[#F3F4F6] pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
                    Dosage Form
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectDosageForm("all")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                        selectedDosageForm === "all"
                          ? "bg-[#111827] text-white border-[#111827]"
                          : "bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] hover:border-[#9CA3AF]"
                      }`}
                    >
                      All
                    </button>
                    {availableDosageForms.map((form) => {
                      const active = selectedDosageForm.toLowerCase() === form.toLowerCase();
                      return (
                        <button
                          key={form}
                          type="button"
                          onClick={() => onSelectDosageForm(active ? "all" : form)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                            active
                              ? "bg-[#111827] text-white border-[#111827]"
                              : "bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] hover:border-[#9CA3AF]"
                          }`}
                        >
                          {form}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Main Product Column */}
          <div className="lg:col-span-9 space-y-3.5 sm:space-y-4">
            {/* Desktop Search + Sort Toolbar */}
            <div className="hidden lg:block bg-white rounded-xl border border-[#E5E7EB] p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SmartSearchBar
                    value={searchQuery}
                    onChange={onSearchChange}
                    onSubmit={(q) => onSearchChange(q)}
                    onSelectProduct={onOpenProductDetail}
                    onQuickAdd={onQuickAddToCart}
                    size="catalog"
                    showShortcutHint
                    testId="catalog-search-input"
                    placeholder="Filter by medicine name, generic salt, or strength…"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => onSortChange(e.target.value)}
                  aria-label="Sort Medicines"
                  className="h-10 rounded-lg sf-input px-3 text-xs font-bold text-[#111827] cursor-pointer shrink-0"
                >
                  <option value="featured">Sort: Featured</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>

              {hasActiveFilters && (
                <div className="pt-2 border-t border-[#F3F4F6] flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mr-1">
                    Active:
                  </span>
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={chip.onRemove}
                      className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-md sf-badge-brand hover:brightness-95 font-bold transition"
                    >
                      <span>{chip.label}</span>
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="ml-auto text-xs font-bold text-rose-600 hover:underline px-2 py-1"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Active Filter Chips (Shown Only When Active) */}
            {hasActiveFilters && (
              <div className="lg:hidden flex flex-wrap items-center gap-1.5 text-xs">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={chip.onRemove}
                    className="inline-flex items-center gap-1.5 min-h-[32px] pl-2.5 pr-2 rounded-full sf-badge-brand font-bold transition active:scale-[0.96]"
                  >
                    <span className="truncate max-w-[200px]">{chip.label}</span>
                    <CloseIcon className="w-3 h-3 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Same-Formula Generic Alternatives */}
            {genericAlternatives.length > 0 && (
              <div className="rounded-xl border border-emerald-300 bg-[#ECFDF5] p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                      Same-Formula Alternatives In Stock
                    </span>
                    <h2 className="sf-heading text-sm sm:text-base font-extrabold text-[#111827]">
                      {matchedGeneric
                        ? `Available Medicines with Generic: ${matchedGeneric}`
                        : "Available Same-Formula Alternatives"}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-xs font-bold text-emerald-800 shrink-0">
                    {genericAlternatives.length} in stock
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
                  {genericAlternatives.map((alt) => renderProductCard(alt))}
                </div>
              </div>
            )}

            {/* Main Dense Commercial Grid (2-col Mobile, 4-col Desktop) */}
            {loadingProducts && displayedProducts.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <div
                    key={n}
                    className="rounded-xl bg-white border border-[#E5E7EB] overflow-hidden animate-pulse"
                  >
                    <div className="aspect-square sm:aspect-auto sm:h-[175px] bg-[#F3F4F6]" />
                    <div className="p-2.5 sm:p-3.5 space-y-2">
                      <div className="h-2.5 w-16 bg-[#E5E7EB] rounded" />
                      <div className="h-4 w-4/5 bg-[#E5E7EB] rounded" />
                      <div className="h-10 sm:h-9 w-full bg-[#E5E7EB] rounded-lg mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              genericAlternatives.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 sm:p-10 text-center space-y-3 max-w-lg mx-auto my-4">
                  <div className="w-12 h-12 rounded-xl bg-[#F3F4F6] flex items-center justify-center mx-auto sf-text-brand">
                    <SearchIcon className="w-5 h-5" />
                  </div>
                  <h2 className="sf-heading text-base font-bold text-[#111827]">
                    No Matching Medicines Found
                  </h2>
                  <p className="text-xs sm:text-sm text-[#6B7280] max-w-md mx-auto">
                    Try searching by generic salt (e.g. Paracetamol, Amoxicillin, Omeprazole) or
                    clearing active filters.
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={onResetFilters}
                      className="mt-1 min-h-[42px] px-5 rounded-lg sf-btn-primary text-xs font-bold"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : null
            ) : (
              <div
                className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 transition-opacity duration-150 ${
                  loadingProducts ? "opacity-75" : "opacity-100"
                }`}
                data-testid="public-product-grid"
              >
                {displayedProducts.map((prod) => renderProductCard(prod))}
              </div>
            )}

            {/* Load More */}
            {hasMore && nextCursor && (
              <div className="text-center pt-3 space-y-1.5">
                <button
                  type="button"
                  disabled={loadingProducts}
                  onClick={onLoadMore}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 sm:h-10 px-6 rounded-lg sf-btn-secondary text-xs font-bold"
                >
                  {loadingProducts ? "Loading more medicines…" : "Load More Medicines"}
                </button>
                <p className="text-xs text-[#6B7280] tabular-nums">
                  Showing {displayedProducts.length} of {sf.published_products_count} medicines
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Slide-Up Filter & Sort Sheet */}
      {filterSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1220]/55 flex items-end lg:hidden"
          onClick={() => setFilterSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Filter and Sort Medicines"
        >
          <div
            className="sf-sheet-enter bg-white w-full rounded-t-2xl max-h-[84dvh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-2.5 pb-1 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
            </div>

            <div className="px-4 py-2.5 border-b border-[#E5E7EB] flex items-center justify-between">
              <h2 className="sf-heading text-base font-extrabold text-[#111827]">
                Filter &amp; Sort
              </h2>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close filters"
                className="min-w-[40px] min-h-[40px] rounded-lg sf-btn-secondary flex items-center justify-center"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Sort By */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
                  Sort By
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "featured", label: "Featured" },
                    { value: "name_asc", label: "Name: A–Z" },
                    { value: "price_asc", label: "Price: Low → High" },
                    { value: "price_desc", label: "Price: High → Low" },
                  ].map((opt) => {
                    const active = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onSortChange(opt.value)}
                        className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition active:scale-[0.97] ${
                          active
                            ? "bg-[#111827] text-white border-[#111827]"
                            : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Availability */}
              <div className="space-y-2 border-t border-[#F3F4F6] pt-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
                  Availability
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inStockOnly}
                  onClick={() => onToggleInStockOnly(!inStockOnly)}
                  className={`w-full min-h-[46px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-between transition active:scale-[0.98] ${
                    inStockOnly
                      ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary-ink)] border-[var(--sf-primary-border)]"
                      : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]"
                  }`}
                >
                  <span>Show In-Stock Medicines Only</span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                      inStockOnly
                        ? "bg-[var(--sf-primary)] text-white"
                        : "bg-white border border-[#D1D5DB]"
                    }`}
                  >
                    {inStockOnly && <CheckCircleIcon className="w-3.5 h-3.5" />}
                  </span>
                </button>
              </div>

              {/* Department */}
              {validCategories.length > 0 && (
                <div className="space-y-2 border-t border-[#F3F4F6] pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
                    Department
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectCategory("all")}
                      className={`min-h-[40px] px-3 rounded-lg text-xs font-bold border transition active:scale-[0.97] ${
                        selectedCategory === "all"
                          ? "bg-[#111827] text-white border-[#111827]"
                          : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]"
                      }`}
                    >
                      All Departments
                    </button>
                    {validCategories.map((cat) => {
                      const active = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => onSelectCategory(active ? "all" : cat.name)}
                          className={`min-h-[40px] px-3 rounded-lg text-xs font-bold border transition active:scale-[0.97] ${
                            active
                              ? "bg-[#111827] text-white border-[#111827]"
                              : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]"
                          }`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dosage Form */}
              {availableDosageForms.length > 1 && (
                <div className="space-y-2 border-t border-[#F3F4F6] pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block">
                    Dosage Form
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectDosageForm("all")}
                      className={`min-h-[40px] px-3 rounded-lg text-xs font-bold border transition active:scale-[0.97] ${
                        selectedDosageForm === "all"
                          ? "bg-[#111827] text-white border-[#111827]"
                          : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]"
                      }`}
                    >
                      All Forms
                    </button>
                    {availableDosageForms.map((form) => {
                      const active = selectedDosageForm.toLowerCase() === form.toLowerCase();
                      return (
                        <button
                          key={form}
                          type="button"
                          onClick={() => onSelectDosageForm(active ? "all" : form)}
                          className={`min-h-[40px] px-3 rounded-lg text-xs font-bold border transition active:scale-[0.97] ${
                            active
                              ? "bg-[#111827] text-white border-[#111827]"
                              : "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]"
                          }`}
                        >
                          {form}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] border-t border-[#E5E7EB] bg-[#F9FAFB] grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetFilters();
                  setFilterSheetOpen(false);
                }}
                className="col-span-1 min-h-[44px] rounded-xl sf-btn-secondary text-xs font-bold"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="col-span-2 min-h-[44px] rounded-xl sf-btn-primary text-xs font-bold"
              >
                Show {displayedProducts.length} Medicines
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
