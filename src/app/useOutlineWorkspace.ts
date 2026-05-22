import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyDocument,
  createInitialView,
  ensureEditableNode,
  ROOT_ID
} from "../domain/outline";
import type { Clock, IdGenerator, NodeId, OutlineSnapshot } from "../domain/outlineTypes";
import { toActiveOutlineSnapshot } from "../domain/workspace";
import type { LocalPersistence, SnapshotHistoryEntry } from "../persistence/localPersistence";
import {
  createRemoteSnapshotRecord,
  createRemoteSyncV2State,
  DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET,
  applyRemoteSnapshotRecord,
  writeRemoteSnapshotPatchV2,
  writeRemoteSnapshotV2
} from "../sync/remoteSyncV2";
import { applySnapshotPatch, createSnapshotPatch, estimateEncodedPatchBytes, isEmptySnapshotPatch } from "../sync/snapshotPatch";
import type {
  RemoteSnapshotPatchRecord,
  RemoteSnapshotRecord,
  RemoteStoreV2,
  RemoteSyncV2State,
  SyncStatus
} from "../sync/syncTypes";
import {
  createYjsWorkspace,
  getYjsSnapshot,
  setYjsSnapshot,
  type YjsWorkspace
} from "../sync/yjsAdapter";

type PendingRemoteChange =
  | { kind: "snapshot"; record: RemoteSnapshotRecord }
  | { kind: "patch"; record: RemoteSnapshotPatchRecord };

export type OutlineWorkspaceRuntime = {
  snapshot: OutlineSnapshot;
  loaded: boolean;
  commitSnapshot: (snapshot: OutlineSnapshot) => void;
  snapshotHistory: SnapshotHistoryEntry[];
  restoreSnapshot: (historyId: string) => void;
  refreshSnapshotHistory: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  syncStatus: SyncStatus;
};

type UseOutlineWorkspaceOptions = {
  persistence: LocalPersistence;
  remoteStore?: RemoteStoreV2;
  createId: IdGenerator;
  createClientId?: IdGenerator;
  now: Clock;
  remoteDebounceMs?: number;
  maxRemoteUpdateBytes?: number;
  maxRemoteSnapshotBytes?: number;
};

