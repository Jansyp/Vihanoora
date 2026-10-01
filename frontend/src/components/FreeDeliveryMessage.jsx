import { FREE_SHIPPING_THRESHOLD, getFreeDeliveryMessage } from "@/lib/delivery";

export default function FreeDeliveryMessage({ subtotal, threshold = FREE_SHIPPING_THRESHOLD }) {
  return (
    <p data-testid="free-delivery-message" role="status" className="mb-3 rounded-xl bg-[var(--sage)]/20 px-3 py-2 text-sm font-medium text-[var(--sage-dark)]">
      {getFreeDeliveryMessage(subtotal, threshold)}
    </p>
  );
}
