import { assetUrl } from "./api";

describe("assetUrl", () => {
  test("keeps root-relative public image assets on the Vercel site", () => {
    expect(assetUrl("/images/year-end-offer.png")).toBe("/images/year-end-offer.png");
  });

  test("keeps local uploaded images on the local backend", () => {
    expect(assetUrl("http://localhost:8000/api/files/Viaura/products/banner.png"))
      .toBe(`${process.env.REACT_APP_BACKEND_URL}/api/files/Viaura/products/banner.png`);
  });

  test("rewrites deployed product images to Cloudinary", () => {
    expect(assetUrl("https://api.vihaanora.com/api/files/Viaura/products/banner.png"))
      .toBe("https://res.cloudinary.com/dffywdpf/image/upload/f_auto,q_auto/Viaura/products/banner");
  });
});
