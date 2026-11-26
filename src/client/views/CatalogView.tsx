import React from "react";
import type {
  PublicStorefrontProduct,
  StorefrontCategoryRecord,
  StorefrontPublicContext,
} from "../../shared/types";
import { isMeaningfulCategory } from "../design/theme";
import { CheckCircleIcon, CloseIcon, SearchIcon } from "../components/Icons";

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
      label: `Category: ${selectedCategory}`,
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
    <main id="catalog" className="flex-1 flex flex-col sf-fade-up">
      {/* Compact Branded Catalog Header Band (Keeps Products Immediately Visible) */}
      <section className="sf-surface-forest border-b border-white/10">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#F2C47E] block">
              {displayName} • {sf.city}
            </span>
            <h1 className="sf-heading text-xl sm:text-2xl lg:text-[28px] font-extrabold text-white leading-tight">
              Medicines &amp; Healthcare Catalog
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-medium text-[#EAF5F1] self-start sm:self-auto tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            <span>
              Showing <strong>{displayedProducts.length}</strong>
              {hasActiveFilters ? " matching" : ""} of{" "}
              <strong>{sf.published_products_count}</strong> live items
            </span>
          </div>
        </div>
      </section>

      {/* Sticky Professional Filter & Search Toolbar */}
      <section
        aria-label="Catalog Search and Filters"
        className="sticky top-16 sm:top-[76px] z-20 bg-white border-b border-[#E1EAE5] shadow-[0_4px_14px_-10px_rgba(15,35,44,0.12)]"
      >
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 space-y-3">
          {/* Row 1: Search + Compact Filter Controls */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <SearchIcon className="w-4 h-4 text-[#546A76] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search medicine name, salt, strength, or surgical item…"
                data-testid="catalog-search-input"
                className="w-full h-10 sm:h-11 rounded-xl sf-input pl-10 pr-16 text-sm"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-[#F2F6F4] flex items-center justify-center text-[#546A76] hover:text-[#0F232C] transition"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="hidden sm:inline-flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 h-5 rounded border border-[#D4E0DA] bg-[#F6F8F7] font-mono text-[10.5px] font-semibold text-[#647A86] pointer-events-none"
                >
                  /
                </kbd>
              )}
            </div>

            {/* Secondary Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              {availableDosageForms.length > 1 && (
                <select
                  value={selectedDosageForm}
                  onChange={(e) => onSelectDosageForm(e.target.value)}
                  aria-label="Filter by Dosage Form"
                  className="h-10 sm:h-11 rounded-xl sf-input px-3 text-xs font-semibold text-[#0F232C] cursor-pointer"
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
                className="h-10 sm:h-11 rounded-xl sf-input px-3 text-xs font-semibold text-[#0F232C] cursor-pointer"
              >
                <option value="featured">Sort: Featured</option>
                <option value="name_asc">Name: A to Z</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>

              {/* Tactile In-Stock Filter Toggle Button */}
              <button
                type="button"
                role="switch"
                aria-checked={inStockOnly}
                onClick={() => onToggleInStockOnly(!inStockOnly)}
                className={`h-10 sm:h-11 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition select-none ${
                  inStockOnly
                    ? "bg-[#EAF5F1] text-[#0E5146] border-[#9EC8BA]"
                    : "bg-[#F6F8F7] text-[#455C68] border-[#D3DFE0] hover:border-[#9EB7AD] hover:text-[#0F232C]"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                    inStockOnly ? "bg-[#0E5146] text-white" : "bg-white border border-[#BACAC2]"
                  }`}
                >
                  {inStockOnly && <CheckCircleIcon className="w-3 h-3" />}
                </span>
                <span>In-Stock Only</span>
              </button>
            </div>
          </div>

          {/* Row 2: Clean Horizontal Category Pill Strip */}
          {validCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              <button
                type="button"
                onClick={() => onSelectCategory("all")}
                className={`h-8 px-3.5 rounded-full text-xs whitespace-nowrap border transition shrink-0 ${
                  selectedCategory === "all"
                    ? "sf-pill-active font-bold shadow-2xs"
                    : "bg-[#F6F8F7] text-[#4A606C] border-[#DCE6E1] hover:bg-[#EDF4F1] hover:text-[#0F232C] font-semibold"
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
                    onClick={() => onSelectCategory(active ? "all" : cat.name)}
                    className={`h-8 px-3.5 rounded-full text-xs whitespace-nowrap border transition shrink-0 ${
                      active
                        ? "sf-pill-active font-bold shadow-2xs"
                        : "bg-[#F6F8F7] text-[#4A606C] border-[#DCE6E1] hover:bg-[#EDF4F1] hover:text-[#0F232C] font-semibold"
                    }`}
                  >
                    {cat.name}
                    {count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* Row 3: Active Filter Chips (1-Click Individual Removal + Clear All) */}
          {hasActiveFilters && (
            <div className="pt-2 border-t border-[#EDF3F0] flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#647A86] mr-1">
                Active:
              </span>
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full bg-[#EAF5F1] text-[#0E5146] border border-[#C1DFD5] hover:bg-[#DCEEE8] font-semibold transition"
                >
                  <span>{chip.label}</span>
                  <CloseIcon className="w-3 h-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={onResetFilters}
                className="ml-auto text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline px-2 py-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Subtle Non-Blocking Filter Refresh Bar */}
        {loadingProducts && displayedProducts.length > 0 && (
          <div className="h-0.5 w-full bg-[#E2ECE7] overflow-hidden">
            <div className="h-full w-1/3 bg-[var(--sf-primary)] animate-pulse" />
          </div>
        )}
      </section>

      {/* Lightweight Crisp Product Grid Workspace (Zero Heavy GPU Blur Layers) */}
      <section className="sf-catalog-showcase-bg flex-1">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-7">
          {loadingProducts && displayedProducts.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="rounded-2xl bg-white border border-[#E1EAE5] overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-[#F1F5F3]" />
                  <div className="p-4 space-y-2.5">
                    <div className="h-3 w-24 bg-[#E6EEEA] rounded" />
                    <div className="h-4 w-4/5 bg-[#E6EEEA] rounded" />
                    <div className="h-3 w-3/5 bg-[#EEF3F0] rounded" />
                    <div className="h-9 w-full bg-[#E6EEEA] rounded-xl mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="sf-card rounded-2xl p-10 sm:p-12 text-center space-y-3.5 max-w-lg mx-auto my-6">
              <div className="w-14 h-14 rounded-2xl bg-[#EEF7F4] border border-[#CDE3DB] flex items-center justify-center mx-auto sf-text-brand">
                <SearchIcon className="w-6 h-6" />
              </div>
              <h2 className="sf-heading text-lg font-bold text-[#0F232C]">
                No Matching Medicines Found
              </h2>
              <p className="text-sm text-[#546A76] max-w-md mx-auto">
                Try adjusting your search keywords or removing active category, dosage form, or
                in-stock filters.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="mt-1 h-10 px-5 rounded-xl sf-btn-primary text-xs font-bold"
                >
                  Reset Search &amp; Filters
                </button>
              )}
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 transition-opacity duration-150 ${
                loadingProducts ? "opacity-75" : "opacity-100"
              }`}
              data-testid="public-product-grid"
            >
              {displayedProducts.map((prod) => renderProductCard(prod))}
            </div>
          )}

          {/* Load More Pagination */}
          {hasMore && nextCursor && (
            <div className="text-center pt-2 space-y-2">
              <button
                type="button"
                disabled={loadingProducts}
                onClick={onLoadMore}
                className="h-11 px-7 rounded-xl sf-btn-secondary text-xs font-bold shadow-2xs"
              >
                {loadingProducts ? "Loading more medicines…" : "Load More Medicines"}
              </button>
              <p className="text-[11.5px] text-[#647A86] tabular-nums">
                Showing {displayedProducts.length} of {sf.published_products_count} medicines
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
