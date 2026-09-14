import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import { Section, SectionHeader, GridSkeleton, Reveal } from "@/components/common";

export default function CombosPage() {
  const [combos, setCombos] = useState(null);
  useEffect(() => { api.get("/combos").then(({ data }) => setCombos(data)); }, []);
  return (
    <Section>
      <SectionHeader subtitle="Bundle & save" title="Combo Offers" />
      {!combos ? <GridSkeleton /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {combos.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.05}>
              <Link to={`/combo/${c.slug}`} data-testid={`combo-${c.id}`} className="block bg-white rounded-3xl overflow-hidden border border-[var(--line)] soft-shadow hover-shadow group">
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--card-2)]">
                  <img src={c.images?.[0]} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <span className="absolute top-3 left-3 text-xs font-bold px-3 py-1 rounded-full bg-[var(--brand)] text-white">{c.discount_percent}% OFF · Save {formatINR(c.savings)}</span>
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-lg">{c.name}</h3>
                  <p className="text-sm text-[var(--ink-soft)] mt-1 line-clamp-2">{c.description}</p>
                  <p className="text-xs text-[var(--ink-soft)] mt-2">{c.item_count}-Piece Combo</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xl font-bold text-[var(--brand)]">{formatINR(c.combo_price)}</span>
                    <span className="text-sm line-through text-[var(--ink-soft)]">{formatINR(c.original_price)}</span>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </Section>
  );
}
