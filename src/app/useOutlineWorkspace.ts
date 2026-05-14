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
  createYjsWorkspace,
  setYjsSnapshot,
  type YjsWorkspace
} from "../sync/yjsAdapter";

export type OutlineWorkspaceRuntime = {
  snapshot: OutlineSnapshot;
  loaded: boolean;
  commitSnapshot: (snapshot: OutlineSnapshot) => void;
  undo: () => void;
  redo: () => void;
};

type UseOutlineWorkspaceOptions = {
  persistence: LocalPersistence;
  createId: IdGenerator;
  now: Clock;
};

export function useOutlineWorkspace({
  persistence,
  createId,
  now
}: UseOutlineWorkspaceOptions): OutlineWorkspaceRuntime {
  const initialSnapshot = useMemo(() => normalizeSnapshot(makeEmptySnapshot(createId, now), createId, now), [
    createId,
    now
  ]);
  const workspaceRef = useRef<YjsWorkspace>(createYjsWorkspace(initialSnapshot));
  const snapshotRef = useRef<OutlineSnapshot>(initialSnapshot);
  const undoStackRef = useRef<OutlineSnapshot[]>([]);
  const redoStackRef = useRef<OutlineSnapshot[]>([]);
  const loadedRef = useRef(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loaded, setLoaded] = useState(false);

  const persistSnapshot = useCallback(
    (next: OutlineSnapshot) => {
      if (loadedRef.current) {
        void persistence.save(next);
      }
    },
    [persistence]
  );

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
    },
    [createId, now, replaceSnapshot]
  );

  useEffect(() => {
    let cancelled = false;
    persistence.load().then((persisted) => {
      if (cancelled) {
        return;
      }
      if (persisted) {
        const normalized = normalizeSnapshot(persisted, createId, now);
        workspaceRef.current = createYjsWorkspace(normalized);
        snapshotRef.current = normalized;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setSnapshot(normalized);
      }
      loadedRef.current = true;
      setLoaded(true);
      void persistence.save(snapshotRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [persistence]);

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
    redo
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
  return {
    document: ensured.document,
    view: {
      ...snapshot.view,
      zoomNodeId,
      selectedNodeId,
      selectionAnchorNodeId,
      selectionFocusNodeId
    }
  };
}

function snapshotsEqual(left: OutlineSnapshot, right: OutlineSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
