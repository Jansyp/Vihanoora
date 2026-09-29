import {
  ecommerceItems,
  trackEcommerce,
  trackEvent,
  trackPageView,
  trackPurchaseOnce,
  trackWhatsAppOrderClick,
} from "./analytics";

describe("VIAURA GA4 ecommerce analytics", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let gtag;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    localStorage.clear();
    gtag = jest.fn();
    window.gtag = gtag;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete window.gtag;
    window.history.replaceState({}, "", "/");
  });

  test("product funnel events use INR and normalized item data without forwarding extra product fields", () => {
    const product = {
      id: "product-42",
      name: "Rose Quartz Bracelet",
      group: "women",
      category: "Bracelets",
      effective_price: "499",
      qty: "2",
      customer_email: "private@example.com",
      customer_phone: "9876543210",
    };

    trackEcommerce("view_item", [product], { value: 499 });
    trackEcommerce("add_to_cart", [product]);
    trackEcommerce("view_cart", [{ ...product, product_id: product.id, price: 499 }]);

    expect(gtag.mock.calls.map((call) => call[1])).toEqual(["view_item", "add_to_cart", "view_cart"]);
    for (const [, , payload] of gtag.mock.calls) {
      expect(payload.currency).toBe("INR");
      expect(payload.items[0]).toMatchObject({
        item_id: "product-42",
        item_name: "Rose Quartz Bracelet",
        item_category: "Bracelets",
        price: 499,
        quantity: 2,
      });
      expect(JSON.stringify(payload)).not.toMatch(/private@example\.com|9876543210|customer_email|customer_phone/);
    }
    expect(typeof gtag.mock.calls[0][2].value).toBe("number");
    expect(ecommerceItems([{ id: "p", name: "P", effective_price: "12.5", qty: "3" }])[0]).toMatchObject({ price: 12.5, quantity: 3 });
  });

  test("WhatsApp order intent sends cart value and items, never purchase or WhatsApp message content", () => {
    const orderMessage = "Hi Viaura, my name is Private Person; call me at 9876543210";
    trackWhatsAppOrderClick([{
      product_id: "sku-9",
      name: "Gift Set",
      category: "Gifts",
      price: 750,
      qty: 2,
      message: orderMessage,
      customer_name: "Private Person",
      customer_phone: "9876543210",
    }], "cart", 1500);

    expect(gtag).toHaveBeenCalledTimes(1);
    const [, eventName, payload] = gtag.mock.calls[0];
    expect(eventName).toBe("whatsapp_order_click");
    expect(payload).toMatchObject({ currency: "INR", value: 1500, placement: "cart" });
    expect(payload.items[0]).toEqual({ item_id: "sku-9", item_name: "Gift Set", item_category: "Gifts", price: 750, quantity: 2 });
    expect(JSON.stringify(payload)).not.toMatch(/Private Person|9876543210|Hi Viaura|message|customer_name|customer_phone/);
    expect(gtag.mock.calls.some((call) => call[1] === "purchase")).toBe(false);
  });

  test("missing ecommerce fields are omitted instead of fabricated", () => {
    expect(ecommerceItems([{ id: "product-without-price", name: "Unpriced Item" }])).toEqual([
      { item_id: "product-without-price", item_name: "Unpriced Item" },
    ]);
    trackWhatsAppOrderClick([{ id: "product-without-price", name: "Unpriced Item" }], "cart");
    expect(gtag.mock.calls[0][2]).not.toHaveProperty("value");
    expect(gtag.mock.calls[0][2].items[0]).not.toHaveProperty("price");
    expect(gtag.mock.calls[0][2].items[0]).not.toHaveProperty("quantity");
  });

  test("purchase requires a paid order and is deduplicated by order ID", () => {
    const order = {
      id: "order-verified-17",
      payment_status: "PENDING",
      grand_total: "1500",
      customer: { name: "Private Person", email: "private@example.com", phone: "9876543210" },
      items: [{ product_id: "sku-9", name: "Gift Set", unit_price: "750", qty: "2" }],
    };

    trackPurchaseOnce(order);
    expect(gtag).not.toHaveBeenCalled();

    trackPurchaseOnce({ ...order, payment_status: "PAID" });
    trackPurchaseOnce({ ...order, payment_status: "PAID" });

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag.mock.calls[0][1]).toBe("purchase");
    expect(gtag.mock.calls[0][2]).toMatchObject({ transaction_id: "order-verified-17", value: 1500, currency: "INR" });
    expect(JSON.stringify(gtag.mock.calls[0][2])).not.toMatch(/Private Person|private@example\.com|9876543210/);
  });

  test("generic events are safe no-ops outside production or when gtag is unavailable", () => {
    process.env.NODE_ENV = "test";
    expect(trackEvent("whatsapp_click")).toBe(false);
    process.env.NODE_ENV = "production";
    delete window.gtag;
    expect(trackEvent("whatsapp_click")).toBe(false);
  });

  test("page views preserve UTM attribution and omit unrelated query values", () => {
    trackPageView("/", "?utm_source=instagram&utm_medium=social&utm_campaign=new_arrivals&email=private%40example.com");

    expect(gtag).toHaveBeenCalledWith("event", "page_view", expect.objectContaining({
      page_path: "/?utm_source=instagram&utm_medium=social&utm_campaign=new_arrivals",
    }));
    expect(JSON.stringify(gtag.mock.calls[0][2])).not.toContain("private@example.com");
  });
});
