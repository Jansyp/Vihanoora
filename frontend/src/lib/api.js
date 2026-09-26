import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const CLOUDINARY_BASE =
  "https://res.cloudinary.com/dffywdpf/image/upload";

export function assetUrl(url) {
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

        return `${CLOUDINARY_BASE}/f_auto,q_auto/Viaura/products/${publicId}`;
      }
    }

    // Keep localhost URLs working during development.
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    ) {
      return `${BACKEND_URL}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }

  return url;
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
