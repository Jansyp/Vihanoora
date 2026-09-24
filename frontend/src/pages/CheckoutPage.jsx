import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { Section } from "@/components/common";
import { toast } from "sonner";

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", address: "", city: "", state: "", pin: "" });

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: user.name || "", email: user.email || "" }));
  }, [user]);

  useEffect(() => {
    if (submitted) return;
    if (items.length === 0) { nav("/cart"); return; }
    revalidate(coupon);
  }, [items.length]); // eslint-disable-line

  const revalidate = async (code) => {
    const payload = { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variant: i.variant, combo: i.combo })), coupon_code: code || null, email: form.email || null };
    const { data } = await api.post("/cart/validate", payload);
    setSummary(data);
    if (data.coupon_error) toast.error(data.coupon_error);
  };

  const valid = form.name && /^\d{10}$/.test(form.mobile) && /\S+@\S+/.test(form.email) && form.address && form.city && form.state && /^\d{6}$/.test(form.pin);

  const placeOrder = async () => {
    if (!valid) { toast.error("Please fill all details correctly (10-digit mobile, 6-digit PIN)."); return; }
    setBusy(true);
    setSubmitted(true);
    try {
      const payload = { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variant: i.variant, combo: i.combo })), customer: form, coupon_code: summary?.coupon_code || null };
      const { data } = await api.post("/orders", payload);
      const order = data.order;

      if (data.payment_mode === "mock") {
        await api.post("/payments/verify", { order_id: order.id });
        nav(`/order-success/${order.order_number}`);
        clearCart();
        return;
      }

      const ok = await loadRazorpay();
      if (!ok) { toast.error("Could not load payment gateway."); setBusy(false); return; }
      const rzp = new window.Razorpay({
        key: data.razorpay_key_id,
        amount: data.amount,
        currency: order.currency,
        name: "Viaura",
        description: `Order ${order.order_number}`,
        order_id: data.razorpay_order_id,
        prefill: { name: form.name, email: form.email, contact: form.mobile },
        theme: { color: "#D9777F" },
        handler: async (resp) => {
          try {
            await api.post("/payments/verify", {
              order_id: order.id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            nav(`/order-success/${order.order_number}`);
            clearCart();
          } catch (e) {
            toast.error("Payment verification failed. Contact support with your order number.");
          }
        },
        modal: { ondismiss: () => { setBusy(false); setSubmitted(false); } },
      });
      rzp.on("payment.failed", () => { toast.error("Payment failed. Please try again."); setBusy(false); setSubmitted(false); });
      rzp.open();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
      setBusy(false);
      setSubmitted(false);
    }
  };

  const F = (k, label, props = {}) => (
    <div>
      <label className="text-xs font-semibold text-[var(--ink-soft)]">{label}</label>
      <input data-testid={`checkout-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="w-full mt-1 px-4 py-3 rounded-xl bg-white border border-[var(--line)] outline-none focus:border-[var(--brand)] text-sm" {...props} />
    </div>
  );

  return (
    <Section>
      <h1 className="font-serif text-3xl sm:text-4xl font-semibold mb-2">Checkout</h1>
      <p className="text-[var(--ink-soft)] mb-8">{user ? `Logged in as ${user.email}` : "Checking out as guest — no account needed."}</p>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-[var(--line)]">
          <h3 className="font-semibold text-lg mb-4">Delivery Details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {F("name", "Full Name")}
            {F("mobile", "Mobile (10 digits)", { maxLength: 10, inputMode: "numeric" })}
            {F("email", "Email", { type: "email" })}
            {F("pin", "PIN Code", { maxLength: 6, inputMode: "numeric" })}
            <div className="sm:col-span-2">{F("address", "Address")}</div>
            {F("city", "City")}
            {F("state", "State")}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[var(--line)] h-fit sticky top-24">
          <h3 className="font-semibold text-lg mb-4">Your Order</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-3 no-scrollbar">
            {items.map((i) => (
              <div key={i.key} className="flex justify-between text-sm">
                <span className="text-[var(--ink-soft)] line-clamp-1 pr-2">{i.name} × {i.qty}</span>
                <span className="font-medium shrink-0">{formatINR(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <input data-testid="checkout-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon" className="flex-1 px-3 py-2.5 rounded-full bg-[var(--card-2)] outline-none text-sm" />
            <button onClick={() => revalidate(coupon)} className="px-4 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm">Apply</button>
          </div>
          {summary && (
            <div className="space-y-2 text-sm border-t border-[var(--line)] pt-3">
              <div className="flex justify-between"><span className="text-[var(--ink-soft)]">Subtotal</span><span>{formatINR(summary.subtotal)}</span></div>
              {summary.coupon_discount > 0 && <div className="flex justify-between text-[var(--sage-dark)]"><span>Coupon</span><span>- {formatINR(summary.coupon_discount)}</span></div>}
              <div className="flex justify-between"><span className="text-[var(--ink-soft)]">Delivery</span><span>{summary.delivery_charge === 0 ? "FREE" : formatINR(summary.delivery_charge)}</span></div>
              <div className="flex justify-between font-bold text-base border-t border-[var(--line)] pt-2"><span>Total</span><span className="text-[var(--brand)]" data-testid="checkout-total">{formatINR(summary.grand_total)}</span></div>
            </div>
          )}
          <button data-testid="place-order-btn" disabled={busy} onClick={placeOrder}
            className="w-full mt-5 py-4 rounded-full bg-[var(--brand)] text-white font-medium hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Lock size={16} /> {busy ? "Processing..." : "Pay & Place Order"}
          </button>
          <p className="text-xs text-center text-[var(--ink-soft)] mt-3">Payments are server-verified. Order confirmed only after payment succeeds.</p>
        </div>
      </div>
    </Section>
  );
}
