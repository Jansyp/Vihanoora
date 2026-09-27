import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { __esModule: true, ...actual, default: { post: jest.fn() } };
});

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import api, { assetUrl } from "@/lib/api";
import ImageUploader from "./ImageUploader";

describe("ImageUploader", () => {
  let container;
  let root;
  let onChange;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onChange = jest.fn();
    api.post.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("normalizes every existing product preview without changing the stored URLs", async () => {
    const images = [
      "https://api.vihaanora.com/api/files/Viaura/products/first.png",
      "https://api.vihaanora.com/api/files/Viaura/products/second.png",
      "https://api.vihaanora.com/api/files/Viaura/products/third.jpg",
    ];
    await act(async () => root.render(createElement(ImageUploader, { images, onChange })));

    const previews = Array.from(container.querySelectorAll("img"));
    expect(previews).toHaveLength(3);
    expect(previews.map((image) => image.getAttribute("src"))).toEqual(images.map(assetUrl));
    expect(images[0]).toContain("/api/files/");
  });

  test("removes the selected preview while preserving the remaining URLs", async () => {
    const images = ["first.png", "second.png", "third.png"];
    await act(async () => root.render(createElement(ImageUploader, { images, onChange })));

    await act(async () => container.querySelector('[data-testid="remove-image-1"]').click());

    expect(onChange).toHaveBeenCalledWith(["first.png", "third.png"]);
  });

  test("appends newly uploaded image URLs without changing existing image data", async () => {
    const images = ["https://api.vihaanora.com/api/files/Viaura/products/existing.png"];
    api.post.mockResolvedValue({ data: { url: "/api/files/viaura/products/uploaded.png" } });
    await act(async () => root.render(createElement(ImageUploader, { images, onChange })));

    const input = container.querySelector('[data-testid="image-file-input"]');
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["image"], "uploaded.png", { type: "image/png" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.post).toHaveBeenCalledWith("/admin/upload", expect.any(FormData), expect.any(Object));
    expect(onChange).toHaveBeenCalledTimes(1);
    const savedImages = onChange.mock.calls[0][0];
    expect(savedImages[0]).toBe(images[0]);
    expect(savedImages[1]).toMatch(/\/api\/files\/viaura\/products\/uploaded\.png$/);
  });
});