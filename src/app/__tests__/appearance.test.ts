import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, sharedText } from "../appearance";

describe("shared text", () => {
  it("reads a share of a page as one line", () => {
    expect(sharedText("?title=A%20post&url=https://x.dev/a")).toBe("A post — https://x.dev/a");
  });

  it("does not repeat a field the sender sent twice", () => {
    // Some apps send the url as `text`, some as `url`, some as both.
    expect(sharedText("?text=https://x.dev&url=https://x.dev")).toBe("https://x.dev");
  });

  it("is nothing at all on an ordinary launch", () => {
    expect(sharedText("")).toBeNull();
    expect(sharedText("?other=1")).toBeNull();
  });
});

describe("appearance defaults", () => {
  it("stays inside the range the settings sliders can reach", () => {
    expect(DEFAULT_APPEARANCE.size).toBeGreaterThanOrEqual(12);
    expect(DEFAULT_APPEARANCE.size).toBeLessThanOrEqual(24);
    expect(DEFAULT_APPEARANCE.width).toBeLessThanOrEqual(1400);
    expect(DEFAULT_APPEARANCE.lineHeight).toBeGreaterThanOrEqual(1.2);
  });
});
