import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Truck, ShieldCheck, RefreshCw, Instagram } from "lucide-react";
import api, { formatINR } from "@/lib/api";
import FeaturedProductHero from "@/components/FeaturedProductHero";
import CategoryTiles from "@/components/CategoryTiles";
import { useSettings } from "@/context/SettingsContext";
import { themeBg } from "@/lib/themes";
import { Section, SectionHeader, ProductRow, ProductGrid, GridSkeleton, Reveal } from "@/components/common";

const REVIEWS = [
  { name: "Ananya R.", text: "The crystal bracelet is even prettier in person. Packaging felt so premium!", rating: 5 },
  { name: "Priya M.", text: "Ordered a birthday hamper — my friend loved it. Fast delivery too.", rating: 5 },
  { name: "Sneha K.", text: "So many cute scrunchies at little prices. Already reordering!", rating: 5 },
  { name: "Divya S.", text: "Kids toys are great quality. The combo saved me a lot.", rating: 4 },
];

const DEFAULT_ORDER = [
  { key: "trending", enabled: true, order: 1 },
  { key: "best_sellers", enabled: true, order: 2 },
  { key: "offer_banner", enabled: true, order: 3 },
  { key: "new_arrivals", enabled: true, order: 4 },
  { key: "gift_picks", enabled: true, order: 5 },
  { key: "combos", enabled: true, order: 6 },
  { key: "instagram", enabled: true, order: 7 },
  { key: "reviews", enabled: true, order: 8 },
  { key: "newsletter", enabled: true, order: 9 },
];

