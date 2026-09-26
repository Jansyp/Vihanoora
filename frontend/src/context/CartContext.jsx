import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

const load = (k, d) => {
  try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
};

export const removePurchasedQuantities = (items, purchasedItems) => items.map((item) => {
  const purchased = purchasedItems.find((candidate) =>
    candidate.product_id === item.product_id &&
    Boolean(candidate.combo) === Boolean(item.combo) &&
    (candidate.variant || null) === (item.variant || null)
  );
  if (!purchased) return item;
  return { ...item, qty: item.qty - purchased.qty };
}).filter((item) => item.qty > 0);

export const resolveCartVariant = (product, variant = null) => variant || product.colors?.[0] || null;

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => load("jh_cart", []));
  const [wishlist, setWishlist] = useState(() => load("jh_wishlist", []));
  const [couponCode, setCouponCode] = useState(() => load("jh_coupon_code", ""));

  useEffect(() => { localStorage.setItem("jh_cart", JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem("jh_wishlist", JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => { localStorage.setItem("jh_coupon_code", couponCode || ""); }, [couponCode]);

  const addToCart = (product, qty = 1, variant = null, combo = false) => {
    const selectedVariant = resolveCartVariant(product, variant);
    setItems((prev) => {
      const exists = prev.find((i) =>
        i.product_id === product.id &&
        Boolean(i.combo) === Boolean(combo) &&
        (i.variant || null) === selectedVariant
      );
      if (exists) {
        return prev.map((i) => (i.key === exists.key ? { ...i, qty: i.qty + qty } : i));
      }
      const key = `${product.id}:${combo ? "combo" : "product"}:${selectedVariant || ""}`;
      return [...prev, {
        key, product_id: product.id, name: product.name, variant: selectedVariant, combo, qty,
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
  const removePurchasedItems = useCallback((orderId, purchasedItems) => {
    const storedProcessedOrders = load("jh_cart_processed_orders", []);
    const processedOrders = Array.isArray(storedProcessedOrders) ? storedProcessedOrders : [];
    if (processedOrders.includes(orderId)) return;

    setItems((prev) => removePurchasedQuantities(prev, purchasedItems));
    localStorage.setItem("jh_cart_processed_orders", JSON.stringify([...processedOrders, orderId]));
  }, []);

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
      items, count, subtotal, addToCart, updateQty, removeItem, clearCart, removePurchasedItems,
      couponCode, setCouponCode,
      wishlist, toggleWishlist, inWishlist,
    }}>
      {children}
    </CartCtx.Provider>
  );
}
