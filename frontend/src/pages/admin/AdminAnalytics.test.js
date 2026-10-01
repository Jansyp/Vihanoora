import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  formatINR: (value) => `?${value}`,
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
  range: { start_date: "2026-09-25", end_date: "2026-10-01", timezone: "Asia/Kolkata" },
  availability: { website_events: false, orders: true, traffic_sources: false, devices: false, ga4: false },
  ga4: { available: false, property_id: "556716338", error_category: "credentials_unavailable", unavailable_reason: "credentials_unavailable", overview: null },
  overview: { visitors: 610, product_views: 12, add_to_cart: 9, whatsapp_order_clicks: 0, orders: 4, revenue: 2440 },
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
    jest.useRealTimers();
  });

  test("uses the last seven complete days and identifies unavailable GA4 credentials", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-02T04:30:00.000Z"));
    api.get.mockResolvedValue({ data: noDataResponse });
    await act(async () => { root.render(<AdminAnalytics />); await Promise.resolve(); });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][1].params).toEqual({ start_date: "2026-09-25", end_date: "2026-10-01" });
    expect(container.textContent).toContain("GA4 Data API unavailable");
    expect(container.textContent).toContain("Error category: credentials_unavailable");
    expect(container.textContent).toContain("Source: VIAURA paid-order records");
    expect(container.textContent).toContain("610");
    expect(container.textContent).toContain("2440");
    expect(container.textContent).toContain("WhatsApp Order Clicks");

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

  test("renders real GA4 fields separately from first-party paid-order reporting", async () => {
    api.get.mockResolvedValue({ data: {
      ...noDataResponse,
      availability: { ...noDataResponse.availability, ga4: true },
      overview: { visitors: 610, product_views: 12, add_to_cart: 9, whatsapp_order_clicks: 0, orders: 4, revenue: 2440 },
      ga4: {
        available: true,
        property_id: "556716338",
        timezone: "Asia/Kolkata",
        overview: { active_users: 411, sessions: 463, page_views: 713, event_count: 3800, product_views: 32, add_to_cart: 9, whatsapp_order_clicks: 3, purchases: 4, purchase_revenue: 3799.5 },
        traffic_sources: [{ source: "google", medium: "organic", sessions: 20 }],
        devices: [{ device: "mobile", sessions: 30 }],
        top_products: [{ product_id: "sku-1", product_name: "Pearl Bracelet", views: 9, add_to_cart: 2 }],
      },
    } });
    await act(async () => { root.render(<AdminAnalytics />); await Promise.resolve(); });

    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("Active Users");
    expect(container.textContent).toContain("411");
    expect(container.textContent).toContain("610");
    expect(container.textContent).toContain("Event Count");
    expect(container.textContent).toContain("Source: Google Analytics 4");
    expect(container.textContent).toContain("GA4 Traffic Sources");
    expect(container.textContent).toContain("GA4 Devices");
    expect(container.textContent).toContain("GA4 Products");
    expect(container.textContent).toContain("GA4 Purchase Revenue");
    expect(container.textContent).toContain("Completed Orders and Revenue come only from VIAURA paid-order records.");
    expect(container.textContent).toContain("VIAURA Visitors (sessions)");
  });
});
