import { useEffect, useState } from "react";
import { Instagram } from "lucide-react";
import api from "@/lib/api";
import { Section, SectionHeader, ProductRow, GridSkeleton } from "@/components/common";
import { useSettings } from "@/context/SettingsContext";

export default function InstagramLanding() {
  const { settings } = useSettings();
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const [t, b, o, c, n] = await Promise.all([
        api.get("/products?trending=true&limit=10"),
        api.get("/products?best_seller=true&limit=10"),
        api.get("/offer-zone?limit=10"),
        api.get("/combos"),
        api.get("/products?new_arrival=true&limit=10"),
      ]);
      setD({ trend: t.data.items, best: b.data.items, offer: o.data.items, combos: c.data, arr: n.data.items });
    })();
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-b from-[var(--blush)] to-[var(--cream)] py-14 text-center px-4">
        <Instagram size={40} className="mx-auto text-[var(--brand)]" />
        <h1 className="font-serif text-4xl sm:text-5xl font-semibold mt-4">Welcome, Insta friend! 👋</h1>
        <p className="text-[var(--ink-soft)] mt-3 max-w-lg mx-auto">You saw it on our feed — now shop the exact trending finds, best sellers & deals.</p>
        <a href={settings?.instagram_url || "#"} target="_blank" rel="noreferrer" className="inline-block mt-6 px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium">Follow @vihaanora</a>
      </section>
      {!d ? <Section><GridSkeleton /></Section> : (
        <>
          <Section><SectionHeader subtitle="Right now" title="Trending" to="/trending" /><ProductRow products={d.trend} /></Section>
          <Section className="bg-white rounded-[2.5rem] mx-2 sm:mx-6 lg:mx-12"><SectionHeader subtitle="Fan favourites" title="Best Sellers" to="/women" /><ProductRow products={d.best} /></Section>
          <Section><SectionHeader subtitle="Save big" title="Offer Zone" to="/offer-zone" /><ProductRow products={d.offer} /></Section>
          <Section><SectionHeader subtitle="Fresh" title="New Arrivals" /><ProductRow products={d.arr} /></Section>
        </>
      )}
    </div>
  );
}
