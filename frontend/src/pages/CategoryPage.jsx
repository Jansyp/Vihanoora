import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType, useParams, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import api, { getCatalog } from "@/lib/api";
import { Section, ProductGrid, GridSkeleton, Pagination, PRODUCT_PAGE_SIZE } from "@/components/common";

const GROUP_TITLE = {
  women: ["Women", "Jewellery, bracelets, hair accessories & more"],
  kids: ["Kids", "Toys, giftables & trending kids picks"],
  gifts: ["Gifts", "Thoughtful gifts & hampers for every occasion"],
  trending: ["Trending", "What everyone's loving right now"],
  "offer-zone": ["Offer Zone", "Live deals — auto-updated from real prices"],
  search: ["Search", ""],
};

const SORTS = [
  ["default", "Default"],
  ["biggest_discount", "Biggest Discount"],
  ["newest", "Newest"],
  ["price_asc", "Price: Low → High"],
  ["price_desc", "Price: High → Low"],
  ["best_selling", "Best Selling"],
];
const DISCOUNTS = [0, 10, 20, 30, 40, 50];
export default function CategoryPage({ type, group: groupProp }) {
  const params = useParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "";
  const group = type === "group" ? (groupProp || params.group) : null;
  const key = type === "group" ? group : type;
  const [title, subtitle] = GROUP_TITLE[key] || [key, ""];

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(type !== "group");
  const [priceDraft, setPriceDraft] = useState(Number(sp.get("max_price") || 5000));

  const defaultSort = type === "offer-zone" ? "biggest_discount" : "default";
  const sort = sp.get("sort") || defaultSort;
  const minDiscount = Number(sp.get("min_discount") || 0);
  const maxPrice = Number(sp.get("max_price") || 5000);
  const minPrice = sp.get("min_price") || "";
  const subcat = sp.get("category") || "";
  const stockStatus = sp.get("stock_status") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const scrollKey = `viaura:listing-scroll:${location.pathname}${location.search}`;
  const savedScrollPosition = Number(sessionStorage.getItem(scrollKey));
  const shouldRestoreScroll = navigationType === "POP" && Number.isFinite(savedScrollPosition) && savedScrollPosition > 0;
  const [reserveRestoreSpace, setReserveRestoreSpace] = useState(shouldRestoreScroll);
  const restoredKey = useRef(null);
  const suppressScrollSave = useRef(shouldRestoreScroll);
  const suppressionKey = useRef(scrollKey);

  if (suppressionKey.current !== scrollKey) {
    suppressionKey.current = scrollKey;
    suppressScrollSave.current = shouldRestoreScroll;
  }

  const updateParam = useCallback((name, value, defaultValue = "") => {
    const next = new URLSearchParams(sp);
    if (value && value !== defaultValue) next.set(name, value); else next.delete(name);
    if (name !== "page") next.delete("page");
    setSp(next, { replace: true });
  }, [sp, setSp]);

  useLayoutEffect(() => {
    if (!shouldRestoreScroll) setReserveRestoreSpace(false);
  }, [scrollKey, shouldRestoreScroll]);

  useEffect(() => {
    const saveScrollPosition = () => {
      if (suppressScrollSave.current) return;
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    window.addEventListener("scroll", saveScrollPosition, { passive: true });
    return () => window.removeEventListener("scroll", saveScrollPosition);
  }, [scrollKey]);

  useLayoutEffect(() => {
    if (!shouldRestoreScroll || loading || restoredKey.current === scrollKey) return undefined;

    let frame;
    let attempts = 0;
    let lastHeight = 0;
    let stableFrames = 0;

    const restore = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll >= savedScrollPosition || stableFrames >= 5 || attempts >= 60) {
        window.scrollTo(0, Math.min(savedScrollPosition, maxScroll));
        if (!loading) {
          sessionStorage.setItem(scrollKey, String(Math.min(savedScrollPosition, maxScroll)));
          suppressScrollSave.current = false;
          restoredKey.current = scrollKey;
          setReserveRestoreSpace(false);
        }
        return;
      }

      const currentHeight = document.documentElement.scrollHeight;
      stableFrames = currentHeight === lastHeight ? stableFrames + 1 : 0;
      lastHeight = currentHeight;
      attempts += 1;
      frame = requestAnimationFrame(restore);
    };

    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [loading, savedScrollPosition, scrollKey, shouldRestoreScroll]);

  useEffect(() => {
    if (type !== "group") return undefined;
    let active = true;
    getCatalog("/categories")
      .then(({ data }) => { if (active) setCategories(data); })
      .catch(() => {})
      .finally(() => { if (active) setCategoriesLoaded(true); });
    return () => { active = false; };
  }, [type]);

  useEffect(() => setPriceDraft(maxPrice), [maxPrice]);
  useEffect(() => {
    if (priceDraft === maxPrice) return undefined;
    const timer = setTimeout(() => updateParam("max_price", priceDraft, "5000"), 250);
    return () => clearTimeout(timer);
  }, [priceDraft, maxPrice, updateParam]);

  const subcats = useMemo(() => {
    const c = categories.find((c) => c.group === group);
    return c?.subcategories || [];
  }, [categories, group]);
  const selectedCategory = subcats.find((category) => category.slug === subcat || category.name === subcat);
  const categoryQuery = selectedCategory?.name || subcat;
  const searchParamsKey = sp.toString();

  useEffect(() => {
    if (!categoriesLoaded) return undefined;
    setLoading(true);
    setItems([]);
    setTotal(0);
    const requestParams = new URLSearchParams({ page: String(page), limit: String(PRODUCT_PAGE_SIZE), sort });
    const currentParams = new URLSearchParams(searchParamsKey);
    const flags = ["trending", "best_seller", "new_arrival", "featured", "giftable"];
    flags.forEach((flag) => {
      if (currentParams.get(flag) === "true") requestParams.set(flag, "true");
    });
    let url;
    if (type === "offer-zone") {
      requestParams.set("min_discount", String(minDiscount));
      url = `/offer-zone?${requestParams.toString()}`;
    } else {
      if (group) requestParams.set("group", group);
      if (type === "trending") requestParams.set("trending", "true");
      if (type === "search" && q) requestParams.set("q", q);
      if (categoryQuery) requestParams.set("category", categoryQuery);
      if (minDiscount) requestParams.set("min_discount", String(minDiscount));
      if (minPrice) requestParams.set("min_price", minPrice);
      requestParams.set("max_price", String(maxPrice));
      if (stockStatus) requestParams.set("stock_status", stockStatus);
      url = `/products?${requestParams.toString()}`;
    }
    let active = true;
    getCatalog(url).then(({ data }) => {
      if (!active) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
    }).catch(() => {
      if (!active) return;
      setItems([]);
      setTotal(0);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [categoriesLoaded, type, group, q, sort, minDiscount, maxPrice, minPrice, categoryQuery, stockStatus, page, searchParamsKey]);

  const selectCategory = (value) => updateParam("category", value);
  const changePage = (nextPage) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(nextPage));
    setSp(next, { replace: true });
  };

  return (
    <Section>
      <div style={reserveRestoreSpace ? { minHeight: `calc(${savedScrollPosition}px + 100vh)` } : undefined}>
      <div className="mb-6">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--ink)]">{type === "search" ? `Search: "${q}"` : title}</h1>
        {subtitle && <p className="text-[var(--ink-soft)] mt-1">{subtitle}</p>}
        {!loading && <p className="text-sm text-[var(--ink-soft)] mt-1">{total} products</p>}
      </div>

      {group && subcats.length > 0 && (
        <div className="mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
          <div className="flex w-max min-w-full gap-2" role="tablist" aria-label={`${title} product categories`}>
            {[{ name: "All", value: "" }, ...subcats.map((category) => ({ name: category.name, value: category.slug }))].map((category) => {
              const selected = subcat === category.value;
              return (
                <button
                  key={category.value || "all"}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectCategory(category.value)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selected ? "bg-[var(--ink)] text-white" : "bg-white border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]"}`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <button data-testid="toggle-filters" onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-sm font-medium">
          <SlidersHorizontal size={15} /> Filters
        </button>
        <select data-testid="sort-select" value={sort} onChange={(e) => updateParam("sort", e.target.value, defaultSort)}
          className="px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-sm font-medium outline-none">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {DISCOUNTS.map((d) => (
            <button key={d} onClick={() => updateParam("min_discount", d ? String(d) : "")} data-testid={`discount-filter-${d}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${minDiscount === d ? "bg-[var(--brand)] text-white" : "bg-white border border-[var(--line)] text-[var(--ink-soft)]"}`}>
              {d === 0 ? "All" : `${d}%+`}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="mb-6 p-5 bg-white rounded-3xl border border-[var(--line)] flex flex-col sm:flex-row gap-6">
          {subcats.length > 0 && (
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => selectCategory("")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${!subcat ? "bg-[var(--ink)] text-white" : "bg-[var(--card-2)]"}`}>All</button>
                {subcats.map((s) => (
                  <button key={s.slug} onClick={() => selectCategory(s.slug)} data-testid={`subcat-${s.slug}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${subcat === s.slug ? "bg-[var(--ink)] text-white" : "bg-[var(--card-2)]"}`}>{s.name}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold mb-2">Max Price: ₹{maxPrice}</p>
            <input type="range" min="100" max="5000" step="100" value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)} className="w-full accent-[var(--brand)]" data-testid="price-range" />
          </div>
        </div>
      )}

      {loading ? <GridSkeleton n={PRODUCT_PAGE_SIZE} /> : items.length === 0 ? (
        <div className="text-center py-20 text-[var(--ink-soft)]">
          <p className="text-lg">No products found.</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : <ProductGrid products={items} />}
      {!loading && items.length > 0 && <Pagination page={page} total={total} onPageChange={changePage} />}
      </div>
    </Section>
  );
}
