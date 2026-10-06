import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  assetUrl: (value) => value,
  formatApiError: (value) => String(value || "Error"),
  formatINR: (value) => `₹${Number(value || 0)}`,
}));

import api from "@/lib/api";
import AdminSales from "./AdminSales";

describe("AdminSales", () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockReset();
    api.get.mockImplementation((url) => Promise.resolve({ data: url === "/admin/sales/report" ? { overall: {}, sources: {}, products: [], source_products: [] } : [] }));
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
});
