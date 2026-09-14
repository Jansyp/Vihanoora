import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import api from "@/lib/api";
import { Section, ProductGrid, GridSkeleton } from "@/components/common";

const GROUP_TITLE = {
  women: ["Women", "Jewellery, bracelets, hair accessories & more"],
  kids: ["Kids", "Toys, giftables & trending kids picks"],
  gifts: ["Gifts", "Thoughtful gifts & hampers for every occasion"],
  trending: ["Trending", "What everyone's loving right now"],
  "offer-zone": ["Offer Zone", "Live deals — auto-updated from real prices"],
  search: ["Search", ""],
};

const SORTS = [
  ["biggest_discount", "Biggest Discount"],
  ["newest", "Newest"],
  ["price_asc", "Price: Low → High"],
  ["price_desc", "Price: High → Low"],
  ["best_selling", "Best Selling"],
];
const DISCOUNTS = [0, 10, 20, 30, 40, 50];

export default function CategoryPage({ type, group: groupProp }) {
  const params = useParams();
  const [sp] = useSearchParams();
  const q = sp.get("q") || "";
  const group = type === "group" ? (groupProp || params.group) : null;
  const key = type === "group" ? group : type;
  const [title, subtitle] = GROUP_TITLE[key] || [key, ""];

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(type === "offer-zone" ? "biggest_discount" : "newest");
  const [minDiscount, setMinDiscount] = useState(0);
  const [maxPrice, setMaxPrice] = useState(5000);
  const [subcat, setSubcat] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => { api.get("/categories").then(({ data }) => setCategories(data)).catch(() => {}); }, []);

  const subcats = useMemo(() => {
    const c = categories.find((c) => c.group === group);
    return c?.subcategories || [];
  }, [categories, group]);

  useEffect(() => {
    setLoading(true);
    let url;
    if (type === "offer-zone") {
      url = `/offer-zone?limit=60&sort=${sort}&min_discount=${minDiscount}`;
    } else {
      const parts = [`limit=60`, `sort=${sort}`];
      if (group) parts.push(`group=${group}`);
      if (type === "trending") parts.push("trending=true");
      if (type === "search" && q) parts.push(`q=${encodeURIComponent(q)}`);
      if (subcat) parts.push(`category=${subcat}`);
      if (minDiscount) parts.push(`min_discount=${minDiscount}`);
      parts.push(`max_price=${maxPrice}`);
      url = `/products?${parts.join("&")}`;
    }
    api.get(url).then(({ data }) => setItems(data.items || [])).finally(() => setLoading(false));
  }, [type, group, q, sort, minDiscount, maxPrice, subcat]);

  return (
    <Section>
      <div className="mb-6">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--ink)]">{type === "search" ? `Search: "${q}"` : title}</h1>
        {subtitle && <p className="text-[var(--ink-soft)] mt-1">{subtitle}</p>}
        {!loading && <p className="text-sm text-[var(--ink-soft)] mt-1">{items.length} products</p>}
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <button data-testid="toggle-filters" onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-sm font-medium">
          <SlidersHorizontal size={15} /> Filters
        </button>
        <select data-testid="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}
          className="px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-sm font-medium outline-none">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {DISCOUNTS.map((d) => (
            <button key={d} onClick={() => setMinDiscount(d)} data-testid={`discount-filter-${d}`}
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
                <button onClick={() => setSubcat("")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${!subcat ? "bg-[var(--ink)] text-white" : "bg-[var(--card-2)]"}`}>All</button>
                {subcats.map((s) => (
                  <button key={s.slug} onClick={() => setSubcat(s.slug)} data-testid={`subcat-${s.slug}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${subcat === s.slug ? "bg-[var(--ink)] text-white" : "bg-[var(--card-2)]"}`}>{s.name}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold mb-2">Max Price: ₹{maxPrice}</p>
            <input type="range" min="100" max="5000" step="100" value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-[var(--brand)]" data-testid="price-range" />
          </div>
        </div>
      )}

      {loading ? <GridSkeleton /> : items.length === 0 ? (
        <div className="text-center py-20 text-[var(--ink-soft)]">
          <p className="text-lg">No products found.</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : <ProductGrid products={items} />}
    </Section>
  );
}
