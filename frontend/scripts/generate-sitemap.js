/* Generates public/sitemap.xml from the live catalog API before the production build. */
const fs = require("fs");
const path = require("path");
const { fetchCatalog } = require("./catalog");
const { ORIGIN, PAGE_META } = require("../src/lib/seoMeta");

const OUTPUT = path.join(__dirname, "..", "public", "sitemap.xml");
// Static public pages = every indexable route that has dedicated metadata, except the Instagram landing page.
const STATIC_PATHS = Object.keys(PAGE_META).filter((p) => p !== "/instagram");

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function main() {
  const { products, combos } = await fetchCatalog();
  const urls = new Set(STATIC_PATHS.map((p) => (p === "/" ? `${ORIGIN}/` : `${ORIGIN}${p}`)));
  products.forEach((p) => urls.add(`${ORIGIN}/product/${p.slug}`));
  combos.forEach((c) => urls.add(`${ORIGIN}/combo/${c.slug}`));

  const locs = [...urls].map((u) => `<url><loc>${escapeXml(u)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>\n`;
  fs.writeFileSync(OUTPUT, xml);
  console.log(`sitemap: ${urls.size} URLs (${products.length} products, ${combos.length} combos)`);
}

main().catch((err) => {
  // Keep the committed sitemap so a catalog outage never breaks the build.
  console.warn(`sitemap: generation failed, keeping existing public/sitemap.xml (${err.message})`);
});
