import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Package, Truck, CheckCircle2, Clock, XCircle, RotateCcw } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { Section } from "@/components/common";
import OrderItemImage from "@/components/OrderItemImage";

const TIMELINE = ["Placed", "Payment Confirmed", "Processing", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const GENERIC_ERROR = "Unable to retrieve your order right now. Please try again.";

export default function TrackOrder() {
  const { orderNumber: authedOrderNumber } = useParams();
  const [sp] = useSearchParams();
  const [order, setOrder] = useState(sp.get("order") || "");
  const [contact, setContact] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const track = async (e) => {
    e?.preventDefault();
    setErr(""); setResult(null);
    if (!order.trim()) { setErr("Please enter your Order ID."); return; }
    if (!contact.trim()) { setErr("Please enter the mobile number or email used for the order."); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/orders/track?order_number=${encodeURIComponent(order.trim())}&contact=${encodeURIComponent(contact.trim())}`);
      setResult(data);
    } catch (e2) { setErr(e2.response?.data?.detail ? formatApiError(e2.response.data.detail) : GENERIC_ERROR); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!authedOrderNumber) return;
    setErr(""); setResult(null); setLoading(true);
    api.get(`/my/orders/${encodeURIComponent(authedOrderNumber)}/track`)
      .then(({ data }) => setResult(data))
      .catch((e2) => setErr(e2.response?.data?.detail ? formatApiError(e2.response.data.detail) : GENERIC_ERROR))
      .finally(() => setLoading(false));
  }, [authedOrderNumber]);

  const isClosedStatus = result && ["Cancelled", "Returned"].includes(result.order_status);
  const reached = (status) => {
    const done = new Set((result?.status_history || []).map((h) => h.status));
    // map order_status into timeline progress
    const idx = TIMELINE.indexOf(result?.order_status);
    return done.has(status) || (idx >= 0 && TIMELINE.indexOf(status) <= idx);
  };

  return (
    <Section className="max-w-2xl">
      <h1 className="font-serif text-3xl sm:text-4xl font-semibold mb-2">Track Your Order</h1>
      {!authedOrderNumber && (
        <>
          <p className="text-[var(--ink-soft)] mb-6">Enter your Order ID and the mobile or email used on the order.</p>
          <form onSubmit={track} className="bg-white rounded-3xl p-6 border border-[var(--line)] space-y-3">
            <input data-testid="track-order-input" value={order} onChange={(e) => setOrder(e.target.value.toUpperCase())} placeholder="Order ID (e.g. JH202600001)" className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
            <input data-testid="track-contact-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Mobile or Email" className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
            <button data-testid="track-submit" disabled={loading} className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-medium disabled:opacity-50">{loading ? "Searching..." : "Track Order"}</button>
            {err && <p className="text-sm text-destructive text-center">{err}</p>}
          </form>
        </>
      )}
      {authedOrderNumber && loading && <p className="text-[var(--ink-soft)]">Loading your order...</p>}
      {authedOrderNumber && err && <p className="text-sm text-destructive">{err}</p>}

      {result && (
        <div className="mt-6 bg-white rounded-3xl p-6 border border-[var(--line)]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-[var(--ink-soft)]">Order</p>
              <p className="font-bold text-lg">{result.order_number}</p>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-[var(--blush)] text-[var(--brand)] font-semibold text-sm" data-testid="track-status">{result.order_status}</span>
          </div>

          {isClosedStatus ? (
            <div className={`mt-6 flex items-center gap-3 p-4 rounded-2xl ${result.order_status === "Cancelled" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
              {result.order_status === "Cancelled" ? <XCircle size={20} /> : <RotateCcw size={20} />}
              <span className="text-sm font-medium">This order was {result.order_status.toLowerCase()}.</span>
            </div>
          ) : (
            <div className="mt-6 relative pl-2">
              {TIMELINE.map((step, i) => {
                const on = reached(step);
                return (
                  <div key={step} className="flex gap-3 pb-6 last:pb-0 relative">
                    {i < TIMELINE.length - 1 && <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${on ? "bg-[var(--brand)]" : "bg-[var(--line)]"}`} />}
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${on ? "bg-[var(--brand)] text-white" : "bg-[var(--card-2)] text-[var(--ink-soft)]"}`}>
                      {on ? <CheckCircle2 size={14} /> : <Clock size={12} />}
                    </span>
                    <span className={`text-sm font-medium ${on ? "text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>{step}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!isClosedStatus && (
            result.shipping?.awb ? (
              <div className="mt-2 p-4 bg-[var(--card-2)] rounded-2xl text-sm">
                <p className="flex items-center gap-2 font-semibold"><Truck size={16} /> {result.shipping.courier}</p>
                <p className="text-[var(--ink-soft)] mt-1">
                  Tracking Number:{" "}
                  {result.shipping.tracking_url ? (
                    <a href={result.shipping.tracking_url} target="_blank" rel="noreferrer" className="text-[var(--brand)] font-medium underline">{result.shipping.awb}</a>
                  ) : result.shipping.awb}
                </p>
                {result.shipping.expected_delivery && <p className="text-[var(--ink-soft)]">Expected: {result.shipping.expected_delivery}</p>}
              </div>
            ) : (
              <div className="mt-2 p-4 bg-[var(--card-2)] rounded-2xl text-sm text-[var(--ink-soft)]">
                Your order is being prepared. Tracking details will appear once your parcel is shipped.
              </div>
            )
          )}

          <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
            {result.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center gap-3 text-sm">
                <OrderItemImage image={item.image} productId={item.product_id} alt={item.name} className="w-14 h-14 rounded-xl object-cover" />
                <div className="flex-1">
                  <p>{item.name} × {item.qty}</p>
                  {item.variant && <p className="text-xs text-[var(--ink-soft)]">Colour: {item.variant}</p>}
                </div>
                {item.unit_price != null && <span className="font-medium">{formatINR(item.unit_price * item.qty)}</span>}
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 text-sm border-t border-[var(--line)] pt-4">
            {result.subtotal != null && <div className="flex justify-between"><span className="text-[var(--ink-soft)]">Subtotal</span><span>{formatINR(result.subtotal)}</span></div>}
            {result.coupon_discount > 0 && <div className="flex justify-between"><span className="text-[var(--ink-soft)]">Coupon {result.coupon_code ? `(${result.coupon_code})` : ""}</span><span className="text-[var(--sage-dark)]">- {formatINR(result.coupon_discount)}</span></div>}
            <div className="flex justify-between"><span className="text-[var(--ink-soft)]">Delivery</span><span>{result.delivery_charge ? formatINR(result.delivery_charge) : "FREE"}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-[var(--line)] pt-2 mt-1"><span>Total</span><span className="text-[var(--brand)]">{formatINR(result.grand_total)}</span></div>
          </div>

          <div className="mt-4 flex justify-between text-sm border-t border-[var(--line)] pt-3">
            <span className="text-[var(--ink-soft)] flex items-center gap-1"><Package size={15} /> {result.items.length} item(s)</span>
          </div>
        </div>
      )}
    </Section>
  );
}