export default function Home() {
  const { settings } = useSettings();
  const [data, setData] = useState({});
  const [combos, setCombos] = useState([]);
  const [offer, setOffer] = useState({ items: [], max_discount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [best, trend, arr, gift, cmb, oz] = await Promise.all([
          api.get("/products?best_seller=true&limit=8"),
          api.get("/products?trending=true&limit=8"),
          api.get("/products?new_arrival=true&limit=8"),
          api.get("/products?giftable=true&limit=8"),
          api.get("/combos"),
          api.get("/offer-zone?limit=8"),
        ]);
        setData({ best: best.data.items, trend: trend.data.items, arr: arr.data.items, gift: gift.data.items });
        setCombos(cmb.data);
        setOffer(oz.data);
      } finally { setLoading(false); }
    })();
  }, []);

  const sections = {
    trending: (c) => (
      <Section key="trending">
        <SectionHeader subtitle={c.subtitle || "#Vihaanora"} title={c.title || "Trending on Instagram"} to="/trending" />
        <ProductRow products={data.trend || []} />
      </Section>
    ),
    best_sellers: (c) => (
      <Section key="best_sellers">
        <SectionHeader subtitle={c.subtitle || "Loved by many"} title={c.title || "Best Sellers"} to="/women" />
        <ProductGrid products={(data.best || []).slice(0, 8)} />
      </Section>
    ),
    offer_banner: (c) => (
      <Section key="offer_banner">
        <Reveal>
          <Link to="/offer-zone" className="block relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[var(--brand)] to-[var(--terracotta)] text-white p-8 sm:p-12">
            <div className="relative z-10">
              <span className="text-xs font-semibold tracking-widest uppercase">{c.subtitle || "Flash & Everyday Deals"}</span>
              <h3 className="font-serif text-3xl sm:text-4xl font-semibold mt-2">{c.title || `Up to ${offer.max_discount || 50}% Off`}</h3>
              <p className="mt-2 text-white/85 max-w-md">Auto-updated deals from live prices. The more you save, the more you gift.</p>
              <span className="inline-block mt-5 px-6 py-3 rounded-full bg-white text-[var(--brand)] font-medium">Enter the Offer Zone →</span>
            </div>
            <div className="absolute -right-10 -bottom-10 w-52 h-52 rounded-full bg-white/10" />
            <div className="absolute right-20 top-4 w-24 h-24 rounded-full bg-white/10" />
          </Link>
        </Reveal>
      </Section>
    ),
    new_arrivals: (c) => (
      <Section key="new_arrivals">
        <SectionHeader subtitle={c.subtitle || "Fresh drops"} title={c.title || "New Arrivals"} to="/women" />
        <ProductRow products={data.arr || []} />
      </Section>
    ),
    gift_picks: (c) => (
      <Section key="gift_picks">
        <SectionHeader subtitle={c.subtitle || "For someone special"} title={c.title || "Gift Picks"} to="/gifts" />
        <ProductGrid products={(data.gift || []).slice(0, 8)} />
      </Section>
    ),
    combos: (c) => (
      <Section key="combos">
        <SectionHeader subtitle={c.subtitle || "Bundle & save"} title={c.title || "Combo Offers"} to="/combo-offers" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {combos.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.05}>
              <Link to={`/combo/${c.slug}`} data-testid={`combo-card-${c.id}`}
                className="block bg-white rounded-3xl overflow-hidden border border-[var(--line)] soft-shadow hover-shadow group">
                <div className="relative aspect-square overflow-hidden bg-[var(--card-2)]">
                  <img src={c.images?.[0]} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <span className="absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--brand)] text-white">Save {formatINR(c.savings)}</span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold line-clamp-1">{c.name}</h3>
                  <p className="text-xs text-[var(--ink-soft)] mt-0.5">{c.item_count}-Piece Combo</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg font-bold text-[var(--brand)]">{formatINR(c.combo_price)}</span>
                    <span className="text-xs line-through text-[var(--ink-soft)]">{formatINR(c.original_price)}</span>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>
    ),
    instagram: (c) => (
      <Section key="instagram">
        <SectionHeader subtitle={c.subtitle || "@vihaanora"} title={c.title || "Vihaanora on Instagram"} to="/instagram" cta="Follow us" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(offer.items || []).concat(data.trend || []).slice(0, 6).map((p, i) => (
            <Link key={i} to={`/product/${p.slug}`} className="relative aspect-square rounded-2xl overflow-hidden group">
              <img src={p.images?.[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Instagram size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </Section>
    ),
    reviews: (c) => (
      <Section key="reviews">
        <SectionHeader subtitle={c.subtitle || "Kind words"} title={c.title || "Customer Reviews"} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {REVIEWS.map((r, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="bg-[var(--card-2)] rounded-3xl p-6 h-full">
                <div className="flex gap-0.5 text-[var(--amber)] mb-3">
                  {Array.from({ length: r.rating }).map((_, j) => <Star key={j} size={15} className="fill-current" />)}
                </div>
                <p className="text-sm text-[var(--ink)] leading-relaxed">"{r.text}"</p>
                <p className="text-xs font-semibold text-[var(--ink-soft)] mt-4">— {r.name}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>
    ),
    newsletter: (c) => (
      <Section key="newsletter">
        <div className="rounded-[2rem] bg-[var(--ink)] text-white p-10 sm:p-14 text-center">
          <h3 className="font-serif text-3xl sm:text-4xl font-semibold">{c.title || "Join the JAVE fam ✨"}</h3>
          <p className="mt-3 text-white/70 max-w-md mx-auto">{c.subtitle || "Get early access to drops, flash deals & gifting inspo on WhatsApp."}</p>
          <form onSubmit={(e) => e.preventDefault()} className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input data-testid="newsletter-email" placeholder="your@email.com" className="flex-1 px-5 py-3.5 rounded-full text-[var(--ink)] outline-none" />
            <button className="px-7 py-3.5 rounded-full bg-[var(--brand)] font-medium hover:bg-[var(--brand-hover)] transition-colors">Subscribe</button>
          </form>
        </div>
      </Section>
    ),
  };

  const order = (settings?.home_sections?.length ? settings.home_sections : DEFAULT_ORDER)
    .filter((s) => s.enabled).sort((a, b) => a.order - b.order);

  return (
    <div>
      <FeaturedProductHero />

      <div className="bg-white border-y border-[var(--line)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-4 py-5 text-center">
          {[[Truck, "Flat ₹50 Delivery"], [ShieldCheck, "Secure Payments"], [RefreshCw, "Easy Returns"], [Instagram, "As seen on Insta"]].map(([Ic, t], i) => (
            <div key={i} className="flex items-center justify-center gap-2 text-[var(--ink-soft)]">
              <Ic size={18} className="text-[var(--brand)]" /><span className="text-xs sm:text-sm font-medium">{t}</span>
            </div>
          ))}
        </div>
      </div>

      <Section>
        <SectionHeader subtitle="Find your vibe" title="Shop by Category" />
        <CategoryTiles />
      </Section>

      {loading ? (
        <Section><GridSkeleton /></Section>
      ) : (
        order.map((s) => sections[s.key] ? (
          <div key={s.key} style={{ background: themeBg(s.theme) }} className="transition-colors">
            {sections[s.key](s)}
          </div>
        ) : null)
      )}
    </div>
  );
}
