import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialView, createNodeAfter, updateNodeText } from "../domain/outline";
import type { OutlineSnapshot, StoredSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import { DEFAULT_PREFERENCES, type PreferenceSettings } from "./preferences";
import { makeDocumentWithTexts, makeIdGenerator, makeLargeDocument } from "../test/factories";
import { FakeRemoteStoreV2 } from "../sync/fakeRemoteStoreV2";
import { createRemoteSnapshotRecord } from "../sync/remoteSyncV2";
import type { RemoteStoreV2 } from "../sync/syncTypes";
import { createYjsWorkspace } from "../sync/yjsAdapter";
import {
  createDocumentInWorkspace,
  isWorkspaceSnapshot,
  switchActiveDocument,
  toActiveOutlineSnapshot
} from "../domain/workspace";
import { useOutlineWorkspace } from "./useOutlineWorkspace";

function memoryPersistence(
  initial: StoredSnapshot | null = null
): LocalPersistence & { saved: StoredSnapshot[]; conflictBackup: StoredSnapshot | null } {
  const saved: StoredSnapshot[] = [];
  const history: Awaited<ReturnType<LocalPersistence["listSnapshotHistory"]>> = [];
  let current: StoredSnapshot | null = initial;
  let conflictBackup: StoredSnapshot | null = null;
  let preferences: PreferenceSettings = DEFAULT_PREFERENCES;
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
    async listSnapshotHistory() {
      return history;
    },
    async saveSnapshotHistory(entry) {
      history.unshift(entry);
    },
    async clearSnapshotHistory() {
      history.length = 0;
    },
    async loadPreferences() {
      return preferences;
    },
    async savePreferences(next) {
      preferences = next;
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("promotes and saves a v1 persisted snapshot as a v2 workspace", async () => {
    const document = makeDocumentWithTexts(["Saved"]);
    const persistence = memoryPersistence({ document, view: createInitialView(document) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "doc-1",
        now: () => 1
      })
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => expect(isWorkspaceSnapshot(persistence.saved.at(-1)!)).toBe(true));
    expect(result.current.workspaceSnapshot.schemaVersion).toBe(2);
    expect(result.current.workspaceSnapshot.workspace.documentOrder).toEqual(["doc-1"]);
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
    await waitFor(() => expect(toActiveOutlineSnapshot(persistence.saved.at(-1)!).document.nodes[childId].text).toBe("B"));
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

  it("keeps document commands out of outline undo and preserves per-document view state", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: makeIdGenerator("runtime"),
        now: () => 10
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const firstDocumentId = result.current.workspaceSnapshot.workspace.activeDocumentId;

    act(() => {
      result.current.commitWorkspaceCommand(
        createDocumentInWorkspace(result.current.workspaceSnapshot, "Second", () => "doc-2", () => "node-2", () => 11)
      );
    });
    await waitFor(() => expect(result.current.workspaceSnapshot.workspace.documentOrder).toEqual([firstDocumentId, "doc-2"]));
    const second = result.current.activeSnapshot.document;
    const secondChildId = second.nodes[second.rootId].children[0];

    act(() => {
      result.current.commitActiveOutline({
        document: second,
        view: { ...result.current.activeSnapshot.view, selectedNodeId: secondChildId }
      });
      result.current.commitWorkspaceCommand(switchActiveDocument(result.current.workspaceSnapshot, firstDocumentId));
    });

    await waitFor(() => expect(result.current.workspaceSnapshot.workspace.activeDocumentId).toBe(firstDocumentId));
    act(() => {
      result.current.undo();
    });

    expect(result.current.workspaceSnapshot.workspace.documentOrder).toEqual([firstDocumentId, "doc-2"]);
    expect(result.current.workspaceSnapshot.workspace.activeDocumentId).toBe(firstDocumentId);
    expect(result.current.workspaceSnapshot.workspace.view.perDocument["doc-2"].selectedNodeId).toBe(secondChildId);
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

  it("keeps one hour of faster-than-debounce typing to one bounded remote write", async () => {
    let document = makeDocumentWithTexts(["A"]);
    const nodeId = document.nodes[document.rootId].children[0];
    const persistence = memoryPersistence({ document, view: createInitialView(document) });
    const remoteStore = new FakeRemoteStoreV2();
    let currentTime = 10;
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => currentTime,
        remoteDebounceMs: 60_000
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    vi.useFakeTimers();
    try {
      act(() => {
        for (let index = 0; index < 120; index += 1) {
          currentTime += 30_000;
          document = updateNodeText(document, nodeId, `A ${index}`, () => currentTime);
          result.current.commitSnapshot({ document, view: createInitialView(document) });
          vi.advanceTimersByTime(30_000);
        }
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect((await remoteStore.readLatestSnapshot())?.version).toBe(120);
      const metering = remoteStore.getMetering();
      expect(metering.writeBytes).toBe(metering.storedBytes);
    } finally {
      vi.useRealTimers();
    }
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

  it("keeps one hour of slow large-document edits on the patch path", async () => {
    let document = makeLargeDocument(500);
    const nodeId = document.nodes[document.rootId].children[0];
    const initialSnapshot = { document, view: createInitialView(document) };
    const persistence = memoryPersistence(initialSnapshot);
    const remoteStore = new FakeRemoteStoreV2();
    await remoteStore.writeLatestSnapshot(createRemoteSnapshotRecord(createYjsWorkspace(initialSnapshot), "seed", 1, 1));
    const initialWriteBytes = remoteStore.getMetering().writeBytes;
    let currentTime = 10;
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        remoteStore,
        createId: () => "new",
        createClientId: () => "client-a",
        now: () => currentTime,
        remoteDebounceMs: 1_000
      })
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

    vi.useFakeTimers();
    try {
      for (let index = 0; index < 20; index += 1) {
        act(() => {
          currentTime += 180_000;
          document = updateNodeText(document, nodeId, `Edited ${index}`, () => currentTime);
          result.current.commitSnapshot({ document, view: createInitialView(document) });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_001);
        });
        expect((await remoteStore.readLatestSnapshot())?.version).toBe(2 + index);
      }

      const fullSnapshotBytes = remoteStore.getMetering().storedBytes;
      const slowEditWriteBytes = remoteStore.getMetering().writeBytes - initialWriteBytes;
      expect(slowEditWriteBytes).toBeLessThan(fullSnapshotBytes * 3);
    } finally {
      vi.useRealTimers();
    }
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
    expect(toActiveOutlineSnapshot(persistence.saved.at(-1)!).document).toBe(second);
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
    expect(toActiveOutlineSnapshot(persistence.saved.at(-1)!).document).toBe(second);

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

  it("lets a second runtime pull slow large-document edits as patches", async () => {
    let document = makeLargeDocument(200);
    const firstSnapshot = { document, view: createInitialView(document) };
    const nodeId = document.nodes[document.rootId].children[0];
    const remoteStore = new FakeRemoteStoreV2();
    const writerStore: RemoteStoreV2 = {
      readLatestSnapshot: () => remoteStore.readLatestSnapshot(),
      writeLatestSnapshot: (record) => remoteStore.writeLatestSnapshot(record),
      readSnapshotPatch: (afterVersion) => remoteStore.readSnapshotPatch(afterVersion),
      writeSnapshotPatch: (record) => remoteStore.writeSnapshotPatch(record)
    };
    await remoteStore.writeLatestSnapshot(createRemoteSnapshotRecord(createYjsWorkspace(firstSnapshot), "seed", 1, 1));
    const persistenceA = memoryPersistence(firstSnapshot);
    const persistenceB = memoryPersistence(firstSnapshot);
    const clientA = renderHook(() =>
      useOutlineWorkspace({
        persistence: persistenceA,
        remoteStore: writerStore,
        createId: () => "new-a",
        createClientId: () => "client-a",
        now: () => 10,
        remoteDebounceMs: 0
      })
    );
    const clientB = renderHook(() =>
      useOutlineWorkspace({
        persistence: persistenceB,
        remoteStore,
        createId: () => "new-b",
        createClientId: () => "client-b",
        now: () => 11,
        remoteDebounceMs: 0
      })
    );
    await waitFor(() => expect(clientA.result.current.syncStatus).toBe("synced"));
    await waitFor(() => expect(clientB.result.current.syncStatus).toBe("synced"));
    const readBytesBeforeEdit = remoteStore.getMetering().readBytes;
    const snapshotBytes = remoteStore.getMetering().storedBytes;

    act(() => {
      document = updateNodeText(document, nodeId, "Edited from A", () => 20);
      clientA.result.current.commitSnapshot({ document, view: createInitialView(document) });
    });

    await waitFor(() => expect(clientB.result.current.snapshot.document.nodes[nodeId].text).toBe("Edited from A"));
    const readBytesForPatch = remoteStore.getMetering().readBytes - readBytesBeforeEdit;
    expect(readBytesForPatch).toBeLessThan(snapshotBytes);
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
    expect(toActiveOutlineSnapshot(persistence.conflictBackup!).document.nodes[localChildId].text).toBe("Local");
    expect(result.current.snapshot.document.nodes[remoteChildId].text).toBe("Remote");
  });

  it("stores local history snapshots and restores one as an undoable transaction", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const third = makeDocumentWithTexts(["C"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    let tick = 10;
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => tick
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      tick = 20;
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
      tick = 30;
      result.current.commitSnapshot({ document: third, view: createInitialView(third) });
    });
    await waitFor(() => expect(result.current.snapshotHistory.length).toBeGreaterThanOrEqual(2));

    const secondHistory = result.current.snapshotHistory.find((entry) => entry.createdAt === 20);
    expect(secondHistory).toBeDefined();
    act(() => {
      result.current.restoreSnapshot(secondHistory!.id);
    });

    const secondChildId = second.nodes[second.rootId].children[0];
    await waitFor(() => expect(result.current.snapshot.document.nodes[secondChildId].text).toBe("B"));

    act(() => {
      result.current.undo();
    });
    const thirdChildId = third.nodes[third.rootId].children[0];
    await waitFor(() => expect(result.current.snapshot.document.nodes[thirdChildId].text).toBe("C"));
  });
});
