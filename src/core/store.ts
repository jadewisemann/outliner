import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadWorkspace, saveWorkspace } from "./persist";
import { ensureEditable, visibleRows, type Edit } from "./tree";
import { makeDoc, makeWorkspace, type Doc, type DocView, type Id, type Row, type Workspace } from "./types";

export type FocusRequest = { id: Id; caret: number | "end"; seq: number };

const UNDO_LIMIT = 200;
const COALESCE_MS = 700;
const SAVE_DEBOUNCE_MS = 400;

type EditOptions = {
  /** Consecutive edits sharing a key within a short window collapse into one undo step. */
  coalesceKey?: string;
  /** Skip the undo stack entirely — for view-only changes. */
  transient?: boolean;
};

export type Store = ReturnType<typeof useStore>;

export function useStore() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  // Mirrors `workspace` so several edits dispatched in one tick compose
  // instead of overwriting each other.
  const live = useRef<Workspace | null>(null);
  const past = useRef<Workspace[]>([]);
  const future = useRef<Workspace[]>([]);
  const lastEdit = useRef<{ key: string; at: number } | null>(null);
  const focusSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadWorkspace().then((loaded) => {
      if (cancelled) return;
      const next = loaded && loaded.version === 3 ? loaded : makeWorkspace();
      live.current = next;
      setWorkspace(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persistence. The in-memory workspace is the source of truth, and
  // a flush on unload covers the tab being closed mid-window.
  useEffect(() => {
    if (!workspace) return;
    const timer = setTimeout(() => void saveWorkspace(workspace), SAVE_DEBOUNCE_MS);
    const flush = () => void saveWorkspace(workspace);
    window.addEventListener("beforeunload", flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeunload", flush);
    };
  }, [workspace]);

  const requestFocus = useCallback((id: Id, caret: number | "end" = "end") => {
    focusSeq.current += 1;
    setFocus({ id, caret, seq: focusSeq.current });
  }, []);

  const commit = useCallback((next: Workspace, previous: Workspace, options: EditOptions) => {
    if (!options.transient) {
      const now = Date.now();
      const coalesces =
        options.coalesceKey !== undefined &&
        lastEdit.current?.key === options.coalesceKey &&
        now - lastEdit.current.at < COALESCE_MS;
      if (!coalesces) past.current = [...past.current.slice(-(UNDO_LIMIT - 1)), previous];
      lastEdit.current = options.coalesceKey ? { key: options.coalesceKey, at: now } : null;
      future.current = [];
    }
    live.current = next;
    setWorkspace(next);
  }, []);

  const editWorkspace = useCallback(
    (mutator: (workspace: Workspace) => Workspace, options: EditOptions = {}) => {
      const current = live.current;
      if (!current) return;
      const next = mutator(current);
      if (next !== current) commit(next, current, options);
    },
    [commit]
  );

  /** Applies a pure tree edit to the active document, honouring its focus request. */
  const edit = useCallback(
    (mutator: (doc: Doc) => Edit | Doc, options: EditOptions = {}) => {
      const current = live.current;
      if (!current) return;
      const doc = current.docs[current.activeDocId];
      const result = mutator(doc);
      const nextDoc = "doc" in result ? result.doc : result;
      if (nextDoc === doc) return;

      const focusId = "focusId" in result ? result.focusId : undefined;
      const next: Workspace = {
        ...current,
        docs: { ...current.docs, [doc.id]: nextDoc },
        views: focusId
          ? { ...current.views, [doc.id]: { ...current.views[doc.id], focusId } }
          : current.views
      };
      commit(next, current, options);
      const caret = "caret" in result ? result.caret : undefined;
      if (focusId) requestFocus(focusId, caret ?? "end");
    },
    [commit, requestFocus]
  );

  const setView = useCallback(
    (patch: Partial<DocView>) => {
      editWorkspace(
        (current) => ({
          ...current,
          views: { ...current.views, [current.activeDocId]: { ...current.views[current.activeDocId], ...patch } }
        }),
        { transient: true }
      );
    },
    [editWorkspace]
  );

  const undo = useCallback(() => {
    const current = live.current;
    const previous = past.current.pop();
    if (!current || !previous) return;
    future.current = [...future.current, current];
    lastEdit.current = null;
    live.current = previous;
    setWorkspace(previous);
  }, []);

  const redo = useCallback(() => {
    const current = live.current;
    const next = future.current.pop();
    if (!current || !next) return;
    past.current = [...past.current, current];
    lastEdit.current = null;
    live.current = next;
    setWorkspace(next);
  }, []);

  const docs = useMemo(() => {
    const attach = (current: Workspace, doc: Doc): Workspace => ({
      ...current,
      docs: { ...current.docs, [doc.id]: doc },
      docOrder: [...current.docOrder, doc.id],
      activeDocId: doc.id,
      views: { ...current.views, [doc.id]: { zoomId: doc.rootId, focusId: doc.nodes[doc.rootId].children[0] ?? null } }
    });

    return {
      create(title = "Untitled") {
        const doc = makeDoc(title);
        editWorkspace((current) => attach(current, doc));
        requestFocus(doc.nodes[doc.rootId].children[0]);
        return doc;
      },
      add(doc: Doc) {
        editWorkspace((current) => attach(current, doc));
      },
      rename(id: Id, title: string) {
        editWorkspace((current) =>
          current.docs[id] ? { ...current, docs: { ...current.docs, [id]: { ...current.docs[id], title } } } : current
        );
      },
      remove(id: Id) {
        editWorkspace((current) => {
          const order = current.docOrder.filter((docId) => docId !== id);
          if (order.length === 0) return current;
          const remaining = { ...current.docs };
          delete remaining[id];
          const views = { ...current.views };
          delete views[id];
          return {
            ...current,
            docs: remaining,
            docOrder: order,
            views,
            activeDocId: current.activeDocId === id ? order[0] : current.activeDocId
          };
        });
      },
      select(id: Id, options: { zoomId?: Id; focusId?: Id } = {}) {
        editWorkspace((current) => {
          const target = current.docs[id];
          if (!target) return current;
          const existing = current.views[id] ?? { zoomId: target.rootId, focusId: null };
          return {
            ...current,
            activeDocId: id,
            views: {
              ...current.views,
              [id]: {
                zoomId: options.zoomId ?? existing.zoomId,
                focusId: options.focusId ?? existing.focusId
              }
            }
          };
        }, { transient: true });
        if (options.focusId) requestFocus(options.focusId);
      },
      reorder(from: number, to: number) {
        editWorkspace((current) => {
          const order = current.docOrder.slice();
          const [moved] = order.splice(from, 1);
          order.splice(to, 0, moved);
          return { ...current, docOrder: order };
        });
      },
      replaceAll(next: Workspace) {
        editWorkspace(() => next);
      }
    };
  }, [editWorkspace, requestFocus]);

  const doc = workspace ? workspace.docs[workspace.activeDocId] : null;
  const stored = workspace && doc ? workspace.views[doc.id] : null;
  const view: DocView | null =
    doc && stored ? { ...stored, zoomId: doc.nodes[stored.zoomId] ? stored.zoomId : doc.rootId } : null;
  const zoomId = view?.zoomId;
  const rows = useMemo(() => (doc && zoomId ? visibleRows(doc, zoomId) : []), [doc, zoomId]);

  // A zoomed node with nothing under it would be a dead end — give it a row.
  useEffect(() => {
    if (doc && zoomId && rows.length === 0) edit((current) => ensureEditable(current, zoomId), { transient: true });
  }, [doc, zoomId, rows.length, edit]);

  return {
    ready: workspace !== null,
    workspace: workspace as Workspace,
    doc: doc as Doc,
    view: view as DocView,
    rows,
    focus,
    edit,
    editWorkspace,
    setView,
    requestFocus,
    undo,
    redo,
    docs
  };
}
