const { pageMeta, productMeta, comboMeta, canonicalUrl, isNoIndexPath, HOME_TITLE } = require("./seoMeta");

describe("seoMeta", () => {
  test("homepage metadata and structured data", () => {
    const meta = pageMeta("/", { settings: { instagram_url: "https://instagram.com/example" } });
    expect(meta.title).toBe(HOME_TITLE);
    expect(meta.canonical).toBe("https://www.vihaanora.com/");
    expect(meta.description.length).toBeGreaterThanOrEqual(120);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    const [org, site] = meta.jsonLd;
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("Viaura");
    expect(org.sameAs).toEqual(["https://instagram.com/example"]);
    expect(site["@type"]).toBe("WebSite");
    expect(site.url).toBe("https://www.vihaanora.com/");
  });

  test("no social profiles are invented", () => {
    expect(pageMeta("/", {}).jsonLd[0].sameAs).toBeUndefined();
  });

  test("canonical normalises trailing slashes and queries", () => {
    expect(canonicalUrl("/women/")).toBe("https://www.vihaanora.com/women");
    expect(canonicalUrl("/women?category=x")).toBe("https://www.vihaanora.com/women");
  });

  test("private pages are noindex, public pages are not", () => {
    ["/cart", "/checkout", "/login", "/account", "/admin/products", "/search"].forEach((p) => expect(isNoIndexPath(p)).toBe(true));
    ["/", "/women", "/product/x", "/combo/y"].forEach((p) => expect(isNoIndexPath(p)).toBe(false));
  });

  test("product metadata uses real data only", () => {
    const meta = productMeta({
      name: "Ring", slug: "ring", sku: "S1", description: "", category: "Rings", group: "women",
      effective_price: 750, stock_state: "Out of Stock", images: ["https://img.example/a.png"], review_count: 0, rating: 0,
    });
    expect(meta.canonical).toBe("https://www.vihaanora.com/product/ring");
    expect(meta.title).toBe("Ring | Viaura");
    const ld = meta.jsonLd[0];
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers.price).toBe("750.00");
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(ld.description).toBeUndefined();
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.brand).toBeUndefined();
  });

  test("combo metadata", () => {
    const meta = comboMeta({ name: "Duo", slug: "duo", combo_price: 499, stock: 3, images: [] });
    expect(meta.canonical).toBe("https://www.vihaanora.com/combo/duo");
    expect(meta.jsonLd[0].offers.availability).toBe("https://schema.org/InStock");
  });
});
