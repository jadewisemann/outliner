import { describe, expect, it } from "vitest";
import { createInitialView, createNodeAfter } from "../domain/outline";
import { toActiveOutlineSnapshot } from "../domain/workspace";
import { makeDocumentWithTexts } from "../test/factories";
import { FakeRemoteStore } from "./fakeRemoteStore";
import {
  compactRemoteSnapshot,
  createRemoteSyncState,
  pullRemoteUpdates,
  pushLocalUpdate,
  subscribeRemoteUpdates
} from "./remoteSync";
import { createYjsWorkspace, encodeState, getYjsSnapshot, setYjsSnapshot } from "./yjsAdapter";

describe("remote sync", () => {
  it("applies a remote snapshot to the local workspace", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["Remote"]);
    const remote = createYjsWorkspace({ document, view: createInitialView(document) });
    await compactRemoteSnapshot(store, remote);
    const local = createYjsWorkspace();
    await pullRemoteUpdates(store, local, createRemoteSyncState());
    expect(toActiveOutlineSnapshot(getYjsSnapshot(local)!).document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
  });

  it("pushes and pulls local updates through a fake remote store", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["A"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });
    await pushLocalUpdate(
      store,
      {
        id: "update-1",
        clientId: "client-a",
        seq: 1,
        update: encodeState(source),
        createdAt: 1
      },
      createRemoteSyncState()
    );
    const target = createYjsWorkspace();
    await pullRemoteUpdates(store, target, createRemoteSyncState());
    expect(toActiveOutlineSnapshot(getYjsSnapshot(target)!).document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
  });

  it("ignores duplicate remote updates", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["A"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });
    const update = {
      id: "update-1",
      clientId: "client-a",
      seq: 1,
      update: encodeState(source),
      createdAt: 1
    };
    await store.appendUpdate(update);
    await store.appendUpdate(update);

    const target = createYjsWorkspace();
    let state = await pullRemoteUpdates(store, target, createRemoteSyncState());
    state = await pullRemoteUpdates(store, target, state);

    expect(state.queue.appliedIds).toEqual(["update-1"]);
    expect(toActiveOutlineSnapshot(getYjsSnapshot(target)!).document.nodes[document.rootId].children).toHaveLength(1);
  });

  it("keeps failed appends in the offline queue and flushes them after reconnecting", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["Queued"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });
    const update = {
      id: "client-a:1",
      clientId: "client-a",
      seq: 1,
      update: encodeState(source),
      createdAt: 1
    };

    store.failNextAppend();
    const offline = await pushLocalUpdate(store, update, createRemoteSyncState());
    expect(offline.status).toBe("offline");
    expect(offline.queue.pending).toEqual([update]);

    const synced = await pushLocalUpdate(store, update, offline);
    expect(synced.status).toBe("synced");
    expect(synced.queue.pending).toEqual([]);
    expect(await store.listUpdates()).toEqual([update]);
  });

  it("rejects an update that exceeds the configured remote payload budget", async () => {
    const store = new FakeRemoteStore();
    const state = await pushLocalUpdate(
      store,
      {
        id: "too-large",
        clientId: "client-a",
        seq: 1,
        update: new Uint8Array([1, 2, 3]),
        createdAt: 1
      },
      createRemoteSyncState(),
      { maxUpdateBytes: 2 }
    );

    expect(state.status).toBe("error");
    expect(state.queue.pending).toHaveLength(1);
    expect(await store.listUpdates()).toEqual([]);
  });

  it("compacts a snapshot and removes update log entries through the last synced cursor", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["Compact"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });
    const first = {
      id: "update-1",
      clientId: "client-a",
      seq: 1,
      update: new Uint8Array([1]),
      createdAt: 1
    };
    const second = {
      id: "update-2",
      clientId: "client-a",
      seq: 2,
      update: new Uint8Array([2]),
      createdAt: 2
    };

    await store.appendUpdate(first);
    await store.appendUpdate(second);
    await compactRemoteSnapshot(store, source, { ...createRemoteSyncState(), lastUpdateId: first.id });

    expect(await store.listUpdates()).toEqual([second]);
  });

  it("meters read and write bytes for fake remote cost regression tests", async () => {
    const store = new FakeRemoteStore();
    await store.appendUpdate({
      id: "a",
      clientId: "client-a",
      seq: 1,
      update: new Uint8Array([1]),
      createdAt: 1
    });
    await store.appendUpdate({
      id: "b",
      clientId: "client-a",
      seq: 2,
      update: new Uint8Array([2, 3]),
      createdAt: 2
    });
    await store.listUpdates("a");

    expect(store.getMetering()).toMatchObject({
      readBytes: 2,
      writeBytes: 3,
      storedBytes: 3
    });
  });

  it("applies subscribed remote updates and records them as applied", async () => {
    const store = new FakeRemoteStore();
    const target = createYjsWorkspace();
    let state = createRemoteSyncState();
    const unsubscribe = subscribeRemoteUpdates(
      store,
      target,
      () => state,
      (next) => {
        state = next;
      }
    );
    const document = makeDocumentWithTexts(["Live"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });

    await store.appendUpdate({
      id: "live-1",
      clientId: "client-a",
      seq: 1,
      update: encodeState(source),
      createdAt: 1
    });
    unsubscribe();

    expect(state.queue.appliedIds).toEqual(["live-1"]);
    expect(toActiveOutlineSnapshot(getYjsSnapshot(target)!).document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
  });

  it("merges concurrent edits from two fake clients without conflict copies", async () => {
    const store = new FakeRemoteStore();
    const base = makeDocumentWithTexts(["Base"]);
    const baseSnapshot = { document: base, view: createInitialView(base) };
    const clientA = createYjsWorkspace(baseSnapshot);
    const clientB = createYjsWorkspace(baseSnapshot);
    const firstChild = base.nodes[base.rootId].children[0];
    const aEdit = createNodeAfter(base, firstChild, () => "client-a-node", () => 2).document;
    const bEdit = createNodeAfter(base, firstChild, () => "client-b-node", () => 3).document;

    setYjsSnapshot(clientA, { document: aEdit, view: createInitialView(aEdit) });
    setYjsSnapshot(clientB, { document: bEdit, view: createInitialView(bEdit) });
    await pushLocalUpdate(
      store,
      {
        id: "client-a:1",
        clientId: "client-a",
        seq: 1,
        update: encodeState(clientA),
        createdAt: 1
      },
      createRemoteSyncState()
    );
    await pushLocalUpdate(
      store,
      {
        id: "client-b:1",
        clientId: "client-b",
        seq: 1,
        update: encodeState(clientB),
        createdAt: 2
      },
      createRemoteSyncState()
    );

    const merged = createYjsWorkspace(baseSnapshot);
    await pullRemoteUpdates(store, merged, createRemoteSyncState());
    const snapshot = toActiveOutlineSnapshot(getYjsSnapshot(merged)!);
    expect(snapshot?.document.nodes["client-a-node"].text).toBe("");
    expect(snapshot?.document.nodes["client-b-node"].text).toBe("");
    expect(snapshot?.document.nodes[base.rootId].children).toEqual([
      firstChild,
      "client-a-node",
      "client-b-node"
    ]);
  });
});