export function useOutlineWorkspace({
  persistence,
  remoteStore,
  createId,
  createClientId = () => crypto.randomUUID(),
  now,
  remoteDebounceMs = 150,
  maxRemoteUpdateBytes,
  maxRemoteSnapshotBytes = maxRemoteUpdateBytes ?? DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET
}: UseOutlineWorkspaceOptions): OutlineWorkspaceRuntime {
  const initialSnapshot = useMemo(() => normalizeSnapshot(makeEmptySnapshot(createId, now), createId, now), [
    createId,
    now
  ]);
  const workspaceRef = useRef<YjsWorkspace>(createYjsWorkspace(initialSnapshot));
  const snapshotRef = useRef<OutlineSnapshot>(initialSnapshot);
  const createIdRef = useRef(createId);
  const nowRef = useRef(now);
  const undoStackRef = useRef<OutlineSnapshot[]>([]);
  const redoStackRef = useRef<OutlineSnapshot[]>([]);
  const remoteStateRef = useRef<RemoteSyncV2State>(createRemoteSyncV2State());
  const clientIdRef = useRef<string>(createClientId());
  const pendingRemoteRecordRef = useRef<PendingRemoteChange | null>(null);
  const remoteDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const pullingRemoteRef = useRef(false);
  const remoteWriteTokenRef = useRef(0);
  const pullLatestRemoteSnapshotRef = useRef<() => Promise<void>>(async () => {});
  const loadedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const historyChainRef = useRef<Promise<void>>(Promise.resolve());
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(remoteStore ? "syncing" : "local-only");
  createIdRef.current = createId;
  nowRef.current = now;

  const saveSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      saveChainRef.current = saveChainRef.current.then(
        () => persistence.save(next),
        () => persistence.save(next)
      );
      return saveChainRef.current;
    },
    [persistence]
  );

  const refreshSnapshotHistory = useCallback(async () => {
    setSnapshotHistory(await persistence.listSnapshotHistory());
  }, [persistence]);

  const saveHistorySnapshot = useCallback(
    (next: OutlineSnapshot, createdAt: number, reason: SnapshotHistoryEntry["reason"] = "autosave") => {
      const entry: SnapshotHistoryEntry = {
        id: `${createdAt}:${createIdRef.current()}`,
        createdAt,
        reason,
        snapshot: cloneSnapshot(next)
      };
      historyChainRef.current = historyChainRef.current
        .then(() => persistence.saveSnapshotHistory(entry))
        .then(() => persistence.listSnapshotHistory())
        .then(setSnapshotHistory, () => {});
      return historyChainRef.current;
    },
    [persistence]
  );

  const persistSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      if (loadedRef.current) {
        void saveSnapshot(next);
      }
    },
    [saveSnapshot]
  );

  const setRemoteState = useCallback((state: RemoteSyncV2State) => {
    remoteStateRef.current = state;
    setSyncStatus(state.status);
  }, []);

  const replaceSnapshot = useCallback(
    (normalized: OutlineSnapshot) => {
      setYjsSnapshot(workspaceRef.current, normalized);
      workspaceRef.current.undoManager.stopCapturing();
      snapshotRef.current = normalized;
      setSnapshot(normalized);
      persistSnapshot(normalized);
    },
    [persistSnapshot]
  );

  const flushPendingRemoteSnapshot = useCallback(() => {
    if (!remoteStore || !pendingRemoteRecordRef.current) {
      return;
    }
    const pending = pendingRemoteRecordRef.current;
    const writeToken = (remoteWriteTokenRef.current += 1);
    const write =
      pending.kind === "patch"
        ? writeRemoteSnapshotPatchV2(remoteStore, pending.record, maxRemoteSnapshotBytes)
        : writeRemoteSnapshotV2(remoteStore, pending.record, maxRemoteSnapshotBytes);
    write.then((status) => {
      if (writeToken !== remoteWriteTokenRef.current) {
        return;
      }
      if (status === "synced") {
        if (pendingRemoteRecordRef.current === pending) {
          pendingRemoteRecordRef.current = null;
        }
        if (isStateNewerThanRecord(remoteStateRef.current, pending.record)) {
          return;
        }
        setRemoteState({
          status,
          version: pending.record.version,
          updatedAt: pending.record.updatedAt,
          hasPendingLocalChanges: false
        });
        return;
      }
      if (status === "conflict") {
        void pullLatestRemoteSnapshotRef.current().catch(() => {
          setRemoteState({ ...remoteStateRef.current, status: "error" });
        });
        return;
      }
      setRemoteState({ ...remoteStateRef.current, status });
    });
  }, [maxRemoteSnapshotBytes, remoteStore, setRemoteState]);

  const scheduleRemoteSnapshot = useCallback(
    (change: PendingRemoteChange) => {
      pendingRemoteRecordRef.current = change;
      setSyncStatus("syncing");
      if (remoteDebounceRef.current) {
        clearTimeout(remoteDebounceRef.current);
      }
      remoteDebounceRef.current = setTimeout(flushPendingRemoteSnapshot, remoteDebounceMs);
    },
    [flushPendingRemoteSnapshot, remoteDebounceMs]
  );

  const applyRemoteRecord = useCallback(
    async (record: RemoteSnapshotRecord) => {
      applyRemoteSnapshotRecord(workspaceRef.current, record);
      const remoteSnapshot = getYjsSnapshot(workspaceRef.current);
      if (!remoteSnapshot) {
        return;
      }
      const normalized = normalizeSnapshot(remoteSnapshot, createIdRef.current, nowRef.current);
      snapshotRef.current = normalized;
      setSnapshot(normalized);
      await saveSnapshot(normalized);
    },
    [saveSnapshot]
  );

  const applyRemotePatchRecord = useCallback(
    async (record: RemoteSnapshotPatchRecord) => {
      const patched = applySnapshotPatch(snapshotRef.current, record.patch);
      const normalized = normalizeSnapshot(patched, createIdRef.current, nowRef.current);
      setYjsSnapshot(workspaceRef.current, normalized);
      workspaceRef.current.undoManager.stopCapturing();
      snapshotRef.current = normalized;
      setSnapshot(normalized);
      await saveSnapshot(normalized);
    },
    [saveSnapshot]
  );

  const pullLatestRemoteSnapshot = useCallback(async () => {
    if (!remoteStore) {
      return;
    }
    if (pullingRemoteRef.current) {
      return;
    }
    pullingRemoteRef.current = true;
    try {
      const patch = await remoteStore.readSnapshotPatch?.(remoteStateRef.current.version);
      if (patch && isRemoteNewer(patch, remoteStateRef.current)) {
        remoteWriteTokenRef.current += 1;
        const hadPendingLocalChanges = remoteStateRef.current.hasPendingLocalChanges || pendingRemoteRecordRef.current !== null;
        if (hadPendingLocalChanges) {
          await persistence.saveConflictBackup(cloneSnapshot(snapshotRef.current));
        }
        await applyRemotePatchRecord(patch);
        setRemoteState({
          status: hadPendingLocalChanges ? "conflict" : "synced",
          version: patch.version,
          updatedAt: patch.updatedAt,
          hasPendingLocalChanges: false
        });
        pendingRemoteRecordRef.current = null;
        return;
      }
      const record = await remoteStore.readLatestSnapshot();
      if (!record || !isRemoteNewer(record, remoteStateRef.current)) {
        return;
      }
      remoteWriteTokenRef.current += 1;
      const hadPendingLocalChanges = remoteStateRef.current.hasPendingLocalChanges || pendingRemoteRecordRef.current !== null;
      if (hadPendingLocalChanges) {
        await persistence.saveConflictBackup(cloneSnapshot(snapshotRef.current));
      }
      await applyRemoteRecord(record);
      setRemoteState({
        status: hadPendingLocalChanges ? "conflict" : "synced",
        version: record.version,
        updatedAt: record.updatedAt,
        hasPendingLocalChanges: false
      });
      pendingRemoteRecordRef.current = null;
    } finally {
      pullingRemoteRef.current = false;
    }
  }, [applyRemotePatchRecord, applyRemoteRecord, persistence, remoteStore, setRemoteState]);
  pullLatestRemoteSnapshotRef.current = pullLatestRemoteSnapshot;

  const publishSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      const previous = snapshotRef.current;
      const normalized = normalizeSnapshot(next, createId, now);
      if (!snapshotsEqual(previous, normalized)) {
        undoStackRef.current = [...undoStackRef.current, previous];
        redoStackRef.current = [];
        if (loadedRef.current) {
          void saveHistorySnapshot(normalized, now());
        }
      }
      replaceSnapshot(normalized);
      if (remoteStore && loadedRef.current) {
        const updatedAt = now();
        const baseVersion = remoteStateRef.current.version;
        const canWritePatch = !!remoteStore.writeSnapshotPatch && !remoteStateRef.current.hasPendingLocalChanges && !pendingRemoteRecordRef.current;
        const version = Math.max(remoteStateRef.current.version, pendingRemoteRecordRef.current?.record.version ?? 0) + 1;
        remoteStateRef.current = {
          status: "syncing",
          version,
          updatedAt,
          hasPendingLocalChanges: true
        };
        scheduleRemoteSnapshot(
          createPendingRemoteChange(
            remoteStore,
            previous,
            normalized,
            workspaceRef.current,
            clientIdRef.current,
            baseVersion,
            version,
            updatedAt,
            canWritePatch
          )
        );
      }
    },
    [createId, now, remoteStore, replaceSnapshot, saveHistorySnapshot, scheduleRemoteSnapshot]
  );

  const restoreSnapshot = useCallback(
    (historyId: string) => {
      const entry = snapshotHistory.find((item) => item.id === historyId);
      if (!entry) {
        return;
      }
      publishSnapshot(cloneSnapshot(toActiveOutlineSnapshot(entry.snapshot)));
    },
    [publishSnapshot, snapshotHistory]
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribeRemote: (() => void) | undefined;
    persistence.load().then((persisted) => {
      if (cancelled) {
        return;
      }
      if (persisted) {
        const normalized = normalizeSnapshot(toActiveOutlineSnapshot(persisted), createIdRef.current, nowRef.current);
        workspaceRef.current = createYjsWorkspace(normalized);
        snapshotRef.current = normalized;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setSnapshot(normalized);
      }
      loadedRef.current = true;
      setLoaded(true);
      void refreshSnapshotHistory();
      void saveSnapshot(snapshotRef.current);
      if (!remoteStore) {
        setSyncStatus("local-only");
        return;
      }
      setRemoteState({ ...remoteStateRef.current, status: "syncing" });
      pullLatestRemoteSnapshot()
        .then(() => {
          if (cancelled) {
            return;
          }
          if (remoteStateRef.current.status === "syncing") {
            setRemoteState({ ...remoteStateRef.current, status: "synced" });
          }
          unsubscribeRemote = remoteStore.subscribe?.(() => {
            void pullLatestRemoteSnapshot().catch(() => {
              setRemoteState({ ...remoteStateRef.current, status: "error" });
            });
          });
        })
        .catch(() => {
          if (!cancelled) {
            setRemoteState({ ...remoteStateRef.current, status: "error" });
          }
        });
    });
    return () => {
      cancelled = true;
      unsubscribeRemote?.();
    };
  }, [persistence, pullLatestRemoteSnapshot, refreshSnapshotHistory, remoteStore, saveSnapshot, setRemoteState]);

  useEffect(() => {
    if (!remoteStore) {
      return;
    }
    const onFocus = () => {
      if (pendingRemoteRecordRef.current) {
        flushPendingRemoteSnapshot();
        return;
      }
      void pullLatestRemoteSnapshot().catch(() => {
        setRemoteState({ ...remoteStateRef.current, status: "error" });
      });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [flushPendingRemoteSnapshot, pullLatestRemoteSnapshot, remoteStore, setRemoteState]);

  useEffect(() => {
    return () => {
      if (remoteDebounceRef.current) {
        clearTimeout(remoteDebounceRef.current);
      }
    };
  }, []);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.at(-1);
    if (!previous) {
      return;
    }
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, snapshotRef.current];
    replaceSnapshot(previous);
  }, [replaceSnapshot]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.at(-1);
    if (!next) {
      return;
    }
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, snapshotRef.current];
    replaceSnapshot(next);
  }, [replaceSnapshot]);

  return {
    snapshot,
    loaded,
    commitSnapshot: publishSnapshot,
    snapshotHistory,
    restoreSnapshot,
    refreshSnapshotHistory,
    undo,
    redo,
    syncStatus
  };
}

