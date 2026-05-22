import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { toActiveOutlineSnapshot } from "../domain/workspace";
import { makeDocumentWithTexts } from "../test/factories";
import { FakeRemoteStoreV2 } from "./fakeRemoteStoreV2";
import { createRemoteSnapshotRecord, writeRemoteSnapshotPatchV2, writeRemoteSnapshotV2 } from "./remoteSyncV2";
import { estimateEncodedSnapshotBytes } from "./remoteEncoding";
import { createSnapshotPatch, estimateEncodedPatchBytes } from "./snapshotPatch";
import { createYjsWorkspace, getYjsSnapshot, mergeIntoNewWorkspace } from "./yjsAdapter";

describe("remote sync v2", () => {
  it("reads and writes the latest snapshot through a fake v2 store", async () => {
    const store = new FakeRemoteStoreV2();
    const document = makeDocumentWithTexts(["Remote"]);
    const workspace = createYjsWorkspace({ document, view: createInitialView(document) });
    const record = createRemoteSnapshotRecord(workspace, "client-a", 1, 10);

    await store.writeLatestSnapshot(record);

    expect(await store.readLatestSnapshot()).toMatchObject({
      version: 1,
      clientId: "client-a",
      updatedAt: 10
    });
  });

  it("meters snapshot read, write, and stored bytes", async () => {
    const store = new FakeRemoteStoreV2();
    const first = { version: 1, clientId: "a", updatedAt: 1, state: new Uint8Array([1, 2]) };
    const second = { version: 2, clientId: "a", updatedAt: 2, state: new Uint8Array([3]) };

    await store.writeLatestSnapshot(first);
    await store.writeLatestSnapshot(second);
    await store.readLatestSnapshot();

    expect(store.getMetering()).toEqual({
      readBytes: estimateEncodedSnapshotBytes(second),
      writeBytes: estimateEncodedSnapshotBytes(first) + estimateEncodedSnapshotBytes(second),
      storedBytes: estimateEncodedSnapshotBytes(second)
    });
  });

  it("keeps the newer version when a stale snapshot is written", async () => {
    const store = new FakeRemoteStoreV2();
    await store.writeLatestSnapshot({ version: 2, clientId: "a", updatedAt: 2, state: new Uint8Array([2]) });
    await store.writeLatestSnapshot({ version: 1, clientId: "b", updatedAt: 3, state: new Uint8Array([1]) });

    expect(await store.readLatestSnapshot()).toMatchObject({ version: 2, clientId: "a" });
  });

  it("rejects equal-version writes from a different client", async () => {
    const store = new FakeRemoteStoreV2();
    await expect(
      store.writeLatestSnapshot({ version: 1, clientId: "a", updatedAt: 1, state: new Uint8Array([1]) })
    ).resolves.toBe("accepted");

    await expect(
      store.writeLatestSnapshot({ version: 1, clientId: "b", updatedAt: 2, state: new Uint8Array([2]) })
    ).resolves.toBe("rejected");
    expect(await store.readLatestSnapshot()).toMatchObject({ version: 1, clientId: "a" });
  });

  it("reports a rejected equal-version write as a conflict", async () => {
    const store = new FakeRemoteStoreV2();
    await store.writeLatestSnapshot({ version: 1, clientId: "a", updatedAt: 1, state: new Uint8Array([1]) });

    await expect(
      writeRemoteSnapshotV2(store, { version: 1, clientId: "b", updatedAt: 2, state: new Uint8Array([2]) })
    ).resolves.toBe("conflict");
  });

  it("rejects snapshot writes over the byte budget", async () => {
    const store = new FakeRemoteStoreV2();
    const status = await writeRemoteSnapshotV2(
      store,
      { version: 1, clientId: "a", updatedAt: 1, state: new Uint8Array([1, 2]) },
      1
    );

    expect(status).toBe("error");
    expect(await store.readLatestSnapshot()).toBeNull();
  });

  it("writes and reads a small snapshot patch without re-sending the full snapshot", async () => {
    const store = new FakeRemoteStoreV2();
    const firstDocument = makeDocumentWithTexts(["A", "B"]);
    const firstSnapshot = { document: firstDocument, view: createInitialView(firstDocument) };
    const firstRecord = createRemoteSnapshotRecord(createYjsWorkspace(firstSnapshot), "client-a", 1, 10);
    await store.writeLatestSnapshot(firstRecord);

    const nodeId = firstDocument.nodes[firstDocument.rootId].children[0];
    const secondDocument = {
      ...firstDocument,
      nodes: {
        ...firstDocument.nodes,
        [nodeId]: { ...firstDocument.nodes[nodeId], text: "A changed", updatedAt: 11 }
      }
    };
    const patch = createSnapshotPatch(firstSnapshot, { document: secondDocument, view: createInitialView(secondDocument) });
    const beforePatchBytes = store.getMetering().writeBytes;

    await expect(
      store.writeSnapshotPatch?.({ baseVersion: 1, version: 2, clientId: "client-a", updatedAt: 11, patch })
    ).resolves.toBe("accepted");
    await expect(store.readSnapshotPatch?.(1)).resolves.toMatchObject({ version: 2, baseVersion: 1 });

    const latest = await store.readLatestSnapshot();
    expect(latest).not.toBeNull();
    const materialized = getYjsSnapshot(mergeIntoNewWorkspace(latest!.state));
    expect(toActiveOutlineSnapshot(materialized!).document.nodes[nodeId].text).toBe("A changed");
    expect(store.getMetering().writeBytes - beforePatchBytes).toBe(estimateEncodedPatchBytes(patch));
    expect(estimateEncodedPatchBytes(patch)).toBeLessThan(estimateEncodedSnapshotBytes(createRemoteSnapshotRecord(createYjsWorkspace({ document: secondDocument, view: createInitialView(secondDocument) }), "client-a", 2, 11)));
  });

  it("rejects snapshot patch writes over the byte budget", async () => {
    const store = new FakeRemoteStoreV2();
    const firstDocument = makeDocumentWithTexts(["A"]);
    const firstSnapshot = { document: firstDocument, view: createInitialView(firstDocument) };
    await store.writeLatestSnapshot(createRemoteSnapshotRecord(createYjsWorkspace(firstSnapshot), "client-a", 1, 10));
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
      writeRemoteSnapshotPatchV2(store, { baseVersion: 1, version: 2, clientId: "client-a", updatedAt: 11, patch }, 1)
    ).resolves.toBe("error");
    await expect(store.readSnapshotPatch?.(1)).resolves.toBeNull();
  });

  it("reports a stale snapshot patch write as a conflict", async () => {
    const store = new FakeRemoteStoreV2();
    const document = makeDocumentWithTexts(["A"]);
    const snapshot = { document, view: createInitialView(document) };
    await store.writeLatestSnapshot(createRemoteSnapshotRecord(createYjsWorkspace(snapshot), "client-a", 2, 10));
    const patch = createSnapshotPatch(snapshot, snapshot);

    await expect(
      writeRemoteSnapshotPatchV2(store, { baseVersion: 1, version: 3, clientId: "client-b", updatedAt: 11, patch })
    ).resolves.toBe("conflict");
  });
});
