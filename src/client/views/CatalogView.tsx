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
    <main id="catalog" className="flex-1 flex flex-col bg-[#F5F7F9] sf-fade-up">
      {/* 1. Clean Solid E-Commerce Breadcrumb & Title Strip */}
      <section className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#64748B]">
              <button
                type="button"
                onClick={onSelectHome}
                className="hover:text-[#0F172A] font-medium transition"
              >
                Home
              </button>
              <ChevronRightIcon className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span className="font-semibold text-[#0F172A]">
                {selectedCategory !== "all" ? selectedCategory : "Medicines & Healthcare Catalog"}
              </span>
            </nav>
            <h1 className="sf-heading text-xl sm:text-2xl font-extrabold text-[#0F172A]">
              {selectedCategory !== "all"
                ? selectedCategory
                : `${displayName} — Medicines Catalog`}
            </h1>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-semibold text-[#334155] self-start sm:self-auto tabular-nums">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>
              Showing <strong>{displayedProducts.length}</strong>
              {hasActiveFilters ? " matching" : ""} of{" "}
              <strong>{sf.published_products_count}</strong> live products
            </span>
          </div>
        </div>
      </section>

      {/* 2. Solid 2-Column E-Commerce Catalog Workspace */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Desktop Left Sticky Filter Sidebar */}
          <aside
            aria-label="Catalog Filters"
            className="hidden lg:block lg:col-span-3 sticky top-[128px] space-y-4"
          >
            <div className="sf-card rounded-2xl p-4 space-y-5">
              <div className="flex items-center justify-between border-b border-[#EDF2F7] pb-3">
                <h2 className="sf-heading text-sm font-extrabold text-[#0F172A] uppercase tracking-wider">
                  Filters
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

              {/* Availability Toggle */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block">
                  Availability
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inStockOnly}
                  onClick={() => onToggleInStockOnly(!inStockOnly)}
                  className={`w-full h-10 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
                    inStockOnly
                      ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary-ink)] border-[var(--sf-primary-border)]"
                      : "bg-[#F8FAFC] text-[#334155] border-[#E2E8F0] hover:border-[#CBD5E1]"
                  }`}
                >
                  <span>In-Stock Only</span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                      inStockOnly
                        ? "bg-[var(--sf-primary)] text-white"
                        : "bg-white border border-[#CBD5E1]"
                    }`}
                  >
                    {inStockOnly && <CheckCircleIcon className="w-3.5 h-3.5" />}
                  </span>
                </button>
              </div>

              {/* Departments / Categories List */}
              {validCategories.length > 0 && (
                <div className="space-y-1.5 border-t border-[#EDF2F7] pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block pb-1">
                    Department
                  </span>
                  <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => onSelectCategory("all")}
                      className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                        selectedCategory === "all"
                          ? "sf-pill-active font-bold"
                          : "text-[#334155] hover:bg-[#F1F5F9] font-semibold"
                      }`}
                    >
                      <span>All Departments</span>
                      <span
                        className={`tabular-nums text-[11px] ${
                          selectedCategory === "all" ? "text-white/85" : "text-[#64748B]"
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
                          className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 transition ${
                            active
                              ? "sf-pill-active font-bold"
                              : "text-[#334155] hover:bg-[#F1F5F9] font-semibold"
                          }`}
                        >
                          <span className="truncate text-left">{cat.name}</span>
                          {count > 0 && (
                            <span
                              className={`tabular-nums text-[11px] shrink-0 ${
                                active ? "text-white/85" : "text-[#64748B]"
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

              {/* Dosage Form Filter */}
              {availableDosageForms.length > 1 && (
                <div className="space-y-2 border-t border-[#EDF2F7] pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block">
                    Dosage Form
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectDosageForm("all")}
                      className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold border transition ${
                        selectedDosageForm === "all"
                          ? "sf-pill-active"
                          : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:border-[#94A3B8]"
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
                          className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold border transition ${
                            active
                              ? "sf-pill-active"
                              : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:border-[#94A3B8]"
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

          {/* Main Catalog Column */}
          <div className="lg:col-span-9 space-y-4">
            {/* Solid Top Control Toolbar (Search + Sort + Mobile Filters) */}
            <div className="sf-card rounded-2xl p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                    placeholder="Search medicine name, generic salt, or strength…"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {availableDosageForms.length > 1 && (
                    <select
                      value={selectedDosageForm}
                      onChange={(e) => onSelectDosageForm(e.target.value)}
                      aria-label="Filter by Dosage Form"
                      className="lg:hidden h-11 rounded-xl sf-input px-3 text-xs font-bold text-[#0F172A]"
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
                    className="h-11 rounded-xl sf-input px-3 text-xs font-bold text-[#0F172A] cursor-pointer"
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
                    className={`lg:hidden h-11 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition ${
                      inStockOnly
                        ? "bg-[var(--sf-primary-soft)] text-[var(--sf-primary-ink)] border-[var(--sf-primary-border)]"
                        : "bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]"
                    }`}
                  >
                    <span>In-Stock</span>
                  </button>
                </div>
              </div>

              {/* Mobile Category Pill Strip */}
              {validCategories.length > 0 && (
                <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectCategory("all")}
                    className={`h-8 px-3 rounded-lg text-xs whitespace-nowrap border transition shrink-0 ${
                      selectedCategory === "all"
                        ? "sf-pill-active font-bold"
                        : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] font-semibold"
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
                            ? "sf-pill-active font-bold"
                            : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] font-semibold"
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Filter Chips Bar */}
              {hasActiveFilters && (
                <div className="pt-2.5 border-t border-[#EDF2F7] flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mr-1">
                    Active:
                  </span>
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={chip.onRemove}
                      className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-lg sf-badge-brand hover:brightness-95 font-bold transition"
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

            {/* Automatic Same-Formula Generic Alternatives Section When Searched Medicine Is Unavailable */}
            {genericAlternatives.length > 0 && (
              <div className="rounded-2xl border-2 border-emerald-300 bg-[#ECFDF5] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                      Same-Formula Alternatives In Stock
                    </span>
                    <h2 className="sf-heading text-base sm:text-lg font-extrabold text-[#0F172A]">
                      {matchedGeneric
                        ? `Available Medicines with Generic Formula: ${matchedGeneric}`
                        : "Available Same-Formula Alternatives"}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-xs font-bold text-emerald-800">
                    {genericAlternatives.length} in stock
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {genericAlternatives.map((alt) => renderProductCard(alt))}
                </div>
              </div>
            )}

            {/* Main Product Grid */}
            {loadingProducts && displayedProducts.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden animate-pulse"
                  >
                    <div className="h-8 bg-[#F8FAFC]" />
                    <div className="aspect-[4/3] bg-[#F1F5F9]" />
                    <div className="p-4 space-y-2.5">
                      <div className="h-3 w-20 bg-[#E2E8F0] rounded" />
                      <div className="h-4 w-4/5 bg-[#E2E8F0] rounded" />
                      <div className="h-9 w-full bg-[#E2E8F0] rounded-xl mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              genericAlternatives.length === 0 ? (
                <div className="sf-card rounded-2xl p-10 sm:p-12 text-center space-y-3.5 max-w-lg mx-auto my-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center mx-auto sf-text-brand">
                    <SearchIcon className="w-6 h-6" />
                  </div>
                  <h2 className="sf-heading text-lg font-bold text-[#0F172A]">
                    No Matching Medicines Found
                  </h2>
                  <p className="text-sm text-[#64748B] max-w-md mx-auto">
                    Try searching by generic salt (e.g. Paracetamol, Amoxicillin, Omeprazole) or
                    clearing active department and stock filters.
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
              ) : null
            ) : (
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 transition-opacity duration-150 ${
                  loadingProducts ? "opacity-75" : "opacity-100"
                }`}
                data-testid="public-product-grid"
              >
                {displayedProducts.map((prod) => renderProductCard(prod))}
              </div>
            )}

            {/* Load More Pagination */}
            {hasMore && nextCursor && (
              <div className="text-center pt-3 space-y-2">
                <button
                  type="button"
                  disabled={loadingProducts}
                  onClick={onLoadMore}
                  className="h-11 px-7 rounded-xl sf-btn-secondary text-xs font-bold"
                >
                  {loadingProducts ? "Loading more medicines…" : "Load More Medicines"}
                </button>
                <p className="text-xs text-[#64748B] tabular-nums">
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
