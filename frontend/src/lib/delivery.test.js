import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { getFreeDeliveryMessage } from "./delivery";
import FreeDeliveryMessage from "@/components/FreeDeliveryMessage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("free delivery threshold messaging", () => {
  test.each([
    [0, "Shop \u20b9300 more to avail FREE delivery \u{1F381}"],
    [100, "Shop \u20b9200 more to avail FREE delivery \u{1F381}"],
    [150, "Shop \u20b9150 more to avail FREE delivery \u{1F381}"],
    [180, "Shop \u20b9120 more to avail FREE delivery \u{1F381}"],
    [299, "Shop \u20b91 more to avail FREE delivery \u{1F381}"],
    [299.2, "Shop \u20b91 more to avail FREE delivery \u{1F381}"],
    [300, "\u{1F389} You've unlocked FREE delivery!"],
    [999, "\u{1F389} You've unlocked FREE delivery!"],
  ])("shows the correct delivery message for subtotal %s", (subtotal, expected) => {
    expect(getFreeDeliveryMessage(subtotal)).toBe(expected);
  });

  test("renders the message as a status in the cart and checkout UI", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<FreeDeliveryMessage subtotal={180} />));
    expect(container.querySelector('[role="status"]').textContent).toBe("Shop \u20b9120 more to avail FREE delivery \u{1F381}");
    await act(async () => root.unmount());
  });
});
