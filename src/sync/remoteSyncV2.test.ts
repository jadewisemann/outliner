import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { FakeRemoteStoreV2 } from "./fakeRemoteStoreV2";
import { createRemoteSnapshotRecord, writeRemoteSnapshotV2 } from "./remoteSyncV2";
import { estimateEncodedSnapshotBytes } from "./remoteEncoding";
import { createYjsWorkspace } from "./yjsAdapter";

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
});
