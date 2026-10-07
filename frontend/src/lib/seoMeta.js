/* Shared SEO metadata builders. Kept as CommonJS so both the React app and the Node build scripts can use it. */

const SITE_NAME = "Viaura";
const ORIGIN = "https://www.vihaanora.com";
const LOGO_URL = `${ORIGIN}/viaura-wordmark.png`;
const DEFAULT_IMAGE = LOGO_URL;

const HOME_TITLE = "Viaura | Jewellery, Accessories, Gifts & More";
const HOME_DESCRIPTION =
  "Viaura is an online store for jewellery, hair accessories, gifts and gift hampers, toys and trending accessories. Easy gifting, delivered across India.";

const GROUP_LABELS = { women: "Women", kids: "Kids", gifts: "Gifts", keychains: "Keychains" };

const PAGE_META = {
  "/": { title: HOME_TITLE, description: HOME_DESCRIPTION },
  "/women": {
    title: "Women's Jewellery & Accessories | Viaura",
    description: "Shop women's jewellery, necklaces, bracelets, hair accessories and trending fashion accessories online at Viaura.",
  },
  "/kids": {
    title: "Kids' Accessories & Toys | Viaura",
    description: "Browse cute kids' accessories, toys and playful finds at Viaura. Thoughtful picks for little ones, delivered across India.",
  },
  "/gifts": {
    title: "Gifts & Gift Hampers | Viaura",
    description: "Find thoughtful gifts and gift hampers at Viaura. Easy gifting ideas for birthdays, festivals and special moments.",
  },
  "/keychains": {
    title: "Keychains | Viaura",
    description: "Shop cute and stylish keychains at Viaura. Small accessories that make great gifts and everyday carry.",
  },
  "/combo-offers": {
    title: "Combo Offers | Viaura",
    description: "Save more with Viaura combo offers: curated bundles of jewellery and accessories at a special combo price.",
  },
  "/trending": {
    title: "Trending Jewellery & Accessories | Viaura",
    description: "Discover trending jewellery, hair accessories and Instagram-loved finds at Viaura.",
  },
  "/offer-zone": {
    title: "Offer Zone | Viaura",
    description: "Shop discounted jewellery, accessories and gifts in the Viaura Offer Zone. Deals on everyday and flash-sale picks.",
  },
  "/instagram": {
    title: "Viaura on Instagram | Trending Picks",
    description: "Welcome from Instagram! Explore Viaura's trending jewellery, best sellers, offers and new arrivals.",
  },
  "/page/about": {
    title: "About Viaura",
    description: "Viaura is a curated lifestyle and gifting brand selling jewellery, hair accessories, kids' toys and gift hampers across India.",
  },
  "/page/contact": {
    title: "Contact Viaura",
    description: "Get in touch with Viaura for order help, product questions and support.",
  },
  "/page/shipping": {
    title: "Shipping Policy | Viaura",
    description: "Read Viaura's shipping policy: processing times, delivery across India, courier partners and order tracking.",
  },
  "/page/returns": {
    title: "Returns & Refunds | Viaura",
    description: "Read Viaura's returns and refunds policy, including the return window, item conditions and refund timelines.",
  },
  "/page/faq": {
    title: "Frequently Asked Questions | Viaura",
    description: "Answers to common questions about ordering, tracking, payments and delivery at Viaura.",
  },
  "/page/privacy": {
    title: "Privacy Policy | Viaura",
    description: "Learn how Viaura collects and uses information to process your orders and improve your shopping experience.",
  },
  "/page/terms": {
    title: "Terms & Conditions | Viaura",
    description: "Read the terms and conditions for shopping at Viaura, including pricing, offers and order terms.",
  },
};

// Pages that must never be indexed (private, transactional, or thin).
const NOINDEX_EXACT = ["/search", "/cart", "/checkout", "/login", "/account", "/wishlist", "/track", "/admin"];
const NOINDEX_PREFIXES = ["/admin/", "/order-success/", "/payment-return/", "/track-order/"];
const NOINDEX_TITLE = `${SITE_NAME} | Online Store`;

