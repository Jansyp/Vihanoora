import { formatINR } from "@/lib/api";

export const VIAURA_WHATSAPP_NUMBER = "917010177567";

export function viauraWhatsAppUrl(message) {
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${VIAURA_WHATSAPP_NUMBER}${query}`;
}

export function whatsappOrderUrl(items, total) {
  const lines = items.map((item) => {
    const productPath = item.combo ? `/combo/${item.slug}` : `/product/${item.slug}`;
    return [
      `Product: ${item.name}`,
      item.variant ? `Colour: ${item.variant}` : null,
      `Quantity: ${item.qty}`,
      `Price: ${formatINR(item.price)} each (${formatINR(item.price * item.qty)} total)`,
      `Product link: ${window.location.origin}${productPath}`,
    ].filter(Boolean).join("\n");
  });
  const message = ["Hi Viaura, I would like to place an order:", "", ...lines.flatMap((line) => [line, ""]),
    total != null ? `Cart total: ${formatINR(total)}` : null].filter(Boolean).join("\n");
  return viauraWhatsAppUrl(message);
}
