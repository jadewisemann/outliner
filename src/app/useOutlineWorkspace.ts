import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyDocument,
  createInitialView,
  ensureEditableNode,
  ROOT_ID
} from "../domain/outline";
import type { Clock, IdGenerator, OutlineSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import {
  createRemoteSnapshotRecord,
  createRemoteSyncV2State,
  DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET,
  applyRemoteSnapshotRecord,
  writeRemoteSnapshotV2
} from "../sync/remoteSyncV2";
import type { RemoteSnapshotRecord, RemoteStoreV2, RemoteSyncV2State, SyncStatus } from "../sync/syncTypes";
import {
  createYjsWorkspace,
  getYjsSnapshot,
  setYjsSnapshot,
  type YjsWorkspace
} from "../sync/yjsAdapter";

export type OutlineWorkspaceRuntime = {
  snapshot: OutlineSnapshot;
  loaded: boolean;
  commitSnapshot: (snapshot: OutlineSnapshot) => void;
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
  const pendingRemoteRecordRef = useRef<RemoteSnapshotRecord | null>(null);
  const remoteDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const pullingRemoteRef = useRef(false);
  const remoteWriteTokenRef = useRef(0);
  const pullLatestRemoteSnapshotRef = useRef<() => Promise<void>>(async () => {});
  const loadedRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [snapshot, setSnapshot] = useState(initialSnapshot);
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
    const record = pendingRemoteRecordRef.current;
    const writeToken = (remoteWriteTokenRef.current += 1);
    writeRemoteSnapshotV2(remoteStore, record, maxRemoteSnapshotBytes).then((status) => {
      if (writeToken !== remoteWriteTokenRef.current) {
        return;
      }
      if (status === "synced") {
        if (pendingRemoteRecordRef.current === record) {
          pendingRemoteRecordRef.current = null;
        }
        if (isStateNewerThanRecord(remoteStateRef.current, record)) {
          return;
        }
        setRemoteState({
          status,
          version: record.version,
          updatedAt: record.updatedAt,
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
    (record: RemoteSnapshotRecord) => {
      pendingRemoteRecordRef.current = record;
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

  const pullLatestRemoteSnapshot = useCallback(async () => {
    if (!remoteStore) {
      return;
    }
    if (pullingRemoteRef.current) {
      return;
    }
    pullingRemoteRef.current = true;
    try {
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
  }, [applyRemoteRecord, persistence, remoteStore, setRemoteState]);
  pullLatestRemoteSnapshotRef.current = pullLatestRemoteSnapshot;

  const publishSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      const normalized = normalizeSnapshot(next, createId, now);
      if (!snapshotsEqual(snapshotRef.current, normalized)) {
        undoStackRef.current = [...undoStackRef.current, snapshotRef.current];
        redoStackRef.current = [];
      }
      replaceSnapshot(normalized);
      if (remoteStore && loadedRef.current) {
        const updatedAt = now();
        const version = Math.max(remoteStateRef.current.version, pendingRemoteRecordRef.current?.version ?? 0) + 1;
        const record = createRemoteSnapshotRecord(workspaceRef.current, clientIdRef.current, version, updatedAt);
        remoteStateRef.current = {
          status: "syncing",
          version,
          updatedAt,
          hasPendingLocalChanges: true
        };
        scheduleRemoteSnapshot(record);
      }
    },
    [createId, now, remoteStore, replaceSnapshot, scheduleRemoteSnapshot]
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribeRemote: (() => void) | undefined;
    persistence.load().then((persisted) => {
      if (cancelled) {
        return;
      }
      if (persisted) {
        const normalized = normalizeSnapshot(persisted, createIdRef.current, nowRef.current);
        workspaceRef.current = createYjsWorkspace(normalized);
        snapshotRef.current = normalized;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setSnapshot(normalized);
      }
      loadedRef.current = true;
      setLoaded(true);
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
  }, [persistence, pullLatestRemoteSnapshot, remoteStore, saveSnapshot, setRemoteState]);

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
  const zoomNodeId = ensured.document.nodes[snapshot.view.zoomNodeId] ? snapshot.view.zoomNodeId : ROOT_ID;
  const selectedNodeId =
    snapshot.view.selectedNodeId && ensured.document.nodes[snapshot.view.selectedNodeId]
      ? snapshot.view.selectedNodeId
      : ensured.nodeId;
  const selectionAnchorNodeId =
    snapshot.view.selectionAnchorNodeId && ensured.document.nodes[snapshot.view.selectionAnchorNodeId]
      ? snapshot.view.selectionAnchorNodeId
      : undefined;
  const selectionFocusNodeId =
    snapshot.view.selectionFocusNodeId && ensured.document.nodes[snapshot.view.selectionFocusNodeId]
      ? snapshot.view.selectionFocusNodeId
      : undefined;
  const cursors = snapshot.view.cursors
    ?.filter((cursor) => cursor.nodeId !== ensured.document.rootId && ensured.document.nodes[cursor.nodeId])
    .map((cursor) => ({
      nodeId: cursor.nodeId,
      offset: Math.max(0, Math.min(cursor.offset, ensured.document.nodes[cursor.nodeId].text.length))
    }));
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

function snapshotsEqual(left: OutlineSnapshot, right: OutlineSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRemoteNewer(record: RemoteSnapshotRecord, state: RemoteSyncV2State): boolean {
  if (record.version !== state.version) {
    return record.version > state.version;
  }
  return record.updatedAt > state.updatedAt;
}

function isStateNewerThanRecord(state: RemoteSyncV2State, record: RemoteSnapshotRecord): boolean {
  if (state.version !== record.version) {
    return state.version > record.version;
  }
  return state.updatedAt > record.updatedAt;
}

function cloneSnapshot(snapshot: OutlineSnapshot): OutlineSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as OutlineSnapshot;
}
