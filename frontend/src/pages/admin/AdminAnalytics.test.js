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
  availability: { website_events: false, orders: true, traffic_sources: false, devices: false, ga4: false },
  ga4: { available: false, property_id: "556716338", unavailable_reason: "credentials_unavailable", overview: null },
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

  test("renders aggregated GA4 Data API metrics separately from paid-order reporting", async () => {
    api.get.mockResolvedValue({ data: {
      ...noDataResponse,
      availability: { ...noDataResponse.availability, ga4: true },
      ga4: {
        available: true,
        property_id: "556716338",
        overview: { users: 81, sessions: 96, page_views: 243, product_views: 32, add_to_cart: 9, whatsapp_order_clicks: 3, purchases: 4, purchase_revenue: 3799.5 },
      },
    } });
    await act(async () => { root.render(<AdminAnalytics />); await Promise.resolve(); });

    expect(container.textContent).toContain("Connected · live Data API report");
    expect(container.textContent).toContain("81");
    expect(container.textContent).toContain("96");
    expect(container.textContent).toContain("GA4 Purchase Revenue");
    expect(container.textContent).toContain("VIAURA paid-order records remain the source for completed order and revenue figures above.");
  });
});
