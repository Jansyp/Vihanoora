/* Shared build-time catalog access for the sitemap and prerender scripts. */
const DEFAULT_API_ORIGIN = "https://api.vihaanora.com";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

// Local dev .env usually points at localhost, which is useless for a build-time catalog fetch.
function apiBase() {
  const candidate = process.env.SITEMAP_API_URL || process.env.REACT_APP_BACKEND_URL || "";
  const origin = /localhost|127\.0\.0\.1/.test(candidate) || !candidate ? DEFAULT_API_ORIGIN : candidate;
  return `${origin.replace(/\/+$/, "")}/api`;
}

async function getJson(url, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastError;
}

const isPublic = (doc) => Boolean(doc) && doc.active !== false && SLUG_RE.test(doc.slug || "");

async function fetchProducts(api) {
  const items = [];
  let total = 0;
  for (let page = 1; page <= 500; page++) {
    const data = await getJson(`${api}/products?page=${page}&limit=12&sort=newest`);
    const batch = data.items || [];
    total = data.total || 0;
    items.push(...batch);
    if (!batch.length || items.length >= total) break;
  }
  // A short read would silently drop products from the sitemap, so fail instead (callers keep the last good file).
  if (new Set(items.map((i) => i.slug)).size < total - 2) {
    throw new Error(`product listing incomplete: got ${items.length} of ${total}`);
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
