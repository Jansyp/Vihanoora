import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { motion } from "framer-motion";
import { formatINR } from "@/lib/api";
import { useCart } from "@/context/CartContext";

export default function ProductCard({ product, index = 0 }) {
  const nav = useNavigate();
  const { addToCart, toggleWishlist, inWishlist } = useCart();
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * 8, ry: px * 8 });
  };
  const reset = () => setTilt({ rx: 0, ry: 0 });

  const disc = product.discount_percent || 0;
  const wished = inWishlist(product.id);
  const oos = product.stock_state === "Out of Stock";

  return (
    <motion.div
      ref={ref}
      data-testid={`product-card-${product.id}`}
      onMouseMove={onMove}
      onMouseLeave={reset}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.05 }}
      style={{ transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
      className="tilt-card group relative bg-white rounded-3xl soft-shadow hover-shadow overflow-hidden border border-[var(--line)]"
    >
      <Link to={`/product/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[var(--card-2)]">
          <img
            src={product.images?.[0]}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {disc > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--brand)] text-white shadow">
                -{disc}%
              </span>
            )}
            {product.flash_active && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--amber)] text-white">
                ⚡ FLASH
              </span>
            )}
            {product.best_seller && !product.flash_active && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--sage)] text-[var(--sage-dark)]">
                Best Seller
              </span>
            )}
          </div>
          {oos && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="text-sm font-semibold text-[var(--ink)] bg-white px-3 py-1 rounded-full">Out of Stock</span>
            </div>
          )}
        </div>
      </Link>

      <button
        data-testid={`wishlist-btn-${product.id}`}
        onClick={() => toggleWishlist(product)}
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow hover:scale-110 transition-transform"
        aria-label="wishlist"
      >
        <Heart size={17} className={wished ? "fill-[var(--brand)] text-[var(--brand)]" : "text-[var(--ink-soft)]"} />
      </button>

      <div className="p-4">
        {product.rating > 0 && (
          <div className="flex items-center gap-1 mb-1 text-[var(--amber)]">
            <Star size={12} className="fill-current" />
            <span className="text-xs font-medium text-[var(--ink-soft)]">{product.rating} ({product.review_count})</span>
          </div>
        )}
        <Link to={`/product/${product.slug}`}>
          <h3 className="text-sm font-semibold text-[var(--ink)] leading-snug line-clamp-2 min-h-[2.5rem] hover:text-[var(--brand)] transition-colors">
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-lg font-bold text-[var(--brand)]">{formatINR(product.effective_price)}</span>
          {disc > 0 && <span className="text-xs line-through text-[var(--ink-soft)]">{formatINR(product.mrp)}</span>}
        </div>
        <button
          data-testid={`add-to-cart-${product.id}`}
          disabled={oos}
          onClick={() => addToCart(product)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm font-medium hover:bg-[var(--brand)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShoppingBag size={15} /> Add to Cart
        </button>
      </div>
    </motion.div>
  );
}
