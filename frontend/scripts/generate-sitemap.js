/* Generates public/sitemap.xml from the live catalog API before the production build. */
const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.vihaanora.com";
const OUTPUT = path.join(__dirname, "..", "public", "sitemap.xml");
const STATIC_PATHS = [
  "/", "/women", "/kids", "/gifts", "/keychains", "/combo-offers",
  "/trending", "/offer-zone", "/page/about", "/page/contact",
  "/page/shipping", "/page/returns", "/page/faq", "/page/privacy", "/page/terms",
];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const DEFAULT_API_ORIGIN = "https://api.vihaanora.com";

// Local dev .env usually points at localhost, which is useless for a build-time catalog fetch.
function readBackendUrl() {
  const candidate = process.env.SITEMAP_API_URL || process.env.REACT_APP_BACKEND_URL || "";
  return /localhost|127\.0\.0\.1/.test(candidate) || !candidate ? DEFAULT_API_ORIGIN : candidate;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const isPublic = (doc) => doc && doc.active !== false && SLUG_RE.test(doc.slug || "");

async function fetchProducts(api) {
  const items = [];
  const limit = 12;
  for (let page = 1; ; page++) {
    const data = await getJson(`${api}/products?page=${page}&limit=${limit}&sort=newest`);
    const batch = data.items || [];
    items.push(...batch);
    if (!batch.length || items.length >= (data.total || 0) || page > 500) break;
  }
  return items;
}

async function main() {
  const backend = readBackendUrl().replace(/\/+$/, "");
  if (!backend) throw new Error("REACT_APP_BACKEND_URL is not set");
  const api = `${backend}/api`;

  const [products, combos] = await Promise.all([fetchProducts(api), getJson(`${api}/combos`)]);
  const urls = new Set(STATIC_PATHS.map((p) => `${ORIGIN}${p}`));
  products.filter(isPublic).forEach((p) => urls.add(`${ORIGIN}/product/${p.slug}`));
  (Array.isArray(combos) ? combos : []).filter(isPublic).forEach((c) => urls.add(`${ORIGIN}/combo/${c.slug}`));

  const locs = [...urls].map((u) => `<url><loc>${escapeXml(u)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>\n`;
  fs.writeFileSync(OUTPUT, xml);
  console.log(`sitemap: ${urls.size} URLs (${products.length} products, ${combos.length} combos fetched)`);
}

main().catch((err) => {
  // Keep the committed sitemap so a catalog outage never breaks the build.
  console.warn(`sitemap: generation failed, keeping existing public/sitemap.xml (${err.message})`);
});
