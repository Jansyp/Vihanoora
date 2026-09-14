import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ShoppingBag, Check } from "lucide-react";
import api, { formatINR } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { Section, GridSkeleton } from "@/components/common";
import ProductCard from "@/components/ProductCard";

export default function ComboDetail() {
  const { slug } = useParams();
  const { addToCart } = useCart();
  const [c, setC] = useState(null);
  useEffect(() => { setC(null); api.get(`/combos/${slug}`).then(({ data }) => setC(data)); }, [slug]);
  if (!c) return <Section><GridSkeleton n={4} /></Section>;

  return (
    <Section>
      <div className="grid lg:grid-cols-2 gap-10">
        <div className="aspect-square rounded-3xl overflow-hidden bg-[var(--card-2)] soft-shadow">
          <img src={c.images?.[0]} alt={c.name} className="w-full h-full object-cover" />
        </div>
        <div>
          <span className="text-xs font-semibold tracking-widest uppercase text-[var(--brand)]">{c.item_count}-Piece Combo</span>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold mt-1">{c.name}</h1>
          <div className="flex items-center gap-3 mt-4">
            <span className="text-3xl font-bold text-[var(--brand)]">{formatINR(c.combo_price)}</span>
            <span className="text-lg line-through text-[var(--ink-soft)]">{formatINR(c.original_price)}</span>
            <span className="text-sm font-semibold text-[var(--sage-dark)] bg-[var(--sage)] px-2 py-0.5 rounded-full">Save {formatINR(c.savings)}</span>
          </div>
          <p className="text-[var(--ink-soft)] mt-4">{c.description}</p>
          <div className="mt-6 space-y-2">
            <p className="font-semibold text-sm">This combo includes:</p>
            {c.products?.map((p) => (
              <Link key={p.id} to={`/product/${p.slug}`} className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-[var(--line)] hover:border-[var(--brand)]">
                <img src={p.images?.[0]} alt={p.name} className="w-12 h-12 rounded-xl object-cover" />
                <span className="text-sm font-medium flex-1">{p.name}</span>
                <Check size={16} className="text-[var(--sage-dark)]" />
              </Link>
            ))}
          </div>
          <button data-testid="add-combo-cart" onClick={() => addToCart({ id: c.id, name: c.name, images: c.images, slug: c.slug, mrp: c.original_price, combo_price: c.combo_price }, 1, null, true)}
            className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-full bg-[var(--brand)] text-white font-medium hover:bg-[var(--brand-hover)]">
            <ShoppingBag size={18} /> Add Combo to Cart
          </button>
        </div>
      </div>
      {c.products?.length > 0 && (
        <div className="mt-14">
          <h2 className="font-serif text-2xl font-medium mb-6">Items in this combo</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {c.products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </div>
      )}
    </Section>
  );
}
