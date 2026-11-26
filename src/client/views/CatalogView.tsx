import React from "react";
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

  return (
    <main id="catalog" className="flex-1 flex flex-col bg-[#F6F7F9] sf-fade-up">
      {/* 1. Clean E-Commerce Breadcrumb & Department Title Bar */}
      <section className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#6B7280]">
              <button
                type="button"
                onClick={onSelectHome}
                className="hover:text-[#111827] font-medium transition"
              >
                Home
              </button>
              <ChevronRightIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
              <span className="font-semibold text-[#111827]">
                {selectedCategory !== "all" ? selectedCategory : "All Medicines"}
              </span>
            </nav>
            <h1 className="sf-heading text-lg sm:text-2xl font-extrabold text-[#111827]">
              {selectedCategory !== "all" ? selectedCategory : `${displayName} Medicines`}
            </h1>
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#4B5563] tabular-nums">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>
              Showing <strong className="text-[#111827]">{displayedProducts.length}</strong> of{" "}
              <strong className="text-[#111827]">{sf.published_products_count}</strong> live products
            </span>
          </div>
        </div>
      </section>

      {/* 2. Flagship Retail 2-Column Catalog Grid */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
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
                    className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition ${
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
          <div className="lg:col-span-9 space-y-4">
            {/* Compact Toolbar (Filter within results + Sort + Mobile Pills) */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-3 space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {availableDosageForms.length > 1 && (
                    <select
                      value={selectedDosageForm}
                      onChange={(e) => onSelectDosageForm(e.target.value)}
                      aria-label="Filter by Dosage Form"
                      className="lg:hidden h-10 rounded-lg sf-input px-2.5 text-xs font-bold text-[#111827]"
                    >
                      <option value="all">All Forms</option>
                      {availableDosageForms.map((form) => (
                        <option key={form} value={form}>
                          {form}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    value={sortBy}
                    onChange={(e) => onSortChange(e.target.value)}
                    aria-label="Sort Medicines"
                    className="h-10 rounded-lg sf-input px-3 text-xs font-bold text-[#111827] cursor-pointer"
                  >
                    <option value="featured">Sort: Featured</option>
                    <option value="name_asc">Name: A to Z</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={inStockOnly}
                    onClick={() => onToggleInStockOnly(!inStockOnly)}
                    className={`lg:hidden h-10 px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition ${
                      inStockOnly
                        ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary-ink)] border-[var(--sf-primary-border)]"
                        : "bg-[#F9FAFB] text-[#374151] border-[#D1D5DB]"
                    }`}
                  >
                    <span>In-Stock</span>
                  </button>
                </div>
              </div>

              {/* Mobile Horizontal Categories */}
              {validCategories.length > 0 && (
                <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                  <button
                    type="button"
                    onClick={() => onSelectCategory("all")}
                    className={`h-8 px-3 rounded-lg text-xs whitespace-nowrap border transition shrink-0 ${
                      selectedCategory === "all"
                        ? "bg-[#111827] text-white border-[#111827] font-bold"
                        : "bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] font-semibold"
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
                        className={`h-8 px-3 rounded-lg text-xs whitespace-nowrap border transition shrink-0 ${
                          active
                            ? "bg-[#111827] text-white border-[#111827] font-bold"
                            : "bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] font-semibold"
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Filter Chips */}
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

            {/* Same-Formula Generic Alternatives */}
            {genericAlternatives.length > 0 && (
              <div className="rounded-xl border border-emerald-300 bg-[#ECFDF5] p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                      Same-Formula Alternatives In Stock
                    </span>
                    <h2 className="sf-heading text-base font-extrabold text-[#111827]">
                      {matchedGeneric
                        ? `Available Medicines with Generic: ${matchedGeneric}`
                        : "Available Same-Formula Alternatives"}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-xs font-bold text-emerald-800">
                    {genericAlternatives.length} in stock
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                  {genericAlternatives.map((alt) => renderProductCard(alt))}
                </div>
              </div>
            )}

            {/* Main Dense Commercial Grid (2-col Mobile, 4-col Desktop) */}
            {loadingProducts && displayedProducts.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <div
                    key={n}
                    className="rounded-xl bg-white border border-[#E5E7EB] overflow-hidden animate-pulse"
                  >
                    <div className="h-[175px] bg-[#F3F4F6]" />
                    <div className="p-3.5 space-y-2">
                      <div className="h-2.5 w-16 bg-[#E5E7EB] rounded" />
                      <div className="h-4 w-4/5 bg-[#E5E7EB] rounded" />
                      <div className="h-9 w-full bg-[#E5E7EB] rounded-lg mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              genericAlternatives.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-10 text-center space-y-3 max-w-lg mx-auto my-4">
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
                      className="mt-1 h-9 px-4 rounded-lg sf-btn-primary text-xs font-bold"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : null
            ) : (
              <div
                className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 transition-opacity duration-150 ${
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
                  className="h-10 px-6 rounded-lg sf-btn-secondary text-xs font-bold"
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
    </main>
  );
}
