import { describe, expect, it } from "vitest";
import { BrowserRemoteStoreV2 } from "./browserRemoteStoreV2";

describe("BrowserRemoteStoreV2", () => {
  it("syncs latest snapshots through shared browser storage", async () => {
    const workspaceId = crypto.randomUUID();
    const first = new BrowserRemoteStoreV2(workspaceId);
    const second = new BrowserRemoteStoreV2(workspaceId);

    await first.writeLatestSnapshot({
      version: 1,
      clientId: "client-a",
      updatedAt: 1,
      state: new Uint8Array([1, 2, 3])
    });

    expect(await second.readLatestSnapshot()).toMatchObject({
      version: 1,
      clientId: "client-a",
      updatedAt: 1
    });
  });

  it("migrates a legacy browser snapshot into v2 storage once", async () => {
    const workspaceId = crypto.randomUUID();
    window.localStorage.setItem(
      `outliner:browser-remote:${workspaceId}`,
      JSON.stringify({
        snapshot: btoa(String.fromCharCode(1)),
        vector: null,
        updates: []
      })
    );
    const store = new BrowserRemoteStoreV2(workspaceId);

    const snapshot = await store.readLatestSnapshot();

    expect(snapshot?.clientId).toBe("legacy-browser");
    expect(window.localStorage.getItem(`outliner:browser-remote:${workspaceId}:v2`)).toContain("legacy-browser");
  });
});
