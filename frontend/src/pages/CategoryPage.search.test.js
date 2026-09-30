import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getCatalog: jest.fn(),
}));
jest.mock("@/lib/analytics", () => ({ trackEcommerce: jest.fn(), trackEvent: jest.fn() }));
jest.mock("@/components/common", () => ({
  Section: ({ children }) => <section>{children}</section>,
  ProductGrid: ({ products }) => <div>{products.map((product) => <p key={product.id}>{product.name}</p>)}</div>,
  GridSkeleton: () => <div>Loading products</div>,
  Pagination: () => null,
  PRODUCT_PAGE_SIZE: 24,
}));
jest.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: globalThis.window.location.pathname, search: globalThis.window.location.search }),
  useNavigationType: () => "POP",
  useParams: () => ({}),
  useSearchParams: () => {
    const React = jest.requireActual("react");
    const [, rerender] = React.useState(0);
    React.useEffect(() => {
      const onPopState = () => rerender((value) => value + 1);
      globalThis.window.addEventListener("popstate", onPopState);
      return () => globalThis.window.removeEventListener("popstate", onPopState);
    }, []);
    return [new URLSearchParams(globalThis.window.location.search), (next, options = {}) => {
      const query = next.toString();
      const url = `${globalThis.window.location.pathname}${query ? `?${query}` : ""}`;
      globalThis.window.history[options.replace ? "replaceState" : "pushState"]({}, "", url);
      rerender((value) => value + 1);
    }];
  },
}), { virtual: true });

import { getCatalog } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import CategoryPage from "./CategoryPage";

function LocationOutput() {
  return <output data-testid="location">{globalThis.window.location.pathname}{globalThis.window.location.search}</output>;
}

describe("catalog search route", () => {
  let container;
  let root;
  const renderAt = async (entry = "/search") => {
    globalThis.window.history.replaceState({}, "", entry);
    await act(async () => root.render(<><CategoryPage type="search" /><LocationOutput /></>));
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
    getCatalog.mockResolvedValue({ data: { items: [{ id: "ring-1", name: "Gold Ring" }], total: 1 } });
    sessionStorage.clear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("empty route focuses search, shows guidance, and makes no catalogue or GA search request", async () => {
    await renderAt();
    expect(document.activeElement).toBe(container.querySelector('[data-testid="catalog-search-input"]'));
    expect(container.textContent).toContain("What are you looking for?");
    expect(container.textContent).not.toContain('Search: ""');
    expect(getCatalog).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalledWith("search");
  });

  test("an encoded meaningful query performs a search, renders results, and tracks the search", async () => {
    await renderAt("/search?q=ring%20%26%20rose");
    await act(async () => Promise.resolve());

    expect(container.querySelector('[data-testid="location"]').textContent).toContain("q=ring%20%26%20rose");
    expect(getCatalog).toHaveBeenCalledWith(expect.stringContaining("q=ring+%26+rose"));
    expect(container.textContent).toContain("Gold Ring");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("search");
  });

  test("clear returns to the empty state and browser back restores the previous route", async () => {
    await renderAt("/women");
    await act(async () => {
      globalThis.window.history.pushState({}, "", "/search?q=ring");
      globalThis.window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("Gold Ring");
    await act(async () => container.querySelector('[aria-label="Clear search"]').click());
    expect(container.textContent).toContain("What are you looking for?");
    expect(getCatalog).toHaveBeenCalledTimes(1);
    await act(async () => {
      const popped = new Promise((resolve) => globalThis.window.addEventListener("popstate", resolve, { once: true }));
      globalThis.window.history.back();
      await popped;
    });
    expect(container.querySelector('[data-testid="location"]').textContent).toBe("/women");
  });

  test("an existing desktop style search URL still loads its product results", async () => {
    await renderAt("/search?q=ring");
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("Gold Ring");
    expect(getCatalog).toHaveBeenCalledWith(expect.stringContaining("q=ring"));
  });
});
