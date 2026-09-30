import { describe, expect, it } from "vitest";
import { sharedText } from "../share";

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
