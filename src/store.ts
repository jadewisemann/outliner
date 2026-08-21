import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createHistory } from "./history";
import { rememberDoc } from "./palette/palette";
import { useSync } from "./sync/useSync";
import { keyBetween } from "./shared/order";
import { loadWorkspace, requestPersistence, saveWorkspace, type StorageGrade } from "./storage/persist";
import { announceToOtherTabs } from "./sync/api/remote";
import {
  ancestors,
  appendChild,
  cutSubtree,
  ensureEditable,
  graftSubtree,
  patchNode,
  visibleRows,
  type Edit
} from "./outline/tree";
import { parseQuery } from "./search/query";
import {
  docChildren,
  docList,
  inboxDoc,
  makeDoc,
  makeFolder,
  makeSearch,
  makeView,
  makeWorkspace,
  realDocs,
  stamp,
  type Doc,
  type DocView,
  type Id,
  type Workspace
} from "./types";

type FocusRequest = { id: Id; caret: number | "end"; seq: number };

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
  const [saveFailed, setSaveFailed] = useState(false);
  const [storageGrade, setStorageGrade] = useState<StorageGrade>("unknown");

  // Mirrors `workspace` so several edits dispatched in one tick compose
  // instead of overwriting each other.
  const live = useRef<Workspace | null>(null);
  const history = useRef(createHistory()).current;
  const focusSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadWorkspace().then((loaded) => {
      if (cancelled) return;
      const next = loaded && Object.keys(loaded.docs).length > 0 ? loaded : makeWorkspace();
      live.current = next;
      setWorkspace(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Asked on every start rather than once: the browser's answer changes as the
  // user commits to the app (installs it, bookmarks it, keeps coming back), so
  // a no from the first visit is not the standing answer.
  const askForDurableStorage = useCallback(() => void requestPersistence().then(setStorageGrade), []);
  useEffect(askForDurableStorage, [askForDurableStorage]);

  // Debounced persistence, which doubles as the signal to other tabs. One
  // timer, driven by actual changes rather than a polling flag.
  useEffect(() => {
    if (!workspace) return;
    const timer = setTimeout(() => {
      void saveWorkspace(workspace).then(() => {
        setSaveFailed(false);
        announceToOtherTabs();
      }, () => setSaveFailed(true));
    }, SAVE_DEBOUNCE_MS);
    const flush = () => void saveWorkspace(workspace);
    window.addEventListener("beforeunload", flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeunload", flush);
    };
  }, [workspace]);

  const applyWorkspace = useCallback((next: Workspace) => {
    live.current = next;
    setWorkspace(next);
  }, []);

  // Undo snapshots predate work this device did not author; replaying one
  // would delete the other device's rows — so an absorbed merge clears them.
  const onAbsorb = useCallback(() => history.clear(), [history]);
  const sync = useSync({ live, apply: applyWorkspace, onAbsorb, ready: workspace !== null });

  const commit = useCallback(
    (next: Workspace, previous: Workspace, options: EditOptions) => {
      if (!options.transient) history.record(previous, options.coalesceKey);
      // Zoom and focus live on this device only; they should not wake sync.
      if (next.docs !== previous.docs || next.graves !== previous.graves) sync.noteEdit();
      applyWorkspace(next);
    },
    [applyWorkspace, history, sync.noteEdit]
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
      sync.noteEdit();
      applyWorkspace(next);
    },
    [applyWorkspace, sync.noteEdit]
  );

  const undo = useCallback(() => step((current) => history.undo(current)), [step, history]);
  const redo = useCallback(() => step((current) => history.redo(current)), [step, history]);

  /* ---------------------------------------------------------------- */
  /* documents                                                         */
  /* ---------------------------------------------------------------- */

  const docs = useMemo(() => {
    const attach = (current: Workspace, doc: Doc): Workspace => ({
      ...current,
      docs: { ...current.docs, [doc.id]: doc },
      activeDocId: doc.id,
      views: { ...current.views, [doc.id]: makeView(doc) }
    });
    const lastSort = (current: Workspace) => docList(current).at(-1)?.sort ?? null;

    return {
      create(title = "Untitled", parent: Id | null = null) {
        const current = live.current;
        const doc = makeDoc(title, { sort: keyBetween(current ? lastSort(current) : null, null), parent });
        editWorkspace((now) => attach(now, doc));
        requestFocus(doc.nodes[doc.rootId].children[0]);
        return doc;
      },
      /** A folder is an ordinary document that holds no outline of its own. */
      createFolder(title = "새 폴더", parent: Id | null = null) {
        const current = live.current;
        const folder = makeFolder(title, { sort: keyBetween(current ? lastSort(current) : null, null), parent });
        editWorkspace((now) => ({ ...now, docs: { ...now.docs, [folder.id]: folder } }));
        return folder;
      },
      /**
       * Marks where a quick capture lands, or clears the mark.
       *
       * Only one document is the inbox, so setting it unmarks the others in the
       * same edit — otherwise two marks would sit here waiting for `inboxDoc`
       * to break a tie that this device could have avoided making. Folders and
       * saved searches cannot hold an outline, so they cannot hold a capture.
       */
      setInbox(id: Id | null) {
        editWorkspace((current) => {
          if (id !== null && current.docs[id]?.kind !== "doc") return current;
          const now = stamp();
          const docs = { ...current.docs };
          let changed = false;
          for (const doc of Object.values(current.docs)) {
            const wanted = doc.id === id;
            if (doc.inbox === wanted) continue;
            docs[doc.id] = { ...doc, inbox: wanted, titleEdited: now };
            changed = true;
          }
          return changed ? { ...current, docs } : current;
        });
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
       * screen. `appendChild` writes into the empty first row of a document it
       * just made rather than adding a second one.
       */
      capture(text: string) {
        const current = live.current;
        if (!current) return;
        const target =
          inboxDoc(current) ?? makeDoc("인박스", { sort: keyBetween(lastSort(current), null), inbox: true });

        editWorkspace((now) => {
          const doc = now.docs[target.id] ?? target;
          const added = appendChild(doc, doc.rootId);
          if (!added.focusId) return now;
          const next = patchNode(added.doc, added.focusId, { text });
          return {
            ...now,
            docs: { ...now.docs, [next.id]: next },
            activeDocId: next.id,
            views: now.views[next.id] ? now.views : { ...now.views, [next.id]: makeView(next) }
          };
        });

        const landed = live.current?.docs[target.id];
        const row = landed?.nodes[landed.rootId].children.at(-1);
        if (row) requestFocus(row);
      },
      toggleBookmark(id: Id) {
        editWorkspace((current) =>
          current.docs[id]
            ? {
                ...current,
                docs: {
                  ...current.docs,
                  [id]: { ...current.docs[id], bookmarked: !current.docs[id].bookmarked, titleEdited: stamp() }
                }
              }
            : current
        );
      },
      /** Files a document (or folder) into `parent`, or back to the top level. */
      moveInto(id: Id, parent: Id | null) {
        editWorkspace((current) => {
          const doc = current.docs[id];
          // A folder cannot be filed into itself or into its own descendant.
          if (!doc || id === parent) return current;
          for (let cursor = parent; cursor; cursor = current.docs[cursor]?.parent ?? null) {
            if (cursor === id) return current;
          }
          return { ...current, docs: { ...current.docs, [id]: { ...doc, parent, moved: stamp() } } };
        });
      },
      add(doc: Doc) {
        const current = live.current;
        editWorkspace((now) => attach(now, { ...doc, sort: keyBetween(current ? lastSort(current) : null, null) }));
      },
      rename(id: Id, title: string) {
        editWorkspace((current) =>
          current.docs[id]
            ? { ...current, docs: { ...current.docs, [id]: { ...current.docs[id], title, titleEdited: stamp() } } }
            : current
        );
      },
      /** Into the trash, where it stays restorable until the window runs out. */
      remove(id: Id) {
        editWorkspace((current) => {
          const doomed = current.docs[id];
          if (!doomed || doomed.deleted) return current;
          // The app always has to have a document open, so the last live one
          // cannot go. Folders and saved searches do not count towards that.
          const survivors = realDocs(current).filter((doc) => doc.id !== id);
          if (doomed.kind === "doc" && survivors.length === 0) return current;
          const now = stamp();
          return {
            ...current,
            docs: { ...current.docs, [id]: { ...doomed, deleted: now, titleEdited: now } },
            activeDocId: current.activeDocId === id ? survivors[0].id : current.activeDocId
          };
        });
      },
      restore(id: Id) {
        editWorkspace((current) => {
          const doc = current.docs[id];
          if (!doc?.deleted) return current;
          const now = stamp();
          return { ...current, docs: { ...current.docs, [id]: { ...doc, deleted: null, titleEdited: now } } };
        });
      },
      /** The one delete that cannot be undone; the file leaves the remote too. */
      purge(id: Id) {
        editWorkspace((current) => {
          const remaining = { ...current.docs };
          delete remaining[id];
          const views = { ...current.views };
          delete views[id];
          return { ...current, docs: remaining, graves: { ...current.graves, [id]: stamp() }, views };
        });
      },
      /**
       * Puts a past version of a document back.
       *
       * Every node is re-stamped, for the same reason undo re-stamps rather
       * than restoring a snapshot: an old stamp loses the next merge, and the
       * restore would be quietly undone by the first sync. Gravestones for the
       * rows coming back are dropped, or they would bury them again.
       */
      restoreVersion(past: Doc) {
        editWorkspace((current) => {
          const live = current.docs[past.id];
          if (!live) return current;
          const now = stamp();
          const nodes: Record<Id, Doc["nodes"][string]> = {};
          for (const [id, node] of Object.entries(past.nodes)) nodes[id] = { ...node, edited: now, moved: now };

          const graves = { ...live.graves };
          for (const id of Object.keys(nodes)) delete graves[id];
          // Rows the live document has that the past one did not are gone as
          // of this restore, and need stones so other devices agree.
          for (const id of Object.keys(live.nodes)) if (!nodes[id]) graves[id] = now;

          return {
            ...current,
            docs: {
              ...current.docs,
              [past.id]: { ...live, rootId: past.rootId, nodes, graves, titleEdited: now, title: past.title }
            }
          };
        });
      },
      createSearch(title: string, query: string) {
        const current = live.current;
        const saved = makeSearch(title, query, { sort: keyBetween(current ? lastSort(current) : null, null) });
        editWorkspace((now) => ({ ...now, docs: { ...now.docs, [saved.id]: saved } }));
        return saved;
      },
      select(id: Id, options: { zoomId?: Id; focusId?: Id } = {}) {
        editWorkspace(
          (current) => {
            const target = current.docs[id];
            if (!target || target.kind !== "doc" || target.deleted) return current;
            const existing = current.views[id] ?? makeView(target);
            return {
              ...current,
              activeDocId: id,
              views: {
                ...current.views,
                [id]: { ...existing, zoomId: options.zoomId ?? existing.zoomId, focusId: options.focusId ?? existing.focusId }
              }
            };
          },
          { transient: true }
        );
        rememberDoc(id);
        if (options.focusId) requestFocus(options.focusId);
      },
      /** Drops `id` at `toIndex` among the children of `parent`. */
      reorder(id: Id, parent: Id | null, toIndex: number) {
        editWorkspace((current) => {
          const doc = current.docs[id];
          if (!doc || id === parent) return current;
          // Same guard as `moveInto`: a folder cannot end up inside itself.
          for (let cursor = parent; cursor; cursor = current.docs[cursor]?.parent ?? null) {
            if (cursor === id) return current;
          }
          const ordered = docChildren(current, parent).filter((entry) => entry.id !== id);
          const at = Math.max(0, Math.min(toIndex, ordered.length));
          const before = ordered[at - 1]?.sort ?? null;
          const after = ordered[at]?.sort ?? null;
          const sort = keyBetween(before, before !== null && after !== null && before >= after ? null : after);
          return { ...current, docs: { ...current.docs, [id]: { ...doc, parent, sort, moved: stamp() } } };
        });
      },
      replaceAll(next: Workspace) {
        editWorkspace(() => next);
      },
      /**
       * Moves a row and everything under it into another document, ids and all.
       *
       * Both documents change in one edit, but they are two files on the
       * remote, so a device that pulls between the two writes sees the row in
       * both places. It converges on the next round — the merge does not care
       * about order — and `sync/api/remote` pushes the document that did the burying
       * first, which makes that window as small as it can be.
       */
      moveToDoc(nodeId: Id, targetDocId: Id) {
        editWorkspace((current) => {
          const source = current.docs[current.activeDocId];
          const target = current.docs[targetDocId];
          if (!source || !target || target.kind === "folder" || source.id === target.id) return current;

          const cut = cutSubtree(source, nodeId);
          if (!cut) return current;
          const grafted = graftSubtree(target, target.rootId, cut.taken);
          return { ...current, docs: { ...current.docs, [source.id]: cut.doc, [target.id]: grafted.doc } };
        });
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
    sync: {
      status: sync.status,
      config: sync.config,
      setConfig: sync.setConfig,
      now: sync.now,
      /** Present only on a backend that keeps history — today, GitHub. */
      history: sync.history,
      /** Likewise for somewhere to put attachment bytes. */
      files: sync.files
    },
    saveFailed,
    /**
     * What the browser promises about local storage, and the way to ask again
     * — Firefox answers with a prompt, which needs a button behind it.
     */
    storage: { grade: storageGrade, request: askForDurableStorage }
  };
}
