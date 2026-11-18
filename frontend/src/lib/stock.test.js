import { inStockOnly, isInStock } from "./stock";

describe("homepage stock safety filter", () => {
  const make = (id, stock, extra = {}) => ({ id, stock, ...extra });

  it("drops zero and negative stock regardless of trending/best-seller/featured flags", () => {
    const items = [
      make("A", 3, { trending: true }),
      make("B", 0, { trending: true, best_seller: true, featured: true }),
      make("C", 2, { best_seller: true }),
      make("D", -1, { featured: true, new_arrival: true }),
      make("E", 9),
    ];
    expect(inStockOnly(items).map((p) => p.id)).toEqual(["A", "C", "E"]);
  });

  it("falls back to stock_state when stock is not present", () => {
    expect(isInStock({ stock_state: "Out of Stock" })).toBe(false);
    expect(isInStock({ stock_state: "Only 2 left" })).toBe(true);
  });

  it("does not mutate products or invent items when too few are in stock", () => {
    const items = [make("A", 0), make("B", 4)];
    const snapshot = JSON.parse(JSON.stringify(items));
    expect(inStockOnly(items)).toHaveLength(1);
    expect(items).toEqual(snapshot);
    expect(inStockOnly(undefined)).toEqual([]);
  });
});
