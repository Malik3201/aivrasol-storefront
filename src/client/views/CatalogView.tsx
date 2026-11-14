import React from "react";
import type {
  PublicStorefrontProduct,
  StorefrontCategoryRecord,
  StorefrontPublicContext,
} from "../../shared/types";
import { isMeaningfulCategory } from "../design/theme";
import { CloseIcon, SearchIcon } from "../components/Icons";

interface CatalogViewProps {
  sf: StorefrontPublicContext;
  displayName: string;
  categories: StorefrontCategoryRecord[];
  availableDosageForms: string[];
  displayedProducts: PublicStorefrontProduct[];
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
  onLoadMore: () => void;
  onResetFilters: () => void;
  renderProductCard: (prod: PublicStorefrontProduct) => React.ReactNode;
}

export function CatalogView({
  sf,
  displayName,
  categories,
  availableDosageForms,
  displayedProducts,
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
  onLoadMore,
  onResetFilters,
  renderProductCard,
}: CatalogViewProps) {
  const validCategories = categories.filter(isMeaningfulCategory);
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    selectedCategory !== "all" ||
    selectedDosageForm !== "all" ||
    inStockOnly;

  return (
    <main id="catalog" className="flex-1 sf-fade-up">
      {/* Branded Catalog Header Band */}
      <section className="sf-surface-forest border-b border-white/10">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-[#E6A65B]">
                {displayName} • {sf.city}
              </span>
              <h1 className="sf-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">
                Medicines & Healthcare Catalog
              </h1>
              <p className="text-sm text-[#D3E8E2] max-w-2xl">
                Select your required pack, strip, or unit directly from counter-verified pharmacy
                stock.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/12 border border-white/18 text-xs font-medium text-[#FFF8ED] self-start sm:self-auto tabular-nums">
              <span>
                Showing <strong>{displayedProducts.length}</strong> of{" "}
                <strong>{sf.published_products_count}</strong> items
              </span>
            </div>
          </div>

          {/* Integrated Search & Filter Control Card */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-lg border border-white/20 space-y-3.5 text-[#172B36]">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <SearchIcon className="w-4 h-4 text-[#607481] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search medicine name, strength, generic salt, or surgical item…"
                  data-testid="catalog-search-input"
                  className="w-full h-11 rounded-xl sf-input pl-10 pr-9 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-[#F3F6F4] flex items-center justify-center text-[#607481]"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter & Sort Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                {availableDosageForms.length > 1 && (
                  <select
                    value={selectedDosageForm}
                    onChange={(e) => onSelectDosageForm(e.target.value)}
                    aria-label="Filter by Dosage Form"
                    className="h-11 rounded-xl sf-input px-3.5 text-xs font-semibold text-[#172B36]"
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
                  className="h-11 rounded-xl sf-input px-3.5 text-xs font-semibold text-[#172B36]"
                >
                  <option value="featured">Sort: Featured</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>

                <label className="inline-flex items-center gap-2 h-11 px-3.5 rounded-xl border border-[#CDDAd4] bg-[#FAF8F4] text-xs font-semibold text-[#172B36] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => onToggleInStockOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-[#CBD5E1] accent-[var(--sf-primary)]"
                  />
                  <span>In-Stock Only</span>
                </label>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="h-11 px-3.5 rounded-xl sf-btn-secondary text-xs font-semibold text-rose-600"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Pills */}
            {validCategories.length > 0 && (
              <div className="pt-3 border-t border-[#E8EFEA] flex sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-visible no-scrollbar">
                <button
                  type="button"
                  onClick={() => onSelectCategory("all")}
                  className={`h-8 px-3.5 rounded-full text-xs whitespace-nowrap border transition ${
                    selectedCategory === "all"
                      ? "sf-pill-active font-semibold"
                      : "bg-[#FAF8F4] text-[#4D616E] border-[#DBE5E0] hover:text-[#172B36] hover:border-[var(--sf-primary)] font-medium"
                  }`}
                >
                  All ({sf.published_products_count})
                </button>
                {validCategories.map((cat) => {
                  const active = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                  const count = Number(cat.published_product_count || 0);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSelectCategory(cat.name)}
                      className={`h-8 px-3.5 rounded-full text-xs whitespace-nowrap border transition ${
                        active
                          ? "sf-pill-active font-semibold"
                          : "bg-[#FAF8F4] text-[#4D616E] border-[#DBE5E0] hover:text-[#172B36] hover:border-[var(--sf-primary)] font-medium"
                      }`}
                    >
                      {cat.name}
                      {count > 0 ? ` (${count})` : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Product Grid Area */}
      <section className="sf-catalog-showcase-bg relative overflow-hidden flex-1">
        {/* Ambient Mint-Aqua & Pearl Blooms Behind Frosted Glass Cards */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-24 w-96 h-96 rounded-full bg-[#64D6BA]/36 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-1/3 w-96 h-96 rounded-full bg-[#77DCD0]/36 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/3 bottom-12 w-[28rem] h-72 rounded-full bg-[#FCE0B6]/38 blur-3xl"
        />

        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-9 sm:py-12 space-y-8 relative z-10">
          {loadingProducts && displayedProducts.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="rounded-[24px] bg-white border border-[#DBE5E0] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-[#EEF4F1]" />
                  <div className="p-5 space-y-3">
                    <div className="h-3 w-24 bg-[#E6EEEA] rounded" />
                    <div className="h-4 w-3/4 bg-[#E6EEEA] rounded" />
                    <div className="h-9 w-full bg-[#E6EEEA] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="sf-card rounded-3xl p-12 text-center space-y-3.5 max-w-xl mx-auto">
              <div className="w-14 h-14 rounded-2xl sf-surface-mint border border-[var(--sf-primary-border)] flex items-center justify-center mx-auto sf-text-brand">
                <SearchIcon className="w-6 h-6" />
              </div>
              <h2 className="sf-heading text-lg font-bold text-[#172B36]">
                No Matching Medicines Found
              </h2>
              <p className="text-sm text-[#607481] max-w-md mx-auto">
                Try adjusting your search keywords or clearing active category and stock filters.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="mt-1 h-10 px-5 rounded-xl sf-btn-primary text-xs font-semibold"
                >
                  Reset Search & Filters
                </button>
              )}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6"
              data-testid="public-product-grid"
            >
              {displayedProducts.map((prod) => renderProductCard(prod))}
            </div>
          )}

          {/* Load More Pagination */}
          {hasMore && nextCursor && (
            <div className="text-center pt-2">
              <button
                type="button"
                disabled={loadingProducts}
                onClick={onLoadMore}
                className="h-11 px-7 rounded-full sf-btn-secondary text-xs font-bold shadow-2xs"
              >
                {loadingProducts ? "Loading more items…" : "Load More Medicines"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
