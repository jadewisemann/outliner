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
  createRemoteSyncState,
  pullRemoteUpdates,
  pushLocalUpdate,
  subscribeRemoteUpdates,
  type RemoteSyncState
} from "../sync/remoteSync";
import type { RemoteStore, SyncStatus } from "../sync/syncTypes";
import {
  createYjsWorkspace,
  encodeState,
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
  remoteStore?: RemoteStore;
  createId: IdGenerator;
  createClientId?: IdGenerator;
  now: Clock;
};

export function useOutlineWorkspace({
  persistence,
  remoteStore,
  createId,
  createClientId = () => crypto.randomUUID(),
  now
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
  const remoteStateRef = useRef<RemoteSyncState>(createRemoteSyncState());
  const clientIdRef = useRef<string>(createClientId());
  const seqRef = useRef(0);
  const loadedRef = useRef(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(remoteStore ? "syncing" : "local-only");
  createIdRef.current = createId;
  nowRef.current = now;

  const persistSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      if (loadedRef.current) {
        void persistence.save(next);
      }
    },
    [persistence]
  );

  const setRemoteState = useCallback((state: RemoteSyncState) => {
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

  const publishSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      const normalized = normalizeSnapshot(next, createId, now);
      if (!snapshotsEqual(snapshotRef.current, normalized)) {
        undoStackRef.current = [...undoStackRef.current, snapshotRef.current];
        redoStackRef.current = [];
      }
      replaceSnapshot(normalized);
      if (remoteStore && loadedRef.current) {
        seqRef.current += 1;
        const update = {
          id: `${clientIdRef.current}:${seqRef.current}`,
          clientId: clientIdRef.current,
          seq: seqRef.current,
          update: encodeState(workspaceRef.current),
          createdAt: now()
        };
        setSyncStatus("syncing");
        pushLocalUpdate(remoteStore, update, remoteStateRef.current).then(setRemoteState, () => {
          setRemoteState({ ...remoteStateRef.current, status: "error" });
        });
      }
    },
    [createId, now, remoteStore, replaceSnapshot, setRemoteState]
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
      void persistence.save(snapshotRef.current);
      if (!remoteStore) {
        setSyncStatus("local-only");
        return;
      }
      setSyncStatus("syncing");
      pullRemoteUpdates(remoteStore, workspaceRef.current, remoteStateRef.current)
        .then((nextState) => {
          if (cancelled) {
            return;
          }
          setRemoteState(nextState);
          const remoteSnapshot = getYjsSnapshot(workspaceRef.current);
          if (remoteSnapshot) {
            const normalized = normalizeSnapshot(remoteSnapshot, createIdRef.current, nowRef.current);
            snapshotRef.current = normalized;
            setSnapshot(normalized);
            void persistence.save(normalized);
          }
          unsubscribeRemote = subscribeRemoteUpdates(
            remoteStore,
            workspaceRef.current,
            () => remoteStateRef.current,
            (nextRemoteState) => {
              setRemoteState(nextRemoteState);
              const subscribedSnapshot = getYjsSnapshot(workspaceRef.current);
              if (subscribedSnapshot) {
                const normalized = normalizeSnapshot(subscribedSnapshot, createIdRef.current, nowRef.current);
                snapshotRef.current = normalized;
                setSnapshot(normalized);
                void persistence.save(normalized);
              }
            }
          );
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
  }, [persistence, remoteStore, setRemoteState]);

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
