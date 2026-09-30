import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as documents from "./documents";
import { createHistory } from "./history";
import { rememberDoc } from "./palette/palette";
import { useSync } from "./sync/useSync";
import { keyBetween } from "./shared/order";
import { usePersistence } from "./storage/usePersistence";
import { announceToOtherTabs } from "./sync/api/remote";
import { ancestors, ensureEditable, visibleRows, type Edit } from "./outline/tree";
import { parseQuery } from "./search/query";
import {
  docList,
  inboxDoc,
  makeDoc,
  makeFolder,
  makeSearch,
  payloadChanged,
  stamp,
  type Doc,
  type DocView,
  type Id,
  type Workspace
} from "./types";

type FocusRequest = { id: Id; caret: number | "end"; seq: number };

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
  const history = useRef(createHistory()).current;
  const focusSeq = useRef(0);

  const applyWorkspace = useCallback((next: Workspace) => {
    live.current = next;
    setWorkspace(next);
  }, []);

  // The load, the durability request and the debounced save. Their effects
  // run before the sync loop's. A save that landed doubles as the signal to
  // other tabs, which `useSync` watches for.
  const { saveFailed, storage } = usePersistence({ workspace, apply: applyWorkspace, onSaved: announceToOtherTabs });

  // Undo snapshots predate work this device did not author; replaying one
  // would delete the other device's rows — so an absorbed merge clears them.
  const onAbsorb = useCallback(() => history.clear(), [history]);
  const sync = useSync({ live, apply: applyWorkspace, onAbsorb, ready: workspace !== null });
  const { noteEdit, ...syncView } = sync;

  const commit = useCallback(
    (next: Workspace, previous: Workspace, options: EditOptions) => {
      if (!options.transient) history.record(previous, options.coalesceKey);
      // Zoom and focus live on this device only; they should not wake sync.
      if (payloadChanged(previous, next)) noteEdit();
      applyWorkspace(next);
    },
    [applyWorkspace, history, noteEdit]
  );

  const editWorkspace = useCallback(
    (mutator: (workspace: Workspace) => Workspace, options: EditOptions = {}) => {
      const current = live.current;
      if (!current) return;
      const next = mutator(current);
      if (next !== current) commit(next, current, options);
    },
    [commit]
  );

  /**
   * Moves the caret, and records where it went.
   *
   * The recording is the part that is easy to miss: `focus` is a one-shot
   * request that a row consumes, while `view.focusId` is "where the reader
   * is". Anything asking *which row* — the palette's row commands, the
   * restore-on-reload landing spot — reads the latter, so a caret moved by a
   * click or an arrow key has to update it too, not only one moved by an edit.
   */
  const requestFocus = useCallback(
    (id: Id, caret: number | "end" = "end") => {
      focusSeq.current += 1;
      setFocus({ id, caret, seq: focusSeq.current });
      editWorkspace(
        (current) => {
          const view = current.views[current.activeDocId];
          if (!view || view.focusId === id) return current;
          return { ...current, views: { ...current.views, [current.activeDocId]: { ...view, focusId: id } } };
        },
        { transient: true }
      );
    },
    [editWorkspace]
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
        views: focusId ? { ...current.views, [doc.id]: { ...current.views[doc.id], focusId } } : current.views
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

  const step = useCallback(
    (take: (current: Workspace) => Workspace | null) => {
      const current = live.current;
      if (!current) return;
      const next = take(current);
      if (!next) return;
      noteEdit();
      applyWorkspace(next);
    },
    [applyWorkspace, noteEdit]
  );

  const undo = useCallback(() => step((current) => history.undo(current)), [step, history]);
  const redo = useCallback(() => step((current) => history.redo(current)), [step, history]);

  /**
   * The keyboard table is workspace state, not device state, so a rebinding is
   * an ordinary edit: it stamps, it merges, it travels (ADR-0008). It is also
   * undoable, which is what anyone who has just cleared the wrong binding
   * expects of ⌘Z.
   */
  const setKeymap = useCallback(
    (keys: Record<string, string>) => {
      editWorkspace((current) => ({ ...current, keymap: { keys, edited: stamp() } }));
    },
    [editWorkspace]
  );

  /* ---------------------------------------------------------------- */
  /* documents                                                         */
  /* ---------------------------------------------------------------- */

  const docs = useMemo(() => {
    const lastSort = (current: Workspace) => docList(current).at(-1)?.sort ?? null;
    // Minted from `live.current` at call time, not from React state: an import
    // creates folders one after another in one tick, and each has to sort
    // after the one before.
    const nextSort = () => keyBetween(live.current ? lastSort(live.current) : null, null);

    return {
      create(title = "Untitled", parent: Id | null = null) {
        const doc = makeDoc(title, { sort: nextSort(), parent });
        editWorkspace((current) => documents.attach(current, doc));
        requestFocus(doc.nodes[doc.rootId].children[0]);
        return doc;
      },
      /** A folder is an ordinary document that holds no outline of its own. */
      createFolder(title = "새 폴더", parent: Id | null = null) {
        const folder = makeFolder(title, { sort: nextSort(), parent });
        editWorkspace((current) => ({ ...current, docs: { ...current.docs, [folder.id]: folder } }));
        return folder;
      },
      /** Marks where a quick capture lands, or clears the mark. */
      setInbox(id: Id | null) {
        editWorkspace((current) => documents.setInbox(current, id));
      },
      /**
       * Files shared text as a row in the inbox, and opens it there.
       *
       * Opening it is the point as much as the filing is: a capture the user
       * cannot see landing is a capture they have to go looking for.
       *
       * One edit, creating the document when nothing is marked — a workspace
       * carried over from before this field existed has no mark, and making the
       * inbox visibly, once, beats appending to whatever happened to be on
       * screen.
       */
      capture(text: string) {
        const current = live.current;
        if (!current) return;
        const target = inboxDoc(current) ?? makeDoc("인박스", { sort: nextSort(), inbox: true });
        editWorkspace((now) => documents.capture(now, target, text));

        const landed = live.current?.docs[target.id];
        const row = landed?.nodes[landed.rootId].children.at(-1);
        if (row) requestFocus(row);
      },
      toggleBookmark(id: Id) {
        editWorkspace((current) => documents.toggleBookmark(current, id));
      },
      /** Files a document (or folder) into `parent`, or back to the top level. */
      moveInto(id: Id, parent: Id | null) {
        editWorkspace((current) => documents.moveInto(current, id, parent));
      },
      add(doc: Doc) {
        const sort = nextSort();
        editWorkspace((current) => documents.attach(current, { ...doc, sort }));
      },
      rename(id: Id, title: string) {
        editWorkspace((current) => documents.rename(current, id, title));
      },
      /** Into the trash, where it stays restorable until the window runs out. */
      remove(id: Id) {
        editWorkspace((current) => documents.remove(current, id));
      },
      restore(id: Id) {
        editWorkspace((current) => documents.restore(current, id));
      },
      /** The one delete that cannot be undone; the file leaves the remote too. */
      purge(id: Id) {
        editWorkspace((current) => documents.purge(current, id));
      },
      /** Puts a past version of a document back, re-stamped so that the next sync keeps it. */
      restoreVersion(past: Doc) {
        editWorkspace((current) => documents.restoreVersion(current, past));
      },
      createSearch(title: string, query: string) {
        const saved = makeSearch(title, query, { sort: nextSort() });
        editWorkspace((current) => ({ ...current, docs: { ...current.docs, [saved.id]: saved } }));
        return saved;
      },
      select(id: Id, options: { zoomId?: Id; focusId?: Id } = {}) {
        editWorkspace((current) => documents.select(current, id, options), { transient: true });
        rememberDoc(id);
        if (options.focusId) requestFocus(options.focusId);
      },
      /** Drops `id` at `toIndex` among the children of `parent`. */
      reorder(id: Id, parent: Id | null, toIndex: number) {
        editWorkspace((current) => documents.reorder(current, id, parent, toIndex));
      },
      replaceAll(next: Workspace) {
        editWorkspace(() => next);
      },
      /** Moves a row and everything under it into another document, ids and all. */
      moveToDoc(nodeId: Id, targetDocId: Id) {
        editWorkspace((current) => documents.moveToDoc(current, nodeId, targetDocId));
      }
    };
  }, [editWorkspace, requestFocus]);

  /* ---------------------------------------------------------------- */

  const doc = workspace ? workspace.docs[workspace.activeDocId] : null;
  const stored = workspace && doc ? workspace.views[doc.id] : null;
  const view: DocView = {
    zoomId: doc && stored && doc.nodes[stored.zoomId] ? stored.zoomId : doc?.rootId ?? "",
    focusId: stored?.focusId ?? null,
    hideCompleted: stored?.hideCompleted ?? false,
    hideNotes: stored?.hideNotes ?? false,
    filter: stored?.filter ?? ""
  };
  const zoomId = view.zoomId;
  const { filter, hideCompleted } = view;

  const rows = useMemo(() => {
    if (!doc || !zoomId) return [];
    const predicate = parseQuery(filter);
    return visibleRows(doc, zoomId, {
      hideCompleted,
      match: predicate
        ? (node) =>
            predicate({
              node,
              trail: ancestors(doc, node.id)
                .filter((id) => id !== doc.rootId)
                .map((id) => doc.nodes[id]?.text ?? "")
            })
        : undefined
    });
  }, [doc, zoomId, filter, hideCompleted]);

  // A zoomed node with nothing under it would be a dead end — give it a row.
  // An empty *filter* result is not that: the rows are there, just not shown,
  // and adding one would put a blank line into the document every keystroke.
  useEffect(() => {
    if (doc && zoomId && rows.length === 0 && filter === "" && !hideCompleted) {
      edit((current) => ensureEditable(current, zoomId), { transient: true });
    }
  }, [doc, zoomId, rows.length, filter, hideCompleted, edit]);


  return {
    ready: workspace != null && doc != null,
    workspace: workspace as Workspace,
    doc: doc as Doc,
    view,
    rows,
    focus,
    edit,
    editWorkspace,
    setView,
    requestFocus,
    undo,
    redo,
    docs,
    /** The chosen keyboard table, or null while nobody has chosen one. */
    keymap: workspace?.keymap ?? null,
    setKeymap,
    /** The sync loop's surface, less the edit counter that `commit` and `step` feed. */
    sync: syncView,
    saveFailed,
    /**
     * What the browser promises about local storage, and the way to ask again
     * — Firefox answers with a prompt, which needs a button behind it.
     */
    storage
  };
}

