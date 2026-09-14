import { Suspense, lazy, useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";
import api from "@/lib/api";

const Scene = lazy(() => import("@/components/HeroScene"));

function supports3D() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = window.navigator || {};
  if (nav.connection?.saveData) return false;
  if (["slow-2g", "2g"].includes(nav.connection?.effectiveType)) return false;
  if (nav.deviceMemory && nav.deviceMemory < 4) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch { return false; }
}

export default function Hero3D() {
  const { reduceMotion } = useSettings();
  const use3D = useMemo(() => !reduceMotion && supports3D(), [reduceMotion]);
  const [banners, setBanners] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    api.get("/banners").then(({ data }) => setBanners(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 5500);
    return () => clearInterval(t);
  }, [banners.length]);

  const DEFAULT = { title: "Trending Finds.", accent: "Thoughtful Gifts.",
    subtitle: "Little Things. Beautiful Moments. Curated jewellery, hair accessories, toys & gift hampers — all in one cute corner.",
    cta_text: "Shop Now", cta_link: "/trending" };
  const active = banners[idx];
  // Split banner title on last word for accent styling when no explicit accent
  const heading = active ? { title: active.title, accent: active.subtitle ? "" : "", subtitle: active.subtitle, cta_text: active.cta_text, cta_link: active.cta_link } : DEFAULT;

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
                {active ? (
                  <span className="text-[var(--brand)]">{heading.title}</span>
                ) : (
                  <>{DEFAULT.title}<br /><span className="text-[var(--brand)]">{DEFAULT.accent}</span></>
                )}
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[var(--ink-soft)] max-w-md mx-auto lg:mx-0">
                {heading.subtitle}
              </p>
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
              {banners.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} data-testid={`hero-dot-${i}`}
                  className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-[var(--brand)]" : "w-2 bg-[var(--blush-line)]"}`} aria-label={`banner ${i + 1}`} />
              ))}
            </div>
          )}
        </div>

        <div className="relative h-[300px] sm:h-[420px]">
          {use3D ? (
            <Suspense fallback={<Fallback banners={banners} />}>
              <Scene />
            </Suspense>
          ) : (
            <Fallback banners={banners} />
          )}
        </div>
      </div>
    </section>
  );
}

function Fallback({ banners = [] }) {
  const bannerImg = banners.find((b) => b.image)?.image;
  const imgs = [
    bannerImg || "https://images.unsplash.com/photo-1707944145479-12755f0434d8?crop=entropy&cs=srgb&fm=jpg&q=85&w=700",
    "https://images.unsplash.com/photo-1637808248242-57a6265593ed?crop=entropy&cs=srgb&fm=jpg&q=85&w=500",
    "https://images.unsplash.com/photo-1788079962199-485109cc9cd0?crop=entropy&cs=srgb&fm=jpg&q=85&w=500",
  ];
  return (
    <div className="relative w-full h-full">
      <img src={imgs[0]} alt="Gift hamper" className="absolute right-0 top-4 w-2/3 rounded-3xl soft-shadow object-cover aspect-square animate-float-slow" />
      <img src={imgs[1]} alt="Crystal bracelet" className="absolute left-0 bottom-0 w-2/5 rounded-3xl soft-shadow object-cover aspect-square animate-float-med border-4 border-white" />
      <img src={imgs[2]} alt="Hair accessory" className="absolute left-8 top-0 w-1/3 rounded-2xl soft-shadow object-cover aspect-square border-4 border-white" style={{ animation: "float-slow 7s ease-in-out infinite" }} />
    </div>
  );
}
