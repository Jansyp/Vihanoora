import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Package } from "lucide-react";
import api, { formatINR } from "@/lib/api";
import { Section } from "@/components/common";
import GiftReveal from "@/components/GiftReveal";

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    api.get(`/orders/${orderNumber}`).then(({ data }) => setOrder(data)).catch(() => {});
  }, [orderNumber]);

  return (
    <Section className="max-w-2xl">
      <div className="bg-white rounded-[2rem] border border-[var(--line)] p-8 sm:p-12 text-center soft-shadow">
        <div className="flex items-center justify-center gap-2 text-[var(--sage-dark)]">
          <CheckCircle2 size={30} /><span className="font-semibold text-lg">Payment Successful</span>
        </div>
        <GiftReveal />
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold mt-2">Thank you! 🎉</h1>
        <p className="text-[var(--ink-soft)] mt-2">Your order has been confirmed and is being prepared with love.</p>
        <div className="mt-6 inline-block bg-[var(--blush)] rounded-2xl px-6 py-3">
          <p className="text-xs text-[var(--ink-soft)]">Order Number</p>
          <p className="font-bold text-lg text-[var(--brand)]" data-testid="order-number">{orderNumber}</p>
        </div>
        {order && (
          <div className="mt-6 text-left bg-[var(--card-2)] rounded-2xl p-5">
            <div className="space-y-2">
              {order.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm"><span className="text-[var(--ink-soft)]">{i.name} × {i.qty}</span><span className="font-medium">{formatINR(i.unit_price * i.qty)}</span></div>
              ))}
            </div>
            <div className="border-t border-[var(--line)] mt-3 pt-3 flex justify-between font-bold"><span>Total Paid</span><span className="text-[var(--brand)]">{formatINR(order.grand_total)}</span></div>
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to={`/track?order=${orderNumber}`} data-testid="track-link" className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium"><Package size={17} /> Track Order</Link>
          <Link to="/" className="px-7 py-3.5 rounded-full bg-white border border-[var(--line)] font-medium">Continue Shopping</Link>
        </div>
      </div>
    </Section>
  );
}
