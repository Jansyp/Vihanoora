import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const CLOUDINARY_BASE =
  "https://res.cloudinary.com/dffywdpf/image/upload";

// Injects a Cloudinary width/quality transform (on-the-fly resize, no new asset created).
function withCloudinaryWidth(url, width) {
  if (!width || typeof url !== "string" || !url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) {
    return url;
  }
  if (url.includes("/image/upload/f_auto,q_auto/")) {
    return url.replace("/image/upload/f_auto,q_auto/", `/image/upload/f_auto,q_auto,w_${width},c_limit/`);
  }
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width},c_limit/`);
}

export function assetUrl(url, { width } = {}) {
  if (!url) return url;

  let path = url;

  // Handle relative backend paths
  if (path.startsWith("/")) {
    path = `${BACKEND_URL}${path}`;
  }

  try {
    const parsed = new URL(path);

    // Convert product files served through Render
    // directly to Cloudinary.
    if (
      parsed.pathname.includes("/api/files/") &&
      /\/api\/files\/(vihaanora|viaura|javehouse)\/products\//i.test(
        parsed.pathname
      )
    ) {
      const match = parsed.pathname.match(
        /\/api\/files\/(?:vihaanora|viaura|javehouse)\/products\/(.+)$/i
      );

      if (match) {
        const filename = decodeURIComponent(match[1]);
        const publicId = filename.replace(/\.[^/.]+$/, "");

        return withCloudinaryWidth(`${CLOUDINARY_BASE}/f_auto,q_auto/Viaura/products/${publicId}`, width);
      }
    }

    // Keep localhost URLs working during development.
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    ) {
      return `${BACKEND_URL}${parsed.pathname}${parsed.search}`;
    }

    if (parsed.hostname === "res.cloudinary.com") {
      return withCloudinaryWidth(path, width);
    }
  } catch {
    return url;
  }

  return url;
}

// Responsive srcset using Cloudinary's on-the-fly resize; undefined when the
// resolved image isn't Cloudinary-backed (e.g. local dev fallback paths).
export function productSrcSet(url, widths = [320, 480, 640, 960]) {
  const resolved = assetUrl(url);
  if (typeof resolved !== "string" || !resolved.includes("res.cloudinary.com/")) return undefined;
  return widths.map((w) => `${withCloudinaryWidth(resolved, w)} ${w}w`).join(", ");
}

const responseCache = new Map();
const CACHEABLE_CATALOG_PATH = /^\/(?:products(?:\?|$)|categories(?:\?|$)|combos(?:\?|$)|offer-zone(?:\?|$)|banners(?:\?|$))/;

// Short-lived in-memory cache shares in-flight catalogue GETs between storefront components.
export function getCatalog(url, { ttl = 30000, signal } = {}) {
  if (!CACHEABLE_CATALOG_PATH.test(url)) return api.get(url, { signal });
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key);
  }
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = api.get(url, { signal }).catch((error) => {
    if (responseCache.get(url)?.promise === promise) responseCache.delete(url);
    throw error;
  });
  responseCache.set(url, { promise, expiresAt: now + ttl });
  while (responseCache.size > 100) responseCache.delete(responseCache.keys().next().value);
  return promise;
}

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export function subscribeToNewsletter(email) {
  return api.post("/newsletter/subscribe", { email });
}

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const formatINR = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default api;