function normalizePath(pathname) {
  let path = String(pathname || "/").split(/[?#]/)[0] || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

function canonicalUrl(pathname) {
  const path = normalizePath(pathname);
  return path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`;
}

function isNoIndexPath(pathname) {
  const path = normalizePath(pathname);
  return NOINDEX_EXACT.includes(path) || NOINDEX_PREFIXES.some((p) => path.startsWith(p));
}

function truncate(text, max = 160) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:\-–—\s]+$/, "")}…`;
}

const isHttpUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);
const formatPrice = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function organizationJsonLd(settings) {
  const data = { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: `${ORIGIN}/`, logo: LOGO_URL };
  const sameAs = settings && isHttpUrl(settings.instagram_url) ? [settings.instagram_url] : [];
  if (sameAs.length) data.sameAs = sameAs;
  return data;
}

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${ORIGIN}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${ORIGIN}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

function baseMeta(path, { title, description, image, type = "website", jsonLd = [], noindex = false, summary = "" }) {
  return { title, description, canonical: canonicalUrl(path), image: image || DEFAULT_IMAGE, type, jsonLd, noindex, summary };
}

function pageMeta(pathname, { settings } = {}) {
  const path = normalizePath(pathname);
  if (isNoIndexPath(path)) {
    return baseMeta(path, { title: NOINDEX_TITLE, description: HOME_DESCRIPTION, noindex: true });
  }
  const page = PAGE_META[path];
  if (path === "/") {
    return baseMeta(path, { ...page, jsonLd: [organizationJsonLd(settings), websiteJsonLd()] });
  }
  if (page) return baseMeta(path, page);
  // Dynamic routes (product/combo) are refined once their data loads; use brand defaults meanwhile.
  return baseMeta(path, { title: `${SITE_NAME} | Jewellery, Accessories, Gifts & More`, description: HOME_DESCRIPTION });
}

function notFoundMeta(pathname) {
  return baseMeta(pathname, { title: `Page not found | ${SITE_NAME}`, description: HOME_DESCRIPTION, noindex: true });
}

function productMeta(product) {
  const path = `/product/${product.slug}`;
  const price = Number(product.effective_price ?? product.selling_price);
  const group = GROUP_LABELS[product.group];
  const own = String(product.description || product.details || "").trim();
  const fallback =
    `${product.name}${product.category ? ` — ${product.category}` : ""}${group ? ` from the Viaura ${group} collection` : " from Viaura"}.` +
    `${Number.isFinite(price) && price > 0 ? ` Price ₹${formatPrice(price)}.` : ""} Shop online at Viaura.`;
  const images = (product.images || []).filter(isHttpUrl);
  const outOfStock = product.stock_state ? product.stock_state === "Out of Stock" : Number(product.stock) <= 0;

  const ld = { "@context": "https://schema.org", "@type": "Product", name: product.name, url: canonicalUrl(path) };
  if (images.length) ld.image = images;
  if (own) ld.description = truncate(own, 5000);
  if (product.sku) ld.sku = String(product.sku);
  if (product.category) ld.category = product.category;
  if (Number.isFinite(price) && price > 0) {
    ld.offers = {
      "@type": "Offer",
      url: canonicalUrl(path),
      priceCurrency: "INR",
      price: price.toFixed(2),
      availability: outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: SITE_NAME },
    };
  }
  if (Number(product.review_count) > 0 && Number(product.rating) > 0) {
    ld.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(product.rating), reviewCount: Number(product.review_count) };
  }
  return baseMeta(path, {
    title: `${product.name} | Viaura`,
    description: truncate(own || fallback),
    image: images[0],
    jsonLd: [ld],
    summary: own || fallback,
  });
}

function comboMeta(combo) {
  const path = `/combo/${combo.slug}`;
  const price = Number(combo.combo_price);
  const own = String(combo.description || "").trim();
  const fallback = `${combo.name} — a Viaura combo offer${Number.isFinite(price) && price > 0 ? ` at ₹${formatPrice(price)}` : ""}. Shop online at Viaura.`;
  const images = (combo.images || []).filter(isHttpUrl);

  const ld = { "@context": "https://schema.org", "@type": "Product", name: combo.name, url: canonicalUrl(path) };
  if (images.length) ld.image = images;
  if (own) ld.description = truncate(own, 5000);
  if (Number.isFinite(price) && price > 0) {
    ld.offers = {
      "@type": "Offer",
      url: canonicalUrl(path),
      priceCurrency: "INR",
      price: price.toFixed(2),
      availability: Number(combo.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: SITE_NAME },
    };
  }
  return baseMeta(path, {
    title: `${combo.name} | Viaura Combo Offer`,
    description: truncate(own || fallback),
    image: images[0],
    jsonLd: [ld],
    summary: own || fallback,
  });
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// JSON inside <script> must not be able to close the tag.
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");

/** Descriptor list of head tags for a meta object: [tagName, attributes, textContent?]. */
function headTags(meta) {
  const tags = [
    ["meta", { name: "description", content: meta.description }],
    ["meta", { name: "robots", content: meta.noindex ? "noindex, nofollow" : "index, follow" }],
    ["link", { rel: "canonical", href: meta.canonical }],
    ["meta", { property: "og:type", content: meta.type }],
    ["meta", { property: "og:site_name", content: SITE_NAME }],
    ["meta", { property: "og:title", content: meta.title }],
    ["meta", { property: "og:description", content: meta.description }],
    ["meta", { property: "og:url", content: meta.canonical }],
    ["meta", { property: "og:image", content: meta.image }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: meta.title }],
    ["meta", { name: "twitter:description", content: meta.description }],
    ["meta", { name: "twitter:image", content: meta.image }],
  ];
  (meta.jsonLd || []).forEach((obj) => tags.push(["script", { type: "application/ld+json" }, safeJson(obj)]));
  return tags;
}

/** HTML string of the managed head tags (for build-time prerendering). */
function renderHeadHtml(meta) {
  const body = headTags(meta)
    .map(([tag, attrs, text]) => {
      const a = Object.entries(attrs).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(" ");
      return tag === "script" ? `<script data-seo="1" ${a}>${text}</script>` : `<${tag} data-seo="1" ${a} />`;
    })
    .join("\n        ");
  return `<title>${escapeHtml(meta.title)}</title>\n        ${body}`;
}

module.exports = {
  SITE_NAME, ORIGIN, LOGO_URL, PAGE_META, HOME_TITLE, HOME_DESCRIPTION,
  normalizePath, canonicalUrl, isNoIndexPath, truncate, pageMeta, notFoundMeta, productMeta, comboMeta,
  headTags, renderHeadHtml, escapeHtml,
};
