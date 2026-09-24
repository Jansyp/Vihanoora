import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import api, { assetUrl, formatINR } from "@/lib/api";

const ROTATION_MS = 5000;

const FEATURED_SLOTS = [
  { key: "women", label: "Women", groups: ["women"], href: "/women" },
  { key: "kids", label: "Kids", groups: ["kids"], href: "/kids" },
  { key: "gifts", label: "Gifting", groups: ["gifts"], href: "/gifts" },
  { key: "combos", label: "Combo Offers", groups: ["combo"], href: "/combo-offers" },
  { key: "trending", label: "Trending", href: "/trending" },
  { key: "offers", label: "Offer Zone", href: "/offer-zone" },
];

function productScore(product) {
  return (product.featured ? 8 : 0) + (product.trending ? 6 : 0) + (product.best_seller ? 4 : 0) +
    (product.stock_state === "Out of Stock" ? 0 : 1) + (product.discount_percent || 0) / 100;
}

function bestProduct(products, groups, usedIds) {
  return products
    .filter((product) => product.images?.[0] && (!groups || groups.includes(product.group)))
    .filter((product) => !usedIds.has(product.id))
    .sort((first, second) => productScore(second) - productScore(first))[0] || null;
}

function makeComboItem(combo) {
  const image = combo.images?.[0] || combo.products?.[0]?.images?.[0];
  if (!image) return null;
  return {
    id: `combo-${combo.id}`,
    name: combo.name,
    images: [image],
    effective_price: combo.combo_price,
    mrp: combo.original_price,
    slug: combo.slug,
    href: `/combo/${combo.slug}`,
    isCombo: true,
  };
}

function selectShowcaseProducts(products, combos, offerItems) {
  const selected = [];
  const usedIds = new Set();
  const addProduct = (slot, product) => {
    if (!product) return;
    usedIds.add(product.id);
    selected.push({ ...slot, product });
  };

  FEATURED_SLOTS.forEach((slot) => {
    if (slot.key === "combos") {
      const combo = combos.find((item) => item.images?.[0] || item.products?.[0]?.images?.[0]);
      addProduct(slot, combo && makeComboItem(combo));
      return;
    }
    if (slot.key === "offers") {
      addProduct(slot, bestProduct(offerItems, null, usedIds));
      return;
    }
    addProduct(slot, bestProduct(products, slot.groups, usedIds));
  });

  return selected;
}

