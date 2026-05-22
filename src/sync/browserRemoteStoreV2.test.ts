import { describe, expect, it, vi } from "vitest";
import { createInitialView } from "../domain/outline";
import { toActiveOutlineSnapshot } from "../domain/workspace";
import { makeDocumentWithTexts } from "../test/factories";
import { BrowserRemoteStoreV2 } from "./browserRemoteStoreV2";
import { createRemoteSnapshotRecord } from "./remoteSyncV2";
import { createSnapshotPatch } from "./snapshotPatch";
import { createYjsWorkspace, getYjsSnapshot, mergeIntoNewWorkspace } from "./yjsAdapter";

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

  it("continues notifying after unsubscribe and resubscribe on the same instance", async () => {
    const workspaceId = crypto.randomUUID();
    const receiver = new BrowserRemoteStoreV2(workspaceId);
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    receiver.subscribe(firstListener)();
    receiver.subscribe(secondListener);
    await receiver.writeLatestSnapshot({
      version: 1,
      clientId: "client-a",
      updatedAt: 1,
      state: new Uint8Array([1])
    });

    expect(secondListener).toHaveBeenCalled();
  });

  it("syncs snapshot patches through shared browser storage", async () => {
    const workspaceId = crypto.randomUUID();
    const first = new BrowserRemoteStoreV2(workspaceId);
    const second = new BrowserRemoteStoreV2(workspaceId);
    const listener = vi.fn();
    second.subscribe(listener);
    const firstDocument = makeDocumentWithTexts(["A", "B"]);
    const firstSnapshot = { document: firstDocument, view: createInitialView(firstDocument) };
    await first.writeLatestSnapshot(createRemoteSnapshotRecord(createYjsWorkspace(firstSnapshot), "client-a", 1, 10));

    const nodeId = firstDocument.nodes[firstDocument.rootId].children[0];
    const secondDocument = {
      ...firstDocument,
      nodes: {
        ...firstDocument.nodes,
        [nodeId]: { ...firstDocument.nodes[nodeId], text: "A changed", updatedAt: 11 }
      }
    };
    const patch = createSnapshotPatch(firstSnapshot, { document: secondDocument, view: createInitialView(secondDocument) });

    await expect(
      first.writeSnapshotPatch?.({ baseVersion: 1, version: 2, clientId: "client-a", updatedAt: 11, patch })
    ).resolves.toBe("accepted");
    window.dispatchEvent(new StorageEvent("storage", { key: `outliner:browser-remote:${workspaceId}:v2:patch` }));

    await expect(second.readSnapshotPatch?.(1)).resolves.toMatchObject({ baseVersion: 1, version: 2 });
    const latest = await second.readLatestSnapshot();
    expect(latest).not.toBeNull();
    const materialized = getYjsSnapshot(mergeIntoNewWorkspace(latest!.state));
    expect(toActiveOutlineSnapshot(materialized!).document.nodes[nodeId].text).toBe("A changed");
    expect(listener).toHaveBeenCalled();
  });
});
