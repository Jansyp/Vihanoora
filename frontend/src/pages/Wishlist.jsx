import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Section, ProductGrid } from "@/components/common";

export default function Wishlist() {
  const { wishlist } = useCart();
  return (
    <Section>
      <h1 className="font-serif text-3xl sm:text-4xl font-semibold mb-8">My Wishlist</h1>
      {wishlist.length === 0 ? (
        <div className="text-center py-20">
          <Heart size={48} className="mx-auto text-[var(--line)]" />
          <p className="text-lg mt-4">Your wishlist is empty.</p>
          <p className="text-[var(--ink-soft)] mt-1">Tap the heart on any product to save it here.</p>
          <Link to="/women" className="inline-block mt-6 px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium">Browse Products</Link>
        </div>
      ) : <ProductGrid products={wishlist} />}
    </Section>
  );
}