export default function FeaturedProductHero() {
  const { reduceMotion } = useSettings();
  const [banners, setBanners] = useState([]);
  const [showcase, setShowcase] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [productIndex, setProductIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get("/banners"),
      api.get("/products?limit=200&sort=best_selling"),
      api.get("/combos"),
      api.get("/offer-zone?limit=40"),
    ]).then(([bannerResponse, productResponse, comboResponse, offerResponse]) => {
      setBanners(bannerResponse.data || []);
      setShowcase(selectShowcaseProducts(productResponse.data?.items || [], comboResponse.data || [], offerResponse.data?.items || []));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return undefined;
    const timer = setInterval(() => setBannerIndex((current) => (current + 1) % banners.length), 5500);
    return () => clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    if (showcase.length <= 1 || reduceMotion) return undefined;
    const timer = setInterval(() => setProductIndex((current) => (current + 1) % showcase.length), ROTATION_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, showcase.length]);

  const active = banners[bannerIndex];
  const DEFAULT = { title: "Trending Finds.", accent: "Thoughtful Gifts.",
    subtitle: "Little Things. Beautiful Moments. Curated jewellery, hair accessories, toys & gift hampers — all in one cute corner.",
    cta_text: "Shop Now", cta_link: "/trending" };
  const heading = active ? { title: active.title, accent: "", subtitle: active.subtitle, cta_text: active.cta_text, cta_link: active.cta_link } : DEFAULT;
  const currentShowcase = showcase[productIndex];
  const product = currentShowcase?.product;
  const productPrice = product?.effective_price || product?.combo_price;
  const productMrp = product?.mrp || product?.original_price;
  const productLink = product?.href || `/product/${product?.slug}`;
  const productDiscount = productMrp && productPrice ? Math.round((1 - productPrice / productMrp) * 100) : 0;
  const productAlt = useMemo(() => product?.name || "Featured Viaura product", [product?.name]);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#FCEEE9] via-[#FAF7F2] to-[#FAF7F2]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-14 sm:py-20 grid lg:grid-cols-2 gap-8 items-center">
        <div className="relative z-10 text-center lg:text-left min-h-[280px] flex flex-col justify-center">
          <span className="inline-block w-fit mx-auto lg:mx-0 text-xs font-semibold tracking-widest uppercase text-[var(--brand)] bg-white px-4 py-1.5 rounded-full soft-shadow mb-5">
            ✨ Instagram-loved • Gift-first
          </span>
          <AnimatePresence mode="wait">
            <motion.div key={active ? active.id : "default"}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight text-[var(--ink)]">
                {active ? <span className="text-[var(--brand)]">{heading.title}</span> : <>{DEFAULT.title}<br /><span className="text-[var(--brand)]">{DEFAULT.accent}</span></>}
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[var(--ink-soft)] max-w-md mx-auto lg:mx-0">{heading.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
                <Link data-testid="hero-shop-now" to={heading.cta_link || "/trending"}
                  className="px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium hover:bg-[var(--brand)] transition-colors soft-shadow">
                  {heading.cta_text || "Shop Now"}
                </Link>
                <Link data-testid="hero-offer-zone" to="/offer-zone"
                  className="px-7 py-3.5 rounded-full bg-white text-[var(--ink)] font-medium border border-[var(--line)] hover:border-[var(--brand)] transition-colors">
                  Explore Offer Zone
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
          {banners.length > 1 && (
            <div className="flex gap-2 mt-6 justify-center lg:justify-start">
              {banners.map((_, index) => (
                <button key={index} onClick={() => setBannerIndex(index)} data-testid={`hero-dot-${index}`}
                  className={`h-2 rounded-full transition-all ${index === bannerIndex ? "w-6 bg-[var(--brand)]" : "w-2 bg-[var(--blush-line)]"}`} aria-label={`banner ${index + 1}`} />
              ))}
            </div>
          )}
        </div>

        <div className="relative min-h-[360px] sm:min-h-[480px] flex items-center justify-center" aria-live="polite">
          <div className="absolute inset-x-8 bottom-12 h-20 rounded-[50%] bg-[rgba(111,76,61,0.12)] blur-2xl" />
          {product ? (
            <AnimatePresence mode="wait">
              <motion.div key={product.id} initial={{ opacity: 0, x: 22, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -22, scale: 0.97 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 flex w-full flex-col items-center text-center">
                <Link to={productLink} className={`group relative flex h-[275px] w-[min(82vw,360px)] items-center justify-center sm:h-[350px] sm:w-[410px] ${reduceMotion ? "" : "animate-product-float"}`}>
                  <div className="absolute inset-8 rounded-full bg-white/60 blur-3xl" />
                  <img src={assetUrl(product.images[0])} alt={productAlt} className="relative max-h-full max-w-full object-contain drop-shadow-[0_24px_24px_rgba(72,45,35,0.18)] transition-transform duration-700 group-hover:scale-[1.03]" />
                </Link>
                <div className="relative z-10 mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">{currentShowcase.label}</p>
                  <Link to={productLink} className="mt-2 block font-serif text-xl text-[var(--ink)] hover:text-[var(--brand)] transition-colors">{product.name}</Link>
                  <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                    <span className="font-semibold text-[var(--brand)]">{formatINR(productPrice)}</span>
                    {productDiscount > 0 && <span className="text-xs text-[var(--ink-soft)] line-through">{formatINR(productMrp)}</span>}
                  </div>
                  <Link to={productLink} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--brand)] transition-colors">Explore collection <ArrowUpRight size={13} /></Link>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="h-72 w-72 rounded-full bg-white/50 animate-pulse" aria-label="Loading featured products" />
          )}
          {showcase.length > 1 && (
            <div className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 gap-1.5" aria-label="Featured product categories">
              {showcase.map((item, index) => <button key={item.key} onClick={() => setProductIndex(index)} aria-label={`Show ${item.label}`} className={`h-1 rounded-full transition-all ${index === productIndex ? "w-7 bg-[var(--brand)]" : "w-2 bg-[var(--blush-line)]"}`} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}