function makeEmptySnapshot(createId: IdGenerator, now: Clock): OutlineSnapshot {
  const result = ensureEditableNode(createEmptyDocument(now), createId, now);
  return {
    document: result.document,
    view: {
      zoomNodeId: result.document.rootId,
      selectedNodeId: result.nodeId
    }
  };
}

function normalizeSnapshot(snapshot: OutlineSnapshot, createId: IdGenerator, now: Clock): OutlineSnapshot {
  const ensured = ensureEditableNode(snapshot.document, createId, now);
  const zoomNodeId = resolveExistingNodeId(ensured.document, snapshot.view.zoomNodeId, ROOT_ID);
  const selectedNodeId = resolveExistingNodeId(ensured.document, snapshot.view.selectedNodeId, ensured.nodeId);
  const selectionAnchorNodeId = resolveOptionalNodeId(ensured.document, snapshot.view.selectionAnchorNodeId);
  const selectionFocusNodeId = resolveOptionalNodeId(ensured.document, snapshot.view.selectionFocusNodeId);
  const cursors = normalizeSnapshotCursors(ensured.document, snapshot.view.cursors);
  return {
    document: ensured.document,
    view: {
      ...snapshot.view,
      zoomNodeId,
      selectedNodeId,
      selectionAnchorNodeId,
      selectionFocusNodeId,
      cursors: cursors && cursors.length > 0 ? cursors : undefined
    }
  };
}

