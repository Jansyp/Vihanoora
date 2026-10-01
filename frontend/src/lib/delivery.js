export const FREE_SHIPPING_THRESHOLD = 199;
export const STANDARD_DELIVERY_CHARGE = 50;

export function getFreeDeliveryMessage(eligibleSubtotal, threshold = FREE_SHIPPING_THRESHOLD) {
  const subtotal = Number(eligibleSubtotal || 0);
  if (subtotal >= Number(threshold)) return "\u{1F389} You've unlocked FREE delivery!";
  const remaining = Math.max(1, Math.ceil(Number(threshold) - subtotal));
  return `Shop \u20b9${remaining} more to avail FREE delivery \u{1F381}`;
}
