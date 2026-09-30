import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../appearance";

describe("appearance defaults", () => {
  it("stays inside the range the settings sliders can reach", () => {
    expect(DEFAULT_APPEARANCE.size).toBeGreaterThanOrEqual(12);
    expect(DEFAULT_APPEARANCE.size).toBeLessThanOrEqual(24);
    expect(DEFAULT_APPEARANCE.width).toBeLessThanOrEqual(1400);
    expect(DEFAULT_APPEARANCE.lineHeight).toBeGreaterThanOrEqual(1.2);
  });
});
