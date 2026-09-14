import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Truck, CheckCircle2, Clock, MapPin } from "lucide-react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { Section } from "@/components/common";

const TIMELINE = ["Placed", "Payment Confirmed", "Processing", "Packed", "Shipped", "Out for Delivery", "Delivered"];

export default function TrackOrder() {
  const [sp] = useSearchParams();
  const [order, setOrder] = useState(sp.get("order") || "");
  const [contact, setContact] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const track = async (e) => {
    e?.preventDefault();
    setErr(""); setResult(null); setLoading(true);
    try {
      const { data } = await api.get(`/orders/track?order_number=${encodeURIComponent(order)}&contact=${encodeURIComponent(contact)}`);
      setResult(data);
    } catch (e2) { setErr(formatApiError(e2.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const reached = (status) => {
    const done = new Set((result?.status_history || []).map((h) => h.status));
    // map order_status into timeline progress
    const idx = TIMELINE.indexOf(result?.order_status);
    return done.has(status) || (idx >= 0 && TIMELINE.indexOf(status) <= idx);
  };

  return (
    <Section className="max-w-2xl">
      <h1 className="font-serif text-3xl sm:text-4xl font-semibold mb-2">Track Your Order</h1>
      <p className="text-[var(--ink-soft)] mb-6">Enter your Order ID and the mobile or email used on the order.</p>
      <form onSubmit={track} className="bg-white rounded-3xl p-6 border border-[var(--line)] space-y-3">
        <input data-testid="track-order-input" value={order} onChange={(e) => setOrder(e.target.value.toUpperCase())} placeholder="Order ID (e.g. JH202600001)" className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
        <input data-testid="track-contact-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Mobile or Email" className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
        <button data-testid="track-submit" disabled={loading} className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-medium disabled:opacity-50">{loading ? "Searching..." : "Track Order"}</button>
        {err && <p className="text-sm text-destructive text-center">{err}</p>}
      </form>

      {result && (
        <div className="mt-6 bg-white rounded-3xl p-6 border border-[var(--line)]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-[var(--ink-soft)]">Order</p>
              <p className="font-bold text-lg">{result.order_number}</p>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-[var(--blush)] text-[var(--brand)] font-semibold text-sm" data-testid="track-status">{result.order_status}</span>
          </div>

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

          {result.shipping?.awb && (
            <div className="mt-2 p-4 bg-[var(--card-2)] rounded-2xl text-sm">
              <p className="flex items-center gap-2 font-semibold"><Truck size={16} /> {result.shipping.courier}</p>
              <p className="text-[var(--ink-soft)] mt-1">Tracking: {result.shipping.awb}</p>
              {result.shipping.expected_delivery && <p className="text-[var(--ink-soft)]">Expected: {result.shipping.expected_delivery}</p>}
              {result.shipping.tracking_url && <a href={result.shipping.tracking_url} target="_blank" rel="noreferrer" className="text-[var(--brand)] font-medium inline-block mt-1">Track on courier site →</a>}
            </div>
          )}

          <div className="mt-4 flex justify-between text-sm border-t border-[var(--line)] pt-3">
            <span className="text-[var(--ink-soft)] flex items-center gap-1"><Package size={15} /> {result.items.length} item(s)</span>
            <span className="font-bold text-[var(--brand)]">{formatINR(result.grand_total)}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
