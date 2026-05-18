import { describe, expect, it } from "vitest";
import { BrowserRemoteStoreV2 } from "../sync/browserRemoteStoreV2";
import { createConfiguredRemoteStore, shouldUseFirebaseRemote } from "./remoteStoreConfig";

describe("remote store config", () => {
  it("does not enable Firebase just because environment variables exist", () => {
    expect(shouldUseFirebaseRemote(new URLSearchParams(""))).toBe(false);
    expect(shouldUseFirebaseRemote(new URLSearchParams("remote=none"))).toBe(false);
    expect(shouldUseFirebaseRemote(new URLSearchParams("remote=browser"))).toBe(false);
  });

  it("requires an explicit Firebase remote mode", () => {
    expect(shouldUseFirebaseRemote(new URLSearchParams("remote=firebase"))).toBe(true);
  });

  it("creates the v2 browser remote store for browser remote mode", () => {
    window.history.pushState({}, "", "/?remote=browser&workspace=test-v2");

    expect(createConfiguredRemoteStore()).toBeInstanceOf(BrowserRemoteStoreV2);
  });
});
