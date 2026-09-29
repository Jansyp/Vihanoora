import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/analytics", () => ({
  trackEcommerce: jest.fn(),
  trackEvent: jest.fn(),
  trackWhatsAppOrderClick: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  assetUrl: (url) => url,
  formatINR: (value) => `₹${value}`,
  formatApiError: (error) => error || "Error",
}));
jest.mock("@/context/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ paymentsEnabled: false }) }));
jest.mock("@/components/common", () => ({
  Section: ({ children }) => <section>{children}</section>,
  ProductRow: () => null,
  SectionHeader: () => null,
  GridSkeleton: () => <div>Loading</div>,
}));
jest.mock("@/components/ProductImage", () => () => <img alt="product" />);
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ slug: "bracelet" }),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: "/cart", search: "" }),
}), { virtual: true });

import api from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { trackEcommerce, trackWhatsAppOrderClick } from "@/lib/analytics";
import ProductPage from "./ProductPage";
import CartPage from "./CartPage";

describe("storefront ecommerce event wiring", () => {
  let container;
  let root;
  const items = [{ key: "sku-1", product_id: "sku-1", name: "Bracelet", category: "Bracelets", price: 25, qty: 2, slug: "bracelet", combo: false }];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
    useCart.mockReturnValue({
      items, subtotal: 50, count: 2, couponCode: "", setCouponCode: jest.fn(), updateQty: jest.fn(),
      removeItem: jest.fn(), toggleWishlist: jest.fn(), removePurchasedItems: jest.fn(), addToCart: jest.fn(),
      inWishlist: jest.fn(() => false),
    });
    api.post.mockResolvedValue({ data: { subtotal: 50, grand_total: 50, delivery_charge: 0 } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("product detail sends one view_item across rerenders", async () => {
    api.get.mockResolvedValue({ data: { product: {
      id: "product-1", slug: "bracelet", name: "Bracelet", group: "women", category: "Bracelets",
      effective_price: 25, mrp: 30, images: [], color_images: {}, colors: [], stock_state: "In Stock",
    }, reviews: [] } });
    const page = <ProductPage />;

    await act(async () => { root.render(page); await Promise.resolve(); });
    await act(async () => root.render(page));

    expect(trackEcommerce.mock.calls.filter(([name]) => name === "view_item")).toHaveLength(1);
    expect(trackEcommerce.mock.calls.find(([name]) => name === "view_item")[1][0]).toMatchObject({ product_id: "product-1", price: 25, qty: 1 });
  });

  test("cart sends view_cart once and WhatsApp order click sends intent without purchase", async () => {
    const page = <CartPage />;
    await act(async () => { root.render(page); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => root.render(page));

    expect(trackEcommerce.mock.calls.filter(([name]) => name === "view_cart")).toHaveLength(1);
    expect(trackEcommerce.mock.calls.find(([name]) => name === "view_cart")[2]).toEqual({ value: 50 });
    await act(async () => container.querySelector('[data-testid="checkout-btn"]').click());

    expect(trackWhatsAppOrderClick).toHaveBeenCalledTimes(1);
    expect(trackWhatsAppOrderClick).toHaveBeenCalledWith(items, "cart", 50);
    expect(trackEcommerce.mock.calls.some(([name]) => name === "purchase")).toBe(false);
  });
});
