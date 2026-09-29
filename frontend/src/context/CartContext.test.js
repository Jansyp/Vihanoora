import { removePurchasedQuantities, resolveCartVariant } from "./CartContext";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/analytics", () => ({ trackEcommerce: jest.fn() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { CartProvider, useCartActions } from "./CartContext";
import { trackEcommerce } from "@/lib/analytics";

function AddToCartHarness({ product }) {
  const { addToCart } = useCartActions();
  return <button onClick={() => addToCart(product, 2)}>Add</button>;
}

describe("resolveCartVariant", () => {
  test("uses the first available colour by default", () => {
    expect(resolveCartVariant({ colors: ["Pink", "Blue", "Green"] })).toBe("Pink");
  });

  test("preserves an explicitly selected colour", () => {
    expect(resolveCartVariant({ colors: ["Pink", "Blue"] }, "Blue")).toBe("Blue");
  });

  test("uses the sole colour and leaves colourless products unset", () => {
    expect(resolveCartVariant({ colors: ["Black"] })).toBe("Black");
    expect(resolveCartVariant({ colors: [] })).toBeNull();
    expect(resolveCartVariant({})).toBeNull();
  });
});

describe("removePurchasedQuantities", () => {
  test("removes purchased items while preserving unrelated cart items", () => {
    const items = [
      { product_id: "bracelet", combo: false, variant: "pink", qty: 1 },
      { product_id: "necklace", combo: false, variant: null, qty: 2 },
    ];
    expect(removePurchasedQuantities(items, [items[0]])).toEqual([items[1]]);
  });

  test("leaves the unpurchased quantity when only part of an item was bought", () => {
    const items = [{ product_id: "bracelet", combo: false, variant: null, qty: 3 }];
    expect(removePurchasedQuantities(items, [{ ...items[0], qty: 2 }])).toEqual([
      { product_id: "bracelet", combo: false, variant: null, qty: 1 },
    ]);
  });

  test("distinguishes product variants and combos", () => {
    const items = [
      { product_id: "stone", combo: false, variant: "red", qty: 1 },
      { product_id: "stone", combo: false, variant: "blue", qty: 1 },
      { product_id: "stone", combo: true, variant: null, qty: 1 },
    ];
    expect(removePurchasedQuantities(items, [items[1]])).toEqual([items[0], items[2]]);
  });
});

describe("CartProvider analytics", () => {
  let container;
  let root;
  const product = { id: "stable-product-id", name: "Bracelet", group: "women", effective_price: 250, images: [] };

  beforeEach(() => {
    localStorage.clear();
    trackEcommerce.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("add_to_cart fires once for a successful cart action despite rerenders", async () => {
    const app = <CartProvider><AddToCartHarness product={product} /></CartProvider>;
    await act(async () => root.render(app));
    await act(async () => root.render(app));
    expect(trackEcommerce).not.toHaveBeenCalled();

    await act(async () => container.querySelector("button").click());
    expect(trackEcommerce).toHaveBeenCalledTimes(1);
    expect(trackEcommerce).toHaveBeenCalledWith("add_to_cart", [expect.objectContaining({
      product_id: "stable-product-id", name: "Bracelet", group: "women", price: 250, qty: 2,
    })], { value: 500 });
  });
});
