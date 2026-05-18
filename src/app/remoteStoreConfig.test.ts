import { describe, expect, it } from "vitest";
import { shouldUseFirebaseRemote } from "./remoteStoreConfig";

describe("remote store config", () => {
  it("does not enable Firebase just because environment variables exist", () => {
    expect(shouldUseFirebaseRemote(new URLSearchParams(""))).toBe(false);
    expect(shouldUseFirebaseRemote(new URLSearchParams("remote=none"))).toBe(false);
    expect(shouldUseFirebaseRemote(new URLSearchParams("remote=browser"))).toBe(false);
  });

  it("requires an explicit Firebase remote mode", () => {
    expect(shouldUseFirebaseRemote(new URLSearchParams("remote=firebase"))).toBe(true);
  });
});
