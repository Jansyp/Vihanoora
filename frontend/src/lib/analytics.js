export const GA_MEASUREMENT_ID = "G-0HQ1Q3KHQV";

const isProduction = () => process.env.NODE_ENV === "production";

export function trackEvent(name, parameters = {}) {
  try {
    if (!isProduction() || typeof window === "undefined" || typeof window.gtag !== "function") return false;
    window.gtag("event", name, parameters);
    return true;
  } catch {
    return false;
  }
}

export function trackPageView(path) {
  if (!isProduction() || typeof window === "undefined") return;
  // Keep campaign attribution while excluding arbitrary query values (which can contain PII).
  const search = new URLSearchParams(window.location.search);
  const campaign = new URLSearchParams();
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"].forEach((key) => {
    const value = search.get(key);
    if (value) campaign.set(key, value);
  });
  const pagePath = `${path}${campaign.size ? `?${campaign.toString()}` : ""}`;
  trackEvent("page_view", { page_path: pagePath, page_location: `${window.location.origin}${pagePath}`, page_title: document.title });
}

export function ecommerceItems(items = []) {
  return items.map((item) => ({
    item_id: String(item.product_id ?? item.id ?? ""),
    item_name: item.name || "",
    ...(item.group || item.category ? { item_category: item.group || item.category } : {}),
    price: Number(item.price ?? item.unit_price ?? item.effective_price ?? item.combo_price ?? 0),
    quantity: Number(item.qty ?? item.quantity ?? 1),
  }));
}

export function trackEcommerce(name, items, extra = {}) {
  trackEvent(name, { currency: "INR", ...extra, items: ecommerceItems(items) });
}

const sentPurchases = new Set();
const sentPaymentOutcomes = new Set();
export function trackPaymentOutcomeOnce(order, status) {
  const id = String(order?.id || "");
  const outcome = String(status || "").toUpperCase();
  if (!id || !["PAID", "FAILED"].includes(outcome) || !isProduction()) return;
  const key = `viaura:ga4:payment:${outcome}:${id}`;
  try {
    if (sentPaymentOutcomes.has(key) || window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    if (sentPaymentOutcomes.has(key)) return;
  }
  sentPaymentOutcomes.add(key);
  trackEvent(outcome === "PAID" ? "payment_success" : "payment_failed", { transaction_id: id });
}

export function trackPurchaseOnce(order) {
  const id = String(order?.id || "");
  if (!id || !isProduction()) return;
  const key = `viaura:ga4:purchase:${id}`;
  try {
    if (sentPurchases.has(id) || window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    if (sentPurchases.has(id)) return;
  }
  sentPurchases.add(id);
  trackEcommerce("purchase", order.items || [], {
    transaction_id: id,
    value: Number(order.grand_total || 0),
    currency: "INR",
  });
}

export function initializeAnalytics() {
  try {
    if (!isProduction() || typeof document === "undefined") return;
    if (window.__viauraGaInitialized) return;
    window.__viauraGaInitialized = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
    if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }
  } catch {
    // Analytics must never interrupt rendering or navigation.
  }
}
