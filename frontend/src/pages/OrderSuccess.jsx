import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { CheckCircle2, Package } from "lucide-react";
import api, { formatINR } from "@/lib/api";
import { Section } from "@/components/common";
import GiftReveal from "@/components/GiftReveal";
import { useCart } from "@/context/CartContext";

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  const location = useLocation();
  const { removePurchasedItems, setCouponCode } = useCart();
  const [order, setOrder] = useState(null);
  const [checking, setChecking] = useState(location.pathname.startsWith("/payment-return"));
  const isPaymentReturn = location.pathname.startsWith("/payment-return");
  const cashfreeOrderId = new URLSearchParams(location.search).get("order_id");

  useEffect(() => {
    let active = true;
    const loadOrder = async () => {
      let latestOrder = null;
      try {
        const { data } = await api.get(`/orders/${orderNumber}`);
        latestOrder = data;
        if (active) setOrder(data);

        if (isPaymentReturn && latestOrder.payment_status === "PENDING") {
          for (let attempt = 0; attempt < 5 && latestOrder.payment_status === "PENDING"; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
            if (!active) return;
            const endpoint = cashfreeOrderId ? "/payments/cashfree/return" : "/payments/verify";
            const reference = cashfreeOrderId || latestOrder.id;
            const result = await api.post(endpoint, { order_id: reference });
            latestOrder = result.data.order;
            if (active) setOrder(latestOrder);
          }
        }

        if (active && latestOrder.payment_status === "PAID") {
          removePurchasedItems(latestOrder.id, latestOrder.items);
          setCouponCode("");
        }
      } catch (e) {
        if (active) setOrder(latestOrder);
      } finally {
        if (active) setChecking(false);
      }
    };
    loadOrder();
    return () => { active = false; };
  }, [orderNumber, location.pathname, location.search, isPaymentReturn, cashfreeOrderId, removePurchasedItems, setCouponCode]);

  const paymentStatus = order?.payment_status;
  const isPaid = paymentStatus === "PAID";
  const isFailed = paymentStatus === "FAILED";

  return (
    <Section className="max-w-2xl">
      <div className="bg-white rounded-[2rem] border border-[var(--line)] p-8 sm:p-12 text-center soft-shadow">
        <div className={`flex items-center justify-center gap-2 ${isPaid ? "text-[var(--sage-dark)]" : isFailed ? "text-red-600" : "text-[var(--amber)]"}`}>
          {isPaid ? <CheckCircle2 size={30} /> : null}
          <span className="font-semibold text-lg">{checking ? "Checking Payment" : isPaid ? "Payment Successful" : isFailed ? "Payment Failed" : "Payment Pending"}</span>
        </div>
        {isPaid && <GiftReveal />}
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold mt-2">{checking ? "Checking payment" : isPaid ? "Thank you! 🎉" : isFailed ? "Payment failed" : "Payment pending"}</h1>
        <p className="text-[var(--ink-soft)] mt-2">{checking ? "We are checking the payment status securely." : isPaid ? "Your order has been confirmed and is being prepared with love." : isFailed ? "Your order has not been confirmed. You can retry payment." : "Your payment is still being processed. We'll update the order once Cashfree confirms it."}</p>
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
            <div className="border-t border-[var(--line)] mt-3 pt-3 flex justify-between font-bold"><span>{isPaid ? "Total Paid" : "Order Total"}</span><span className="text-[var(--brand)]">{formatINR(order.grand_total)}</span></div>
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          {isFailed && !checking && <Link to="/checkout" className="px-7 py-3.5 rounded-full bg-[var(--brand)] text-white font-medium">Retry Payment</Link>}
          <Link to={`/track?order=${orderNumber}`} data-testid="track-link" className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-[var(--ink)] text-white font-medium"><Package size={17} /> Track Order</Link>
          <Link to="/" className="px-7 py-3.5 rounded-full bg-white border border-[var(--line)] font-medium">Continue Shopping</Link>
        </div>
      </div>
    </Section>
  );
}
