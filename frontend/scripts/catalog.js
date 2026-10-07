/* Shared build-time catalog access for the sitemap and prerender scripts. */
const DEFAULT_API_ORIGIN = "https://api.vihaanora.com";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

// Local dev .env usually points at localhost, which is useless for a build-time catalog fetch.
function apiBase() {
  const candidate = process.env.SITEMAP_API_URL || process.env.REACT_APP_BACKEND_URL || "";
  const origin = /localhost|127\.0\.0\.1/.test(candidate) || !candidate ? DEFAULT_API_ORIGIN : candidate;
  return `${origin.replace(/\/+$/, "")}/api`;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const isPublic = (doc) => Boolean(doc) && doc.active !== false && SLUG_RE.test(doc.slug || "");

async function fetchProducts(api) {
  const items = [];
  for (let page = 1; page <= 500; page++) {
    const data = await getJson(`${api}/products?page=${page}&limit=12&sort=newest`);
    const batch = data.items || [];
    items.push(...batch);
    if (!batch.length || items.length >= (data.total || 0)) break;
  }
  return items;
}

/** Returns de-duplicated public products and combos plus site settings (null if unavailable). */
async function fetchCatalog() {
  const api = apiBase();
  const [products, combos, settings] = await Promise.all([
    fetchProducts(api),
    getJson(`${api}/combos`),
    getJson(`${api}/settings`).catch(() => null),
  ]);
  const unique = (list) => [...new Map((Array.isArray(list) ? list : []).filter(isPublic).map((d) => [d.slug, d])).values()];
  return { products: unique(products), combos: unique(combos), settings };
}

module.exports = { fetchCatalog };
