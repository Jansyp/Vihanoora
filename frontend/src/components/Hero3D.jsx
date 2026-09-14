import { Suspense, lazy, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";

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

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#FCEEE9] via-[#FAF7F2] to-[#FAF7F2]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-14 sm:py-20 grid lg:grid-cols-2 gap-8 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center lg:text-left"
        >
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-[var(--brand)] bg-white px-4 py-1.5 rounded-full soft-shadow mb-5">
            ✨ Instagram-loved • Gift-first
          </span>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight text-[var(--ink)]">
            Trending Finds.<br />
            <span className="text-[var(--brand)]">Thoughtful Gifts.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-[var(--ink-soft)] max-w-md mx-auto lg:mx-0">
            Little Things. Beautiful Moments. Curated jewellery, hair accessories, toys & gift hampers — all in one cute corner.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
            <Link data-testid="hero-shop-now" to="/trending"
              className="px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium hover:bg-[var(--brand)] transition-colors soft-shadow">
              Shop Now
            </Link>
            <Link data-testid="hero-offer-zone" to="/offer-zone"
              className="px-7 py-3.5 rounded-full bg-white text-[var(--ink)] font-medium border border-[var(--line)] hover:border-[var(--brand)] transition-colors">
              Explore Offer Zone
            </Link>
          </div>
        </motion.div>

        <div className="relative h-[300px] sm:h-[420px]">
          {use3D ? (
            <Suspense fallback={<Fallback />}>
              <Scene />
            </Suspense>
          ) : (
            <Fallback />
          )}
        </div>
      </div>
    </section>
  );
}

function Fallback() {
  const imgs = [
    "https://images.unsplash.com/photo-1707944145479-12755f0434d8?crop=entropy&cs=srgb&fm=jpg&q=85&w=700",
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
