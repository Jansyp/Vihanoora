const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ORIGIN = "https://vihaanora.com";
const OUTPUT = path.join(__dirname, "..", "public", "sitemap.xml");
const STATIC_PATHS = [
  "/", "/women", "/kids", "/gifts", "/keychains", "/combo-offers",
  "/trending", "/offer-zone", "/page/about", "/page/contact",
  "/page/shipping", "/page/returns", "/page/faq", "/page/privacy", "/page/terms",
];

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  })[char]);
}

function safeSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}

async function readPublicProductSlugs() {
  const backend = process.env.REACT_APP_BACKEND_URL;
  if (!backend) return [];
  const backendHost = new URL(backend).hostname.toLowerCase();
  if (backendHost === "localhost" || backendHost === "127.0.0.1" || backendHost === "::1") return [];

  const slugs = [];
  let page = 1;
  while (true) {
    const url = new URL("/api/products", backend);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "12");
    url.searchParams.set("sort", "newest");
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Catalogue sitemap request failed: HTTP ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    slugs.push(...items.filter((item) => item && item.active !== false).map((item) => item.slug).filter(safeSlug));
    if (!items.length || page * 12 >= Number(data.total || 0)) break;
    page += 1;
  }
  return slugs;
}

async function generate() {
  const urls = new Set(STATIC_PATHS.map((item) => `${ORIGIN}${item}`));
  for (const slug of await readPublicProductSlugs()) urls.add(`${ORIGIN}/product/${encodeURIComponent(slug)}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(OUTPUT, xml, "utf8");
  return urls.size;
}

if (require.main === module) {
  generate().then((count) => console.log(`Generated sitemap with ${count} URLs`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { escapeXml, generate, readPublicProductSlugs, safeSlug, STATIC_PATHS, ORIGIN, OUTPUT };
