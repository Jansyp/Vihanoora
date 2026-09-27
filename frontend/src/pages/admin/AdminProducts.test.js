import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    __esModule: true,
    ...actual,
    default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  };
});

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import api, { assetUrl } from "@/lib/api";
import AdminProducts from "./AdminProducts";

describe("AdminProducts image editing", () => {
  let container;
  let root;
  const images = [
    "https://api.vihaanora.com/api/files/Viaura/products/first.png",
    "https://api.vihaanora.com/api/files/Viaura/products/second.png",
    "https://api.vihaanora.com/api/files/Viaura/products/third.jpg",
  ];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockImplementation((path) => Promise.resolve({
      data: path === "/admin/products"
        ? { items: [{
          id: "product-1", name: "Image Test Product", group: "women", category: "Bracelets",
          category_id: "bracelets", sku: "TEST-1", mrp: 590, selling_price: 472,
          effective_price: 472, buying_price: 180, stock: 5, low_stock_threshold: 5,
          discount_percent: 20, images, colors: [], color_images: {}, active: true,
        }], total: 1 }
        : [{ group: "women", subcategories: [{ id: "bracelets", slug: "bracelets", name: "Bracelets", active: true }] }],
    }));
    api.put.mockResolvedValue({ data: {} });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  test("renders existing fallback images and preserves their URLs when saving", async () => {
    await act(async () => {
      root.render(<AdminProducts />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => container.querySelector('[data-testid="edit-product-product-1"]').click());

    const previews = Array.from(container.querySelectorAll('[data-testid^="remove-image-"]'));
    expect(previews).toHaveLength(3);
    const previewImages = previews.map((button) => button.parentElement.querySelector("img").getAttribute("src"));
    expect(previewImages).toEqual(images.map(assetUrl));

    await act(async () => {
      container.querySelector('[data-testid="save-product-btn"]').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1].images).toEqual(images);
  });

  test("removing one fallback image saves the remaining URLs in order", async () => {
    await act(async () => {
      root.render(<AdminProducts />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => container.querySelector('[data-testid="edit-product-product-1"]').click());
    await act(async () => container.querySelector('[data-testid="remove-image-1"]').click());
    expect(container.querySelectorAll('[data-testid^="remove-image-"]')).toHaveLength(2);

    await act(async () => {
      container.querySelector('[data-testid="save-product-btn"]').click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.put.mock.calls[0][1].images).toEqual([images[0], images[2]]);
  });
});