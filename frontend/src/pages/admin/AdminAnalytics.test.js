import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  formatINR: (value) => `₹${value}`,
}));
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import api from "@/lib/api";
import AdminAnalytics from "./AdminAnalytics";

const noDataResponse = {
  range: { start_date: "2026-09-23", end_date: "2026-09-29", timezone: "Asia/Kolkata" },
  availability: { website_events: false, orders: true, traffic_sources: false, devices: false },
  overview: { visitors: null, product_views: null, add_to_cart: null, whatsapp_order_clicks: null, orders: 0, revenue: 0 },
  funnel: {
    visitors: { count: null }, product_views: { count: null }, add_to_cart: { count: null },
    whatsapp_order_clicks: { count: null }, completed_orders: { count: 0 },
  },
  traffic_sources: [], devices: [], top_products: [], daily_activity: [],
};

describe("AdminAnalytics", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("loads an honest empty state and sends the selected date range", async () => {
    api.get.mockResolvedValue({ data: noDataResponse });
    await act(async () => { root.render(<AdminAnalytics />); await Promise.resolve(); });

    expect(api.get).toHaveBeenCalledTimes(1);
    const firstParams = api.get.mock.calls[0][1].params;
    expect(firstParams.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(firstParams.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(container.textContent).toContain("No data");
    expect(container.textContent).toContain("First-party analytics collection starts after this feature is deployed");

    await act(async () => container.querySelector('button[aria-pressed="false"]').click());
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test("shows a safe API error and retries the consolidated request", async () => {
    api.get.mockRejectedValueOnce(new Error("Private backend failure details"));
    await act(async () => { root.render(<AdminAnalytics />); await Promise.resolve(); });
    expect(container.textContent).toContain("Analytics data isn't available right now.");
    expect(container.textContent).not.toContain("Private backend failure details");

    api.get.mockResolvedValueOnce({ data: noDataResponse });
    await act(async () => container.querySelector('[role="alert"] button').click());
    await act(async () => Promise.resolve());
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("No data");
  });
});
