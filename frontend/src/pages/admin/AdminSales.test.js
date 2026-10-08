import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
import { toast } from "sonner";
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  assetUrl: (value) => value,
  formatApiError: (value) => String(value || "Error"),
  formatINR: (value) => `₹${Number(value || 0)}`,
}));

import api from "@/lib/api";
import AdminSales from "./AdminSales";

function enterValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AdminSales", () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockReset();
    api.get.mockImplementation((url) => Promise.resolve({
      data: url === "/admin/sales/report"
        ? { overall: {}, sources: {}, products: [], source_products: [] }
        : url === "/admin/products"
          ? { items: [
            { id: "p1", active: true, name: "Korean Hair Clips", sku: "SKU-1", group: "women", category: "Hair Accessories", selling_price: 40, buying_price: 16, images: ["/clips.png"] },
            { id: "p2", active: true, name: "Bracelet", sku: "SKU-2", group: "women", category: "Jewellery", selling_price: 150, buying_price: 60, images: ["/bracelet.png"] },
          ], total: 2 }
          : [],
    }));
    toast.error.mockClear();
    api.post.mockReset();
    api.post.mockResolvedValue({ data: {} });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  test("shows sales reporting and warns that Website records do not adjust stock", async () => {
    await act(async () => { root.render(<AdminSales />); await Promise.resolve(); });
    expect(container.textContent).toContain("Sales Records");
    expect(container.textContent).toContain("Overall Sales Report");
    expect(container.textContent).toContain("Source-wise Report");
    const addButton = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Add Sale"));
    await act(async () => { addButton.click(); await Promise.resolve(); });
    expect(container.textContent).toContain("Select an existing catalogue product");
    const source = container.querySelector('select[required]');
    await act(async () => { source.value = "Website"; source.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("will not adjust inventory");
  });

  test("creates one sale with multiple selected products and catalogue-locked buying costs", async () => {
    await act(async () => { root.render(<AdminSales />); await Promise.resolve(); });
    const addButton = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Add Sale"));
    await act(async () => { addButton.click(); await Promise.resolve(); });

    const productInputs = () => [...container.querySelectorAll('input[placeholder*="Search by product"]')];
    await act(async () => {
      enterValue(productInputs()[0], "Korean Hair");
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    const firstProduct = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Korean Hair Clips"));
    await act(async () => { firstProduct.click(); await Promise.resolve(); });
    expect(container.querySelector('[aria-label="Buying Price / Unit product 1"]').readOnly).toBe(true);
    const sellingLabel = [...container.querySelectorAll("label")].find((label) => label.textContent.includes("Selling Price / Unit"));
    expect(sellingLabel.querySelector("input").readOnly).toBe(false);

    const addAnother = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Add Another Product"));
    await act(async () => { addAnother.click(); await Promise.resolve(); });
    await act(async () => {
      enterValue(productInputs()[1], "Bracelet");
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    const secondProduct = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Bracelet"));
    await act(async () => { secondProduct.click(); await Promise.resolve(); });
    expect(container.querySelector('[aria-label="Buying Price / Unit product 2"]').readOnly).toBe(true);
    const packingLabel = [...container.querySelectorAll("label")].find((label) => label.textContent.includes("Packing Charge"));
    expect(packingLabel.querySelector("input").value).toBe("10");
    expect(packingLabel.querySelector("input").readOnly).toBe(false);
    expect(container.textContent).toContain("Buying Price / Unit");
    expect(container.textContent).toContain("₹190");
    expect(container.textContent).toContain("₹76");

    const form = container.querySelector("form");
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    const [, payload] = api.post.mock.calls[0];
    expect(payload.products).toEqual([
      expect.objectContaining({ product_id: "p1", quantity: 1, selling_price_per_unit: 40 }),
      expect.objectContaining({ product_id: "p2", quantity: 1, selling_price_per_unit: 150 }),
    ]);
    expect(payload.products.every((line) => !("buying_price_per_unit" in line))).toBe(true);
    expect(payload.packing_charge).toBe(10);
  });

  test("rejects adding the same product more than once", async () => {
    await act(async () => { root.render(<AdminSales />); await Promise.resolve(); });
    const addButton = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Add Sale"));
    await act(async () => { addButton.click(); await Promise.resolve(); });
    const productInputs = () => [...container.querySelectorAll('input[placeholder*="Search by product"]')];
    await act(async () => {
      enterValue(productInputs()[0], "Bracelet");
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    const choose = () => [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Bracelet"));
    await act(async () => { choose().click(); await Promise.resolve(); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Add Another Product")).click(); await Promise.resolve(); });
    await act(async () => {
      enterValue(productInputs()[1], "Bracelet");
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    await act(async () => { choose().click(); await Promise.resolve(); });
    expect(toast.error).toHaveBeenCalledWith("This product is already added to this sale.");
  });
});
