import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import { Section, SectionHeader, GridSkeleton, Reveal } from "@/components/common";
import ProductImage from "@/components/ProductImage";
import { trackEcommerce } from "@/lib/analytics";

export default function CombosPage() {
  const [combos, setCombos] = useState(null);
  useEffect(() => {
    api.get("/combos").then(({ data }) => {
      setCombos(data);
      if (data?.length) trackEcommerce("view_item_list", data.map((item) => ({ ...item, product_id: item.id, price: item.combo_price, qty: 1, category: "Combo Offers" })), { item_list_id: "combo_offers", item_list_name: "Combo Offers" });
    });
  }, []);
  return (
    <Section>
      <SectionHeader subtitle="Bundle & save" title="Combo Offers" />
      {!combos ? <GridSkeleton /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {combos.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.05}>
              <Link to={`/combo/${c.slug}`} data-testid={`combo-${c.id}`} onClick={() => trackEcommerce("select_item", [{ ...c, product_id: c.id, price: c.combo_price, qty: 1, category: "Combo Offers" }], { item_list_id: "combo_offers", item_list_name: "Combo Offers" })} className="block bg-white rounded-3xl overflow-hidden border border-[var(--line)] soft-shadow hover-shadow group">
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--card-2)]">
                  <ProductImage src={c.images?.[0]} alt={c.name} priority={i < 3} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
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
