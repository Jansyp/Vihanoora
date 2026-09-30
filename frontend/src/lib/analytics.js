export const GA_MEASUREMENT_ID = "G-0HQ1Q3KHQV";

const isProduction = () => process.env.NODE_ENV === "production";
let fallbackSessionId;

function anonymousSessionId() {
  try {
    const existing = window.sessionStorage.getItem("viaura:analytics:session");
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
    });
    window.sessionStorage.setItem("viaura:analytics:session", created);
    fallbackSessionId = created;
    return created;
  } catch {
    fallbackSessionId ||= "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
    });
    return fallbackSessionId;
  }
}

function firstPartyAttribution() {
  const piiLike = (value) => /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\d{8,}/.test(value || "");
  const clean = (value) => value && !piiLike(value) ? value.trim().slice(0, 100) : "";
  try {
    const storageKey = "viaura:analytics:attribution";
    const params = new URLSearchParams(window.location.search);
    const source = clean(params.get("utm_source"));
    const medium = clean(params.get("utm_medium"));
    const campaign = clean(params.get("utm_campaign"));
    if (source || medium || campaign) {
      const campaignAttribution = { source: source || "Other", medium: medium || "", campaign: campaign || "" };
      window.sessionStorage.setItem(storageKey, JSON.stringify(campaignAttribution));
      return campaignAttribution;
    }
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
  } catch {
    // Fall back to a coarse referrer classification below.
  }

  let source = "Direct";
  let medium = "direct";
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (/instagram\.com$/.test(host) || /l\.instagram\.com$/.test(host)) {
        source = "Instagram";
        medium = "social";
      } else if (/google\./.test(host)) {
        source = "Google";
        medium = "organic";
      } else {
        source = "Other";
        medium = "referral";
      }
    }
  } catch {
    source = "Other";
    medium = "referral";
  }
  return { source, medium, campaign: "" };
}

function coarseDevice() {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  if (/ipad|tablet|kindle|silk/i.test(agent)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(agent)) return "mobile";
  return agent ? "desktop" : "unknown";
}

function collectFirstPartyEvent(name, parameters) {
  try {
    const backend = process.env.REACT_APP_BACKEND_URL;
    if (!backend || typeof window.fetch !== "function") return;
    const attribution = firstPartyAttribution();
    const items = Array.isArray(parameters.items) ? parameters.items.slice(0, 40).flatMap((item) => {
      const itemId = item?.item_id;
      const quantity = Number(item?.quantity);
      return itemId && Number.isFinite(quantity) && quantity > 0 ? [{ item_id: String(itemId), quantity: Math.min(1000, Math.round(quantity)) }] : [];
    }) : [];
    const body = {
      event_name: name,
      session_id: anonymousSessionId(),
      items,
      ...attribution,
      device: coarseDevice(),
    };
    window.fetch(`${backend.replace(/\/$/, "")}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // First-party collection must not affect the storefront.
  }
}

export function trackEvent(name, parameters = {}) {
  try {
    if (!isProduction() || typeof window === "undefined") return false;
    collectFirstPartyEvent(name, parameters);
    if (typeof window.gtag !== "function") return false;
    window.gtag("event", name, parameters);
    return true;
  } catch {
    return false;
  }
}

export function trackPageView(path, searchString = typeof window === "undefined" ? "" : window.location.search) {
  if (!isProduction() || typeof window === "undefined") return;
  // Keep campaign attribution while excluding arbitrary query values (which can contain PII).
  const search = new URLSearchParams(searchString);
  const campaign = new URLSearchParams();
  const piiLike = (value) => /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\d{8,}/.test(value || "");
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"].forEach((key) => {
    const value = search.get(key);
    if (value && !piiLike(value)) campaign.set(key, value);
  });
  const campaignQuery = campaign.toString();
  const pagePath = `${path}${campaignQuery ? `?${campaignQuery}` : ""}`;
  trackEvent("page_view", { page_path: pagePath, page_location: `${window.location.origin}${pagePath}`, page_title: document.title });
}

export function ecommerceItems(items = []) {
  return items.map((item) => {
    const rawPrice = item.price ?? item.unit_price ?? item.effective_price ?? item.combo_price;
    const rawQuantity = item.qty ?? item.quantity;
    const price = Number(rawPrice);
    const quantity = Number(rawQuantity);
    const itemId = item.product_id ?? item.id;
    return {
      ...(itemId != null && itemId !== "" ? { item_id: String(itemId) } : {}),
      ...(typeof item.name === "string" && item.name ? { item_name: item.name } : {}),
      ...(item.category || item.group ? { item_category: item.category || item.group } : {}),
      ...(rawPrice != null && Number.isFinite(price) ? { price } : {}),
      ...(rawQuantity != null && Number.isFinite(quantity) ? { quantity } : {}),
    };
  });
}

export function trackEcommerce(name, items, extra = {}) {
  const parameters = { currency: "INR", ...extra, items: ecommerceItems(items) };
  if (Object.prototype.hasOwnProperty.call(extra, "value")) {
    const value = Number(extra.value);
    if (Number.isFinite(value)) parameters.value = value;
    else delete parameters.value;
  }
  trackEvent(name, parameters);
}

export function trackWhatsAppOrderClick(items, placement, value) {
  const itemValues = items.map((item) => {
    const rawPrice = item.price ?? item.unit_price ?? item.effective_price ?? item.combo_price;
    const rawQuantity = item.qty ?? item.quantity;
    return rawPrice != null && rawQuantity != null && Number.isFinite(Number(rawPrice)) && Number.isFinite(Number(rawQuantity))
      ? Number(rawPrice) * Number(rawQuantity)
      : null;
  });
  const orderValue = value != null ? Number(value) : itemValues.every((itemValue) => itemValue != null) ? itemValues.reduce((sum, itemValue) => sum + itemValue, 0) : null;
  trackEcommerce("whatsapp_order_click", items, { placement, ...(Number.isFinite(orderValue) ? { value: orderValue } : {}) });
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
  if (!id || order?.payment_status !== "PAID" || !isProduction()) return;
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
