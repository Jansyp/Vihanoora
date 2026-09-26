import { removePurchasedQuantities, resolveCartVariant } from "./CartContext";

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