function resolveExistingNodeId(document: OutlineSnapshot["document"], nodeId: NodeId | undefined, fallback: NodeId): NodeId {
  return nodeId && document.nodes[nodeId] ? nodeId : fallback;
}

function resolveOptionalNodeId(document: OutlineSnapshot["document"], nodeId: NodeId | undefined): NodeId | undefined {
  return nodeId && document.nodes[nodeId] ? nodeId : undefined;
}

function normalizeSnapshotCursors(
  document: OutlineSnapshot["document"],
  cursors: OutlineSnapshot["view"]["cursors"]
): OutlineSnapshot["view"]["cursors"] {
  return cursors
    ?.filter((cursor) => cursor.nodeId !== document.rootId && document.nodes[cursor.nodeId])
    .map((cursor) => ({
      nodeId: cursor.nodeId,
      offset: Math.max(0, Math.min(cursor.offset, document.nodes[cursor.nodeId].text.length))
    }));
}

function snapshotsEqual(left: OutlineSnapshot, right: OutlineSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRemoteNewer(record: { version: number; updatedAt: number }, state: RemoteSyncV2State): boolean {
  if (record.version !== state.version) {
    return record.version > state.version;
  }
  return record.updatedAt > state.updatedAt;
}

function isStateNewerThanRecord(state: RemoteSyncV2State, record: { version: number; updatedAt: number }): boolean {
  if (state.version !== record.version) {
    return state.version > record.version;
  }
  return state.updatedAt > record.updatedAt;
}

function cloneSnapshot(snapshot: OutlineSnapshot): OutlineSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as OutlineSnapshot;
}

function createPendingRemoteChange(
  remoteStore: RemoteStoreV2,
  previous: OutlineSnapshot,
  next: OutlineSnapshot,
  workspace: YjsWorkspace,
  clientId: string,
  baseVersion: number,
  version: number,
  updatedAt: number,
  canWritePatch: boolean
): PendingRemoteChange {
  const snapshotRecord = createRemoteSnapshotRecord(workspace, clientId, version, updatedAt);
  if (!canWritePatch || baseVersion <= 0 || !remoteStore.writeSnapshotPatch) {
    return { kind: "snapshot", record: snapshotRecord };
  }
  const patch = createSnapshotPatch(previous, next);
  if (isEmptySnapshotPatch(patch) || estimateEncodedPatchBytes(patch) >= snapshotRecord.state.byteLength) {
    return { kind: "snapshot", record: snapshotRecord };
  }
  return {
    kind: "patch",
    record: {
      baseVersion,
      version,
      clientId,
      updatedAt,
      patch
    }
  };
}
