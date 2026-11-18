import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

jest.mock("framer-motion", () => {
  const mockReact = require("react");
  return {
    AnimatePresence: ({ children }) => children,
    motion: new Proxy({}, {
      get: (_, tag) => ({ children, initial, animate, exit, transition, ...rest }) => mockReact.createElement(tag, rest, children),
    }),
  };
});
jest.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ reduceMotion: true }) }));
jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { __esModule: true, ...actual, getCatalog: jest.fn() };
});

import { getCatalog } from "@/lib/api";
import FeaturedProductHero from "./FeaturedProductHero";

const product = {
  id: "p1", name: "Rose Bracelet", group: "women", slug: "rose", images: ["https://x.test/p.png"],
  effective_price: 400, mrp: 500, featured: true,
};

function mockData(banners) {
  getCatalog.mockImplementation((path) => {
    if (path === "/banners") return Promise.resolve({ data: banners });
    if (path.startsWith("/products")) return Promise.resolve({ data: { items: [product] } });
    if (path.startsWith("/offer-zone")) return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: [] });
  });
}

describe("FeaturedProductHero", () => {
  let container;
  let root;

  const render = async () => {
    await act(async () => {
      root.render(<FeaturedProductHero />);
    });
    await act(async () => {});
  };

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const banners = [
    { id: "b1", title: "Festive Sale", subtitle: "Up to 50% off", image: "https://x.test/b1.png", cta_text: "Shop", cta_link: "/offer-zone" },
    { id: "b2", title: "Second", subtitle: "Two", image: "https://x.test/b2.png", cta_link: "/trending" },
  ];

  it("renders the admin banner image as the whole hero without product or text content", async () => {
    mockData(banners);
    await render();
    const hero = container.querySelector('[data-testid="hero-banner"]');
    expect(hero).not.toBeNull();
    const img = hero.querySelector("img");
    expect(img.getAttribute("src")).toContain("b1.png");
    expect(img.className).toContain("object-cover");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).not.toContain("Festive Sale");
    expect(container.textContent).not.toContain("Up to 50% off");
    expect(container.textContent).not.toContain("Rose Bracelet");
    expect(container.textContent).not.toContain("Explore collection");
    expect(container.querySelector('img[src*="p.png"]')).toBeNull();
    expect(container.querySelector('[data-testid="hero-banner-link"]').getAttribute("href")).toBe("/offer-zone");
    // no fixed widths that could cause horizontal overflow
    expect(hero.className).toContain("overflow-hidden");
    expect(img.className).not.toMatch(/\bw-\[\d+px\]/);
  });

  it("uses the bundled public image for the banner URL stored from localhost", async () => {
    mockData([{
      id: "year-end",
      title: "Year End Offer",
      image: "http://localhost:8000/api/files/Viaura/products/125f4937e0724744a0c458e7802a7de6.png",
      cta_link: "/offer-zone",
    }]);
    await render();
    expect(container.querySelector('[data-testid="hero-banner"] img').getAttribute("src"))
      .toBe("/images/year-end-offer.png");
  });

  it("rotates banners in order", async () => {
    mockData(banners);
    await render();
    expect(container.querySelector("img").getAttribute("src")).toContain("b1.png");
    await act(async () => { jest.advanceTimersByTime(5500); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(container.querySelector("img").getAttribute("src")).toContain("b2.png");
  });

  it("falls back to the normal hero when the banner has no image", async () => {
    mockData([{ id: "b3", title: "Text Only", subtitle: "Sub", image: "", cta_text: "Go", cta_link: "/x" }]);
    await render();
    expect(container.querySelector('[data-testid="hero-banner"]')).toBeNull();
    expect(container.querySelector("h1").textContent).toContain("Text Only");
    expect(container.textContent).toContain("Rose Bracelet");
    expect(container.textContent).toContain("Explore collection");
  });

  it("falls back to the default hero with no banners", async () => {
    mockData([]);
    await render();
    expect(container.querySelector("h1").textContent).toContain("Trending Finds.");
  });
});
