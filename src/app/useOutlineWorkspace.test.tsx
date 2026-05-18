import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialView, createNodeAfter, updateNodeText } from "../domain/outline";
import type { OutlineSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import { makeDocumentWithTexts, makeLargeDocument } from "../test/factories";
import { FakeRemoteStoreV2 } from "../sync/fakeRemoteStoreV2";
import { createRemoteSnapshotRecord } from "../sync/remoteSyncV2";
import { createYjsWorkspace } from "../sync/yjsAdapter";
import { useOutlineWorkspace } from "./useOutlineWorkspace";

function memoryPersistence(
  initial: OutlineSnapshot | null = null
): LocalPersistence & { saved: OutlineSnapshot[]; conflictBackup: OutlineSnapshot | null } {
  const saved: OutlineSnapshot[] = [];
  let current = initial;
  let conflictBackup: OutlineSnapshot | null = null;
  return {
    saved,
    get conflictBackup() {
      return conflictBackup;
    },
    async load() {
      return current;
    },
    async save(snapshot) {
      current = snapshot;
      saved.push(snapshot);
    },
    async clear() {
      current = null;
    },
    async loadConflictBackup() {
      return conflictBackup;
    },
    async saveConflictBackup(snapshot) {
      conflictBackup = snapshot;
    },
    async clearConflictBackup() {
      conflictBackup = null;
    }
  };
}

describe("useOutlineWorkspace", () => {
  it("loads a persisted snapshot into a Yjs-backed runtime", async () => {
    const document = makeDocumentWithTexts(["Saved"]);
    const persistence = memoryPersistence({ document, view: createInitialView(document) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => 1
      })
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const childId = document.nodes[document.rootId].children[0];
    expect(result.current.snapshot.document.nodes[childId].text).toBe("Saved");
  });

  it("commits snapshots and persists the latest runtime state", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => 1
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });

    const childId = second.nodes[second.rootId].children[0];
    await waitFor(() => expect(result.current.snapshot.document.nodes[childId].text).toBe("B"));
    await waitFor(() => expect(persistence.saved.at(-1)?.document.nodes[childId].text).toBe("B"));
  });

  it("undoes and redoes committed snapshots", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const created = createNodeAfter(first, first.nodes[first.rootId].children[0], () => "n-2", () => 2);
    const second = created.document;
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => 1
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });
    await waitFor(() => expect(result.current.snapshot.document.nodes[second.rootId].children).toHaveLength(2));
    act(() => {
      result.current.undo();
    });

    await waitFor(() => expect(result.current.snapshot.document.nodes[first.rootId].children).toHaveLength(1));

    act(() => {
      result.current.redo();
    });

    await waitFor(() => expect(result.current.snapshot.document.nodes[second.rootId].children).toHaveLength(2));
  });

  it("keeps an editable node after undoing to an empty document", async () => {
    const persistence = memoryPersistence(null);
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: vi.fn(() => "editable"),
        now: () => 1
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const empty = {
      ...result.current.snapshot.document,
      nodes: {
        root: {
          ...result.current.snapshot.document.nodes.root,
          children: []
        }
      }
    };

    act(() => {
      result.current.commitSnapshot({ document: empty, view: createInitialView(empty) });
    });

    expect(result.current.snapshot.document.nodes.root.children).toHaveLength(1);
  });

  it("stays local-only when no remote store is configured", async () => {
    const persistence = memoryPersistence(null);
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "editable",
        now: () => 1
      })
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.syncStatus).toBe("local-only");
  });

  it("pulls a remote snapshot after local restore", async () => {
    const local = makeDocumentWithTexts(["Local"]);
    const remote = makeDocumentWithTexts(["Remote"]);
    const persistence = memoryPersistence({ document: local, view: createInitialView(local) });
    const remoteStore = new FakeRemoteStoreV2();
    const remoteWorkspace = createYjsWorkspace({ document: remote, view: createInitialView(remote) });
    await remoteStore.writeLatestSnapshot(createRemoteSnapshotRecord(remoteWorkspace, "remote", 1, 2));

    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 1
      })
    );

    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
    const childId = remote.nodes[remote.rootId].children[0];
    expect(result.current.snapshot.document.nodes[childId].text).toBe("Remote");
  });

  it("pushes local commits as the latest remote snapshot", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });

    await waitFor(async () => expect((await remoteStore.readLatestSnapshot())?.version).toBe(1));
    expect((await remoteStore.readLatestSnapshot())?.updatedAt).toBe(10);
  });

  it("debounces rapid local commits into one remote snapshot write", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const third = makeDocumentWithTexts(["C"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10,
        remoteDebounceMs: 20
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
      result.current.commitSnapshot({ document: third, view: createInitialView(third) });
    });

    await waitFor(async () => expect((await remoteStore.readLatestSnapshot())?.version).toBe(2));
    expect(remoteStore.getMetering().writeBytes).toBe(remoteStore.getMetering().storedBytes);
  });

  it("keeps a 10 minute typing simulation bounded by the latest snapshot size", async () => {
    let document = makeDocumentWithTexts(["A"]);
    const nodeId = document.nodes[document.rootId].children[0];
    const persistence = memoryPersistence({ document, view: createInitialView(document) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10,
        remoteDebounceMs: 20
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    act(() => {
      for (let index = 0; index < 600; index += 1) {
        document = updateNodeText(document, nodeId, `A ${index}`, () => 10 + index);
        result.current.commitSnapshot({ document, view: createInitialView(document) });
      }
    });

    await waitFor(async () => expect((await remoteStore.readLatestSnapshot())?.version).toBe(600));
    const metering = remoteStore.getMetering();
    expect(metering.writeBytes).toBe(metering.storedBytes);
    expect(metering.readBytes).toBeLessThan(metering.storedBytes * 3);
  });

  it("keeps slow large-document edits from writing a full snapshot every time", async () => {
    let document = makeLargeDocument(200);
    const nodeId = document.nodes[document.rootId].children[0];
    const initialSnapshot = { document, view: createInitialView(document) };
    const persistence = memoryPersistence(initialSnapshot);
    const remoteStore = new FakeRemoteStoreV2();
    await remoteStore.writeLatestSnapshot(createRemoteSnapshotRecord(createYjsWorkspace(initialSnapshot), "seed", 1, 1));
    const initialWriteBytes = remoteStore.getMetering().writeBytes;
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: vi.fn()
          .mockReturnValueOnce(10)
          .mockReturnValueOnce(11)
          .mockReturnValueOnce(12)
          .mockReturnValueOnce(13)
          .mockReturnValueOnce(14)
          .mockReturnValue(15),
        remoteDebounceMs: 0
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    for (let index = 0; index < 5; index += 1) {
      act(() => {
        document = updateNodeText(document, nodeId, `Edited ${index}`, () => 20 + index);
        result.current.commitSnapshot({ document, view: createInitialView(document) });
      });
      await waitFor(async () => expect((await remoteStore.readLatestSnapshot())?.version).toBe(2 + index));
      await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
    }

    const fullSnapshotBytes = remoteStore.getMetering().storedBytes;
    const slowEditWriteBytes = remoteStore.getMetering().writeBytes - initialWriteBytes;
    expect(slowEditWriteBytes).toBeLessThan(fullSnapshotBytes * 2);
  });

  it("keeps local persistence when a remote payload exceeds the byte budget", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10,
        remoteDebounceMs: 0,
        maxRemoteUpdateBytes: 1
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });

    await waitFor(() => expect(result.current.syncStatus).toBe("error"));
    expect(persistence.saved.at(-1)?.document).toBe(second);
    expect(await remoteStore.readLatestSnapshot()).toBeNull();
  });

  it("marks the runtime offline when remote snapshot write fails", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    remoteStore.failNextWrite();
    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });

    await waitFor(() => expect(result.current.syncStatus).toBe("offline"));
    expect(persistence.saved.at(-1)?.document).toBe(second);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(async () => expect((await remoteStore.readLatestSnapshot())?.version).toBe(1));
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
  });

  it("syncs a local commit into another runtime through a shared fake remote store", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const remoteStore = new FakeRemoteStoreV2();
    const persistenceA = memoryPersistence({ document: first, view: createInitialView(first) });
    const persistenceB = memoryPersistence({ document: first, view: createInitialView(first) });
    const clientA = renderHook(() =>
      useOutlineWorkspace({
        persistence: persistenceA,
        remoteStore,
        createId: () => "new-a",
        createClientId: () => "client-a",
        now: () => 10
      })
    );
    const clientB = renderHook(() =>
      useOutlineWorkspace({
        persistence: persistenceB,
        remoteStore,
        createId: () => "new-b",
        createClientId: () => "client-b",
        now: () => 11
      })
    );
    await waitFor(() => expect(clientA.result.current.syncStatus).toBe("synced"));
    await waitFor(() => expect(clientB.result.current.syncStatus).toBe("synced"));

    act(() => {
      clientA.result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });

    const childId = second.nodes[second.rootId].children[0];
    await waitFor(() => expect(clientB.result.current.snapshot.document.nodes[childId].text).toBe("B"));
  });

  it("pulls the latest snapshot on focus without a realtime subscription", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["Focus"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    await remoteStore.writeLatestSnapshot(
      createRemoteSnapshotRecord(createYjsWorkspace({ document: second, view: createInitialView(second) }), "remote", 2, 20)
    );
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    const childId = second.nodes[second.rootId].children[0];
    await waitFor(() => expect(result.current.snapshot.document.nodes[childId].text).toBe("Focus"));
  });

  it("saves a conflict backup when newer remote replaces pending local changes", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const local = makeDocumentWithTexts(["Local"]);
    const remote = makeDocumentWithTexts(["Remote"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const remoteStore = new FakeRemoteStoreV2();
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => 10,
        remoteDebounceMs: 50
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    act(() => {
      result.current.commitSnapshot({ document: local, view: createInitialView(local) });
    });
    const localChildId = local.nodes[local.rootId].children[0];
    await waitFor(() => expect(result.current.snapshot.document.nodes[localChildId].text).toBe("Local"));
    await remoteStore.writeLatestSnapshot(
      createRemoteSnapshotRecord(createYjsWorkspace({ document: remote, view: createInitialView(remote) }), "remote", 2, 20)
    );
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(result.current.syncStatus).toBe("conflict"));
    const remoteChildId = remote.nodes[remote.rootId].children[0];
    expect(persistence.conflictBackup?.document.nodes[localChildId].text).toBe("Local");
    expect(result.current.snapshot.document.nodes[remoteChildId].text).toBe("Remote");
  });
});
