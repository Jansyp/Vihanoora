/* Post-build: writes per-route HTML shells so crawlers that do not run JavaScript still get
   correct title, description, canonical, Open Graph tags and JSON-LD. The React app boots from
   the same shell and keeps the metadata in sync client-side. */
const fs = require("fs");
const path = require("path");
const { fetchCatalog } = require("./catalog");
const {
  PAGE_META, pageMeta, productMeta, comboMeta, renderHeadHtml, escapeHtml,
} = require("../src/lib/seoMeta");

const BUILD_DIR = path.join(__dirname, "..", "build");
const TEMPLATE_PATH = path.join(BUILD_DIR, "index.html");
const NOSCRIPT_RE = /<noscript>[\s\S]*?<\/noscript>/;
const NOINDEX_SHELLS = ["/search", "/cart", "/checkout", "/login", "/account", "/wishlist", "/track", "/admin"];

function stripManagedHead(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/, "")
    .replace(/<script data-seo="1"[\s\S]*?<\/script>\s*/g, "")
    .replace(/<(?:meta|link)[^>]*data-seo="1"[^>]*>\s*/g, "");
}

function render(template, meta, noscriptBody = "") {
  let html = stripManagedHead(template).replace("</head>", `        ${renderHeadHtml(meta)}\n    </head>`);
  const message = "You need to enable JavaScript to run this app.";
  html = html.replace(NOSCRIPT_RE, `<noscript>${noscriptBody}${noscriptBody ? "<p>" : ""}${message}${noscriptBody ? "</p>" : ""}</noscript>`);
  return html;
}

function writeRoute(template, route, meta, noscriptBody) {
  const target = route === "/" ? TEMPLATE_PATH : path.join(BUILD_DIR, ...route.split("/").filter(Boolean), "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, render(template, meta, noscriptBody));
}

const summaryHtml = (name, summary, extra = "") =>
  `<h1>${escapeHtml(name)}</h1><p>${escapeHtml(summary)}</p>${extra}`;

async function main() {
  if (!fs.existsSync(TEMPLATE_PATH)) throw new Error("build/index.html not found; run the build first");
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  let catalog = { products: [], combos: [], settings: null };
  try {
    catalog = await fetchCatalog();
  } catch (err) {
    console.warn(`prerender: catalog unavailable, writing static pages only (${err.message})`);
  }

  let count = 0;
  Object.keys(PAGE_META).forEach((route) => {
    const meta = pageMeta(route, { settings: catalog.settings });
    writeRoute(template, route, meta, route === "/" ? "" : summaryHtml(meta.title, meta.description));
    count += 1;
  });
  NOINDEX_SHELLS.forEach((route) => {
    writeRoute(template, route, pageMeta(route));
    count += 1;
  });
  catalog.products.forEach((p) => {
    const meta = productMeta(p);
    const price = p.effective_price ?? p.selling_price;
    const extra = price ? `<p>Price: ₹${escapeHtml(price)}${p.stock_state ? ` — ${escapeHtml(p.stock_state)}` : ""}</p>` : "";
    writeRoute(template, `/product/${p.slug}`, meta, summaryHtml(p.name, meta.summary, extra));
    count += 1;
  });
  catalog.combos.forEach((c) => {
    const meta = comboMeta(c);
    const extra = c.combo_price ? `<p>Combo price: ₹${escapeHtml(c.combo_price)}</p>` : "";
    writeRoute(template, `/combo/${c.slug}`, meta, summaryHtml(c.name, meta.summary, extra));
    count += 1;
  });
  console.log(`prerender: wrote ${count} route shells (${catalog.products.length} products, ${catalog.combos.length} combos)`);
}

main().catch((err) => {
  console.warn(`prerender: skipped (${err.message})`);
});
