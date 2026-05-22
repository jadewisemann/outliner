import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyDocument,
  createInitialView,
  ensureEditableNode,
  ROOT_ID
} from "../domain/outline";
import type { Clock, IdGenerator, NodeId, OutlineSnapshot, StoredSnapshot, WorkspaceSnapshot } from "../domain/outlineTypes";
import {
  getActiveDocument,
  getActiveView,
  isWorkspaceSnapshot,
  toActiveOutlineSnapshot,
  toWorkspaceSnapshot
} from "../domain/workspace";
import type { LocalPersistence, SnapshotHistoryEntry } from "../persistence/localPersistence";
import {
  createRemoteSnapshotRecord,
  createRemoteSyncV2State,
  DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET,
  applyRemoteSnapshotRecord,
  writeRemoteSnapshotPatchV2,
  writeRemoteSnapshotV2
} from "../sync/remoteSyncV2";
import { applySnapshotPatchToStored, createSnapshotPatch, estimateEncodedPatchBytes, isEmptySnapshotPatch } from "../sync/snapshotPatch";
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
  workspaceSnapshot: WorkspaceSnapshot;
  activeSnapshot: OutlineSnapshot;
  snapshot: OutlineSnapshot;
  loaded: boolean;
  commitActiveOutline: (snapshot: OutlineSnapshot) => void;
  commitWorkspaceCommand: (workspace: WorkspaceSnapshot) => void;
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
  const initialWorkspaceSnapshot = useMemo(() => makeEmptyWorkspaceSnapshot(createId, now), [createId, now]);
  const workspaceRef = useRef<YjsWorkspace>(createYjsWorkspace(initialWorkspaceSnapshot));
  const snapshotRef = useRef<WorkspaceSnapshot>(initialWorkspaceSnapshot);
  const createIdRef = useRef(createId);
  const nowRef = useRef(now);
  const undoStackRef = useRef<WorkspaceSnapshot[]>([]);
  const redoStackRef = useRef<WorkspaceSnapshot[]>([]);
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
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState(initialWorkspaceSnapshot);
  const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(remoteStore ? "syncing" : "local-only");
  createIdRef.current = createId;
  nowRef.current = now;

  const saveSnapshot = useCallback(
    (next: WorkspaceSnapshot) => {
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
    (next: WorkspaceSnapshot, createdAt: number, reason: SnapshotHistoryEntry["reason"] = "autosave") => {
      const entry: SnapshotHistoryEntry = {
        id: `${createdAt}:${createIdRef.current()}`,
        createdAt,
        reason,
        snapshot: cloneWorkspaceSnapshot(next)
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
    (next: WorkspaceSnapshot) => {
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

  const replaceWorkspaceSnapshot = useCallback(
    (normalized: WorkspaceSnapshot) => {
      setYjsSnapshot(workspaceRef.current, normalized);
      workspaceRef.current.undoManager.stopCapturing();
      snapshotRef.current = normalized;
      setWorkspaceSnapshot(normalized);
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
      const normalized = normalizeWorkspaceSnapshot(remoteSnapshot, createIdRef.current, nowRef.current);
      snapshotRef.current = normalized;
      setWorkspaceSnapshot(normalized);
      await saveSnapshot(normalized);
    },
    [saveSnapshot]
  );

  const applyRemotePatchRecord = useCallback(
    async (record: RemoteSnapshotPatchRecord) => {
      const patched = applyActiveOutlinePatch(snapshotRef.current, record.patch);
      const normalized = normalizeWorkspaceSnapshot(patched, createIdRef.current, nowRef.current);
      setYjsSnapshot(workspaceRef.current, normalized);
      workspaceRef.current.undoManager.stopCapturing();
      snapshotRef.current = normalized;
      setWorkspaceSnapshot(normalized);
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
          await persistence.saveConflictBackup(cloneWorkspaceSnapshot(snapshotRef.current));
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
        await persistence.saveConflictBackup(cloneWorkspaceSnapshot(snapshotRef.current));
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

  const publishWorkspaceSnapshot = useCallback(
    (next: WorkspaceSnapshot, options: { undoable: boolean }) => {
      const previous = snapshotRef.current;
      const normalized = normalizeWorkspaceSnapshot(next, createId, now);
      if (options.undoable && !snapshotsEqual(previous, normalized)) {
        undoStackRef.current = [...undoStackRef.current, previous];
        redoStackRef.current = [];
        if (loadedRef.current) {
          void saveHistorySnapshot(normalized, now());
        }
      }
      replaceWorkspaceSnapshot(normalized);
      if (remoteStore && loadedRef.current) {
        const updatedAt = now();
        const baseVersion = remoteStateRef.current.version;
        const canWritePatch =
          !!remoteStore.writeSnapshotPatch &&
          !remoteStateRef.current.hasPendingLocalChanges &&
          !pendingRemoteRecordRef.current &&
          canCreateActiveOutlinePatch(previous, normalized);
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
            clientIdRef.current,
            baseVersion,
            version,
            updatedAt,
            canWritePatch
          )
        );
      }
    },
    [createId, now, remoteStore, replaceWorkspaceSnapshot, saveHistorySnapshot, scheduleRemoteSnapshot]
  );

  const commitActiveOutline = useCallback(
    (next: OutlineSnapshot) => {
      publishWorkspaceSnapshot(replaceActiveOutlineSnapshot(snapshotRef.current, next), { undoable: true });
    },
    [publishWorkspaceSnapshot]
  );

  const commitWorkspaceCommand = useCallback(
    (next: WorkspaceSnapshot) => {
      publishWorkspaceSnapshot(next, { undoable: false });
    },
    [publishWorkspaceSnapshot]
  );

  const restoreSnapshot = useCallback(
    (historyId: string) => {
      const entry = snapshotHistory.find((item) => item.id === historyId);
      if (!entry) {
        return;
      }
      publishWorkspaceSnapshot(normalizeWorkspaceSnapshot(entry.snapshot, createIdRef.current, nowRef.current), { undoable: true });
    },
    [publishWorkspaceSnapshot, snapshotHistory]
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribeRemote: (() => void) | undefined;
    persistence.load().then((persisted) => {
      if (cancelled) {
        return;
      }
      if (persisted) {
        const normalized = normalizeWorkspaceSnapshot(persisted, createIdRef.current, nowRef.current);
        workspaceRef.current = createYjsWorkspace(normalized);
        snapshotRef.current = normalized;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setWorkspaceSnapshot(normalized);
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
    replaceWorkspaceSnapshot(previous);
  }, [replaceWorkspaceSnapshot]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.at(-1);
    if (!next) {
      return;
    }
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, snapshotRef.current];
    replaceWorkspaceSnapshot(next);
  }, [replaceWorkspaceSnapshot]);

  const activeSnapshot = toActiveOutlineSnapshot(workspaceSnapshot);

  return {
    workspaceSnapshot,
    activeSnapshot,
    snapshot: activeSnapshot,
    loaded,
    commitActiveOutline,
    commitWorkspaceCommand,
    commitSnapshot: commitActiveOutline,
    snapshotHistory,
    restoreSnapshot,
    refreshSnapshotHistory,
    undo,
    redo,
    syncStatus
  };
}

function makeEmptyWorkspaceSnapshot(createId: IdGenerator, now: Clock): WorkspaceSnapshot {
  return normalizeWorkspaceSnapshot(makeEmptySnapshot(createId, now), createId, now);
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

function normalizeWorkspaceSnapshot(snapshot: StoredSnapshot, createId: IdGenerator, now: Clock): WorkspaceSnapshot {
  const workspace = isWorkspaceSnapshot(snapshot) ? snapshot : toWorkspaceSnapshot(snapshot, createId, now);
  const documents = { ...workspace.workspace.documents };
  const perDocument = { ...workspace.workspace.view.perDocument };
  for (const documentId of workspace.workspace.documentOrder) {
    const document = documents[documentId];
    if (!document) {
      continue;
    }
    const view = perDocument[documentId] ?? createInitialView(document);
    const normalized = normalizeSnapshot({ document, view }, createId, now);
    documents[documentId] = normalized.document;
    perDocument[documentId] = normalized.view;
  }
  const activeDocumentId = documents[workspace.workspace.activeDocumentId]
    ? workspace.workspace.activeDocumentId
    : workspace.workspace.documentOrder.find((documentId) => documents[documentId]) ?? workspace.workspace.activeDocumentId;
  return {
    ...workspace,
    workspace: {
      ...workspace.workspace,
      activeDocumentId,
      documents,
      view: {
        ...workspace.workspace.view,
        activeDocumentId,
        perDocument
      }
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

function replaceActiveOutlineSnapshot(workspace: WorkspaceSnapshot, snapshot: OutlineSnapshot): WorkspaceSnapshot {
  const activeDocumentId = workspace.workspace.activeDocumentId;
  return {
    ...workspace,
    workspace: {
      ...workspace.workspace,
      documents: {
        ...workspace.workspace.documents,
        [activeDocumentId]: snapshot.document
      },
      view: {
        ...workspace.workspace.view,
        activeDocumentId,
        perDocument: {
          ...workspace.workspace.view.perDocument,
          [activeDocumentId]: snapshot.view
        }
      },
      updatedAt: snapshot.document.updatedAt ?? workspace.workspace.updatedAt
    }
  };
}

function applyActiveOutlinePatch(workspace: WorkspaceSnapshot, patch: RemoteSnapshotPatchRecord["patch"]): WorkspaceSnapshot {
  return applySnapshotPatchToStored(workspace, patch) as WorkspaceSnapshot;
}

function canCreateActiveOutlinePatch(previous: WorkspaceSnapshot, next: WorkspaceSnapshot): boolean {
  if (previous.workspace.activeDocumentId !== next.workspace.activeDocumentId) {
    return false;
  }
  const documentId = previous.workspace.activeDocumentId;
  const previousDocumentIds = Object.keys(previous.workspace.documents).sort();
  const nextDocumentIds = Object.keys(next.workspace.documents).sort();
  if (JSON.stringify(previousDocumentIds) !== JSON.stringify(nextDocumentIds)) {
    return false;
  }
  for (const id of previousDocumentIds) {
    if (id !== documentId && JSON.stringify(previous.workspace.documents[id]) !== JSON.stringify(next.workspace.documents[id])) {
      return false;
    }
  }
  const previousViews = previous.workspace.view.perDocument;
  const nextViews = next.workspace.view.perDocument;
  for (const id of previousDocumentIds) {
    if (id !== documentId && JSON.stringify(previousViews[id]) !== JSON.stringify(nextViews[id])) {
      return false;
    }
  }
  return true;
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

function snapshotsEqual(left: WorkspaceSnapshot, right: WorkspaceSnapshot): boolean {
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

function cloneWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshot;
}

function createPendingRemoteChange(
  remoteStore: RemoteStoreV2,
  previous: WorkspaceSnapshot,
  next: WorkspaceSnapshot,
  clientId: string,
  baseVersion: number,
  version: number,
  updatedAt: number,
  canWritePatch: boolean
): PendingRemoteChange {
  const snapshotRecord = createRemoteSnapshotRecord(createYjsWorkspace(next), clientId, version, updatedAt);
  if (!canWritePatch || baseVersion <= 0 || !remoteStore.writeSnapshotPatch) {
    return { kind: "snapshot", record: snapshotRecord };
  }
  const patch = createSnapshotPatch(toActiveOutlineSnapshot(previous), toActiveOutlineSnapshot(next));
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
