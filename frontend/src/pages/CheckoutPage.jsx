import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { Section } from "@/components/common";
import { toast } from "sonner";
import { load } from "@cashfreepayments/cashfree-js";
import { validateCheckoutForm } from "@/lib/checkoutValidation";

export default function CheckoutPage() {
  const { items, subtotal, couponCode, setCouponCode, removePurchasedItems } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [coupon, setCoupon] = useState(couponCode || "");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", address: "", city: "", state: "", pin: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const inputRefs = useRef({});

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: user.name || "", email: user.email || "" }));
  }, [user]);

  useEffect(() => {
    setCoupon(couponCode || "");
  }, [couponCode]);

  useEffect(() => {
    if (submitted) return;
    if (items.length === 0) { nav("/cart"); return; }
    revalidate(couponCode || "");
  }, [items.length, couponCode]); // eslint-disable-line

  const revalidate = async (code) => {
    const payload = { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variant: i.variant, combo: i.combo })), coupon_code: code || null, email: form.email || null };
    const { data } = await api.post("/cart/validate", payload);
    setSummary(data);
    if (data.coupon_error) {
      setCoupon("");
      setCouponCode("");
      toast.error(data.coupon_error);
    } else if (data.coupon_code) {
      setCoupon(data.coupon_code);
      setCouponCode(data.coupon_code);
    }
  };

  const focusFirstInvalid = (errors) => {
    const firstInvalid = ["name", "mobile", "email", "address", "city", "state", "pin"].find((key) => errors[key]);
    if (!firstInvalid) return;
    requestAnimationFrame(() => {
      const input = inputRefs.current[firstInvalid];
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
    });
  };

  const placeOrder = async () => {
    const errors = validateCheckoutForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const labels = [
        ["name", "Full Name"], ["mobile", "Mobile number"], ["email", "Email"],
        ["address", "Address"], ["city", "City"], ["state", "State"], ["pin", "6-digit PIN Code"],
      ].filter(([key]) => errors[key]).map(([, label]) => label);
      toast.error(labels.length === 1 ? errors[Object.keys(errors)[0]] : `Please complete the required fields: ${labels.join(", ")}.`);
      focusFirstInvalid(errors);
      return;
    }
    setBusy(true);
    setSubmitted(true);
    try {
      const payload = { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variant: i.variant, combo: i.combo })), customer: form, coupon_code: couponCode || null };
      const { data } = await api.post("/orders", payload);
      const order = data.order;

      if (data.payment_mode === "mock") {
        const { data: verification } = await api.post("/payments/verify", { order_id: order.id });
        if (verification.order.payment_status !== "PAID") throw new Error("Payment was not confirmed");
        removePurchasedItems(order.id, order.items);
        setCouponCode("");
        nav(`/order-success/${order.order_number}`);
        return;
      }

      const cashfree = await load({ mode: data.environment === "production" ? "production" : "sandbox" });
      if (!cashfree || !data.payment_session_id) {
        toast.error("Could not load Cashfree Checkout.");
        setBusy(false);
        setSubmitted(false);
        return;
      }
      const result = await cashfree.checkout({ paymentSessionId: data.payment_session_id, redirectTarget: "_self" });
      if (result?.error) {
        toast.error("Payment was not completed. You can try again.");
        setBusy(false);
        setSubmitted(false);
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
      if (couponCode) {
        try { await revalidate(couponCode); } catch {}
      }
      setBusy(false);
      setSubmitted(false);
    }
  };

  const F = (k, label, props = {}) => (
    <div>
      <label className="text-xs font-semibold text-[var(--ink-soft)]">{label}</label>
      <input ref={(node) => { inputRefs.current[k] = node; }} data-testid={`checkout-${k}`} value={form[k]} onChange={(e) => { setForm({ ...form, [k]: e.target.value }); setFieldErrors((current) => ({ ...current, [k]: "" })); }}
        aria-invalid={Boolean(fieldErrors[k])} aria-describedby={fieldErrors[k] ? `checkout-${k}-error` : undefined}
        className={`w-full mt-1 px-4 py-3 rounded-xl bg-white border outline-none focus:border-[var(--brand)] text-sm ${fieldErrors[k] ? "border-red-400" : "border-[var(--line)]"}`} {...props} />
      {fieldErrors[k] && <p id={`checkout-${k}-error`} className="mt-1 text-xs text-red-600">{fieldErrors[k]}</p>}
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
          {couponCode ? <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 rounded-full bg-[var(--card-2)] text-sm"><span>Coupon <b>{couponCode}</b> ✓</span><button onClick={() => { setCoupon(""); setCouponCode(""); revalidate(""); }} className="text-[var(--ink-soft)] underline">Remove</button></div> : <div className="flex gap-2 mb-4"><input data-testid="checkout-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon" className="flex-1 px-3 py-2.5 rounded-full bg-[var(--card-2)] outline-none text-sm" /><button onClick={() => revalidate(coupon)} className="px-4 py-2.5 rounded-full bg-[var(--ink)] text-white text-sm">Apply</button></div>}
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
            <Lock size={16} /> {busy ? "Processing..." : "Pay Now"}
          </button>
          <p className="text-xs text-center text-[var(--ink-soft)] mt-3">Payments are server-verified. Order confirmed only after payment succeeds.</p>
        </div>
      </div>
    </Section>
  );
}
