import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

const load = (k, d) => {
  try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
};

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => load("jh_cart", []));
  const [wishlist, setWishlist] = useState(() => load("jh_wishlist", []));

  useEffect(() => { localStorage.setItem("jh_cart", JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem("jh_wishlist", JSON.stringify(wishlist)); }, [wishlist]);

  const addToCart = (product, qty = 1, variant = null, combo = false) => {
    setItems((prev) => {
      const key = product.id + (variant || "");
      const exists = prev.find((i) => i.key === key);
      if (exists) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, {
        key, product_id: product.id, name: product.name, variant, combo, qty,
        image: (product.images || [])[0] || product.image,
        mrp: product.mrp, price: combo ? product.combo_price : product.effective_price,
        slug: product.slug,
      }];
    });
    toast.success(`${product.name} added to cart`);
  };

  const updateQty = (key, qty) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)));

  const removeItem = (key) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clearCart = () => setItems([]);

  const toggleWishlist = (product) => {
    setWishlist((prev) => {
      if (prev.find((p) => p.id === product.id)) {
        toast("Removed from wishlist");
        return prev.filter((p) => p.id !== product.id);
      }
      toast.success("Saved to wishlist");
      return [...prev, product];
    });
  };
  const inWishlist = (id) => wishlist.some((p) => p.id === id);

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);

  return (
    <CartCtx.Provider value={{
      items, count, subtotal, addToCart, updateQty, removeItem, clearCart,
      wishlist, toggleWishlist, inWishlist,
    }}>
      {children}
    </CartCtx.Provider>
  );
}
