import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Heart, Minus, Plus, ShoppingBag, Tag } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { Section } from "@/components/common";
import { toast } from "sonner";

export default function CartPage() {
  const { items, updateQty, removeItem, toggleWishlist, couponCode, setCouponCode } = useCart();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [coupon, setCoupon] = useState(couponCode || "");
  const [applied, setApplied] = useState("");

  const validate = useCallback(async (code) => {
    if (items.length === 0) { setSummary(null); return; }
    const payload = { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variant: i.variant, combo: i.combo })), coupon_code: code || null };
    try {
      const { data } = await api.post("/cart/validate", payload);
      setSummary(data);
      if (data.coupon_error) {
        setApplied("");
        setCoupon("");
        setCouponCode("");
        toast.error(formatApiError(data.coupon_error));
      } else if (data.coupon_code) {
        setApplied(data.coupon_code);
        setCoupon(data.coupon_code);
        setCouponCode(data.coupon_code);
      } else {
        setApplied("");
        setCouponCode("");
      }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  }, [items, setCouponCode]);

  useEffect(() => { validate(couponCode); }, [validate, couponCode]);

  if (items.length === 0) {
    return (
      <Section className="text-center py-24">
        <ShoppingBag size={48} className="mx-auto text-[var(--line)]" />
        <h1 className="font-serif text-3xl font-semibold mt-4">Your cart is empty</h1>
        <p className="text-[var(--ink-soft)] mt-2">Little things make beautiful moments — start adding some!</p>
        <Link to="/women" className="inline-block mt-6 px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium">Start Shopping</Link>
      </Section>
    );
  }

  return (
    <Section>
      <h1 className="font-serif text-3xl sm:text-4xl font-semibold mb-8">Shopping Cart</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((it) => (
            <div key={it.key} data-testid={`cart-item-${it.product_id}`} className="flex gap-4 bg-white rounded-3xl p-4 border border-[var(--line)]">
              <Link to={`/product/${it.slug}`} className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-[var(--card-2)] shrink-0">
                <img src={it.image} alt={it.name} className="w-full h-full object-cover" />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <Link to={`/product/${it.slug}`} className="font-semibold text-sm sm:text-base line-clamp-2 hover:text-[var(--brand)]">{it.name}</Link>
                  <button data-testid={`cart-remove-${it.product_id}`} onClick={() => removeItem(it.key)} className="text-[var(--ink-soft)] hover:text-destructive shrink-0"><Trash2 size={18} /></button>
                </div>
                {it.variant && <p className="text-xs text-[var(--ink-soft)] mt-0.5">Colour: {it.variant}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-[var(--brand)]">{formatINR(it.price)}</span>
                  {it.mrp > it.price && <span className="text-xs line-through text-[var(--ink-soft)]">{formatINR(it.mrp)}</span>}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border border-[var(--line)] rounded-full">
                    <button onClick={() => updateQty(it.key, it.qty - 1)} className="p-2"><Minus size={14} /></button>
                    <span className="w-7 text-center text-sm font-semibold">{it.qty}</span>
                    <button onClick={() => updateQty(it.key, it.qty + 1)} className="p-2"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => { toggleWishlist({ id: it.product_id, name: it.name, images: [it.image], slug: it.slug, mrp: it.mrp, effective_price: it.price, discount_percent: 0 }); removeItem(it.key); }}
                    className="flex items-center gap-1.5 text-xs text-[var(--ink-soft)] hover:text-[var(--brand)]"><Heart size={14} /> Move to wishlist</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-3xl p-6 border border-[var(--line)] h-fit soft-shadow sticky top-24">
          <h3 className="font-semibold text-lg mb-4">Order Summary</h3>
          <div className="flex gap-2 mb-4">
            <div className="flex items-center flex-1 bg-[var(--card-2)] rounded-full px-3">
              <Tag size={15} className="text-[var(--ink-soft)]" />
              <input data-testid="coupon-input" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" className="bg-transparent outline-none text-sm px-2 flex-1 py-2.5" />
            </div>
            {applied ? <button data-testid="remove-coupon" onClick={() => { setCoupon(""); setApplied(""); setCouponCode(""); validate(""); }} className="px-4 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm font-medium">Remove</button> : <button data-testid="apply-coupon" onClick={() => validate(coupon)} className="px-4 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm font-medium">Apply</button>}
          </div>
          {applied && <p className="text-xs text-[var(--sage-dark)] -mt-2 mb-3">Coupon {applied} ✓</p>}
          {summary && (
            <div className="space-y-2.5 text-sm">
              <Row label="Subtotal" value={formatINR(summary.subtotal)} />
              {summary.product_discount > 0 && <Row label="Product Discount" value={`- ${formatINR(summary.product_discount)}`} green />}
              {summary.coupon_discount > 0 && <Row label={`Coupon (${summary.coupon_code})`} value={`- ${formatINR(summary.coupon_discount)}`} green />}
              <Row label="Delivery" value={summary.delivery_charge === 0 ? "FREE" : formatINR(summary.delivery_charge)} />
              <div className="border-t border-[var(--line)] pt-3 mt-1 flex justify-between font-bold text-base">
                <span>Grand Total</span><span className="text-[var(--brand)]" data-testid="grand-total">{formatINR(summary.grand_total)}</span>
              </div>
            </div>
          )}
          <button data-testid="checkout-btn" onClick={() => nav("/checkout")} className="w-full mt-5 py-4 rounded-full bg-[var(--brand)] text-white font-medium hover:bg-[var(--brand-hover)] transition-colors">
            Proceed to Checkout
          </button>
          <p className="text-xs text-center text-[var(--ink-soft)] mt-3">Guest checkout available · Secure payments</p>
        </div>
      </div>
    </Section>
  );
}

function Row({ label, value, green }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--ink-soft)]">{label}</span>
      <span className={green ? "text-[var(--sage-dark)] font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}
