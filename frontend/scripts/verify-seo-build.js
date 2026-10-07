/* Verifies build output: robots.txt, sitemap validity/host/duplicates, and that every sitemap URL has a prerendered page.
   Usage: node scripts/verify-seo-build.js [slug-that-must-be-listed ...] */
const fs = require("fs");
const path = require("path");

const BUILD = path.join(__dirname, "..", "build");
const ORIGIN = "https://www.vihaanora.com/";
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const robots = fs.readFileSync(path.join(BUILD, "robots.txt"), "utf8");
if (!robots.includes("Sitemap: https://www.vihaanora.com/sitemap.xml")) fail("robots.txt sitemap line is wrong");

const xml = fs.readFileSync(path.join(BUILD, "sitemap.xml"), "utf8");
if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/.test(xml)) fail("sitemap.xml structure invalid");
const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
if (new Set(locs).size !== locs.length) fail("duplicate sitemap URLs");
locs.filter((u) => !u.startsWith(ORIGIN)).forEach((u) => fail(`wrong host: ${u}`));
locs.filter((u) => /\/(admin|login|account|cart|checkout|search|wishlist|track)/.test(u)).forEach((u) => fail(`private URL listed: ${u}`));

const missingShells = locs.filter((u) => {
  const rel = u.slice(ORIGIN.length);
  return !fs.existsSync(path.join(BUILD, ...rel.split("/").filter(Boolean), "index.html")) && rel !== "";
});
missingShells.forEach((u) => fail(`no prerendered page for ${u}`));

process.argv.slice(2).forEach((slug) => {
  const url = `${ORIGIN}product/${slug}`;
  if (!locs.includes(url)) { fail(`${url} missing from sitemap`); return; }
  const html = fs.readFileSync(path.join(BUILD, "product", slug, "index.html"), "utf8");
  if (!html.includes(`<link data-seo="1" rel="canonical" href="${url}"`)) fail(`${slug}: canonical missing`);
  if (!html.includes('"@type":"Product"')) fail(`${slug}: Product JSON-LD missing`);
  if (/<meta[^>]*name="robots"[^>]*noindex/.test(html)) fail(`${slug}: noindex present`);
});

if (!process.exitCode) console.log(`OK: ${locs.length} sitemap URLs, all unique, www host, prerendered pages present`);
