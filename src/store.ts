import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createHistory } from "./history";
import { rememberDoc } from "./palette/palette";
import { changedBy, mergeWorkspace } from "./sync/merge";
import { isLocked } from "./sync/api/cipher";
import { keyBetween } from "./shared/order";
import { loadWorkspace, saveWorkspace } from "./storage/persist";
import {
  announceToOtherTabs,
  configKey,
  createBackend,
  hasSynced,
  loadSyncConfig,
  markSynced,
  saveSyncConfig,
  watchOtherTabs,
  type SyncConfig,
  type SyncStatus
} from "./sync/api/remote";
import { ancestors, ensureEditable, visibleRows, type Edit } from "./outline/tree";
import { parseQuery } from "./search/query";
import {
  docChildren,
  docList,
  makeDoc,
  makeFolder,
  makeView,
  makeWorkspace,
  stamp,
  type Doc,
  type DocView,
  type Id,
  type SyncPayload,
  type Workspace
} from "./types";

type FocusRequest = { id: Id; caret: number | "end"; seq: number };

const SAVE_DEBOUNCE_MS = 400;
/** Longest gap between retries after the endpoint starts failing. */
const MAX_BACKOFF_MS = 5 * 60_000;

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
  const [syncConfig, setSyncConfigState] = useState<SyncConfig | null>(() => loadSyncConfig());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (loadSyncConfig() ? "idle" : "off"));
  const [saveFailed, setSaveFailed] = useState(false);

  // Mirrors `workspace` so several edits dispatched in one tick compose
  // instead of overwriting each other.
  const live = useRef<Workspace | null>(null);
  const history = useRef(createHistory()).current;
  const focusSeq = useRef(0);

  /** Counts edits worth syncing, so a push knows exactly what it covered. */
  const edits = useRef(0);
  const pushed = useRef(0);

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

  const requestFocus = useCallback((id: Id, caret: number | "end" = "end") => {
    focusSeq.current += 1;
    setFocus({ id, caret, seq: focusSeq.current });
  }, []);

  const applyWorkspace = useCallback((next: Workspace) => {
    live.current = next;
    setWorkspace(next);
  }, []);

  const commit = useCallback(
    (next: Workspace, previous: Workspace, options: EditOptions) => {
      if (!options.transient) history.record(previous, options.coalesceKey);
      // Zoom and focus live on this device only; they should not wake sync.
      if (next.docs !== previous.docs || next.graves !== previous.graves) edits.current += 1;
      applyWorkspace(next);
    },
    [applyWorkspace, history]
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
      edits.current += 1;
      applyWorkspace(next);
    },
    [applyWorkspace]
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
      remove(id: Id) {
        editWorkspace((current) => {
          const remaining = { ...current.docs };
          delete remaining[id];
          // The app always has to have a document open, so the last real one
          // cannot go. Folders do not count towards that.
          const survivors = Object.values(remaining).filter((doc) => doc.kind === "doc");
          if (survivors.length === 0) return current;
          const views = { ...current.views };
          delete views[id];
          return {
            ...current,
            docs: remaining,
            graves: { ...current.graves, [id]: stamp() },
            views,
            activeDocId: current.activeDocId === id ? survivors[0].id : current.activeDocId
          };
        });
      },
      select(id: Id, options: { zoomId?: Id; focusId?: Id } = {}) {
        editWorkspace(
          (current) => {
            const target = current.docs[id];
            if (!target || target.kind === "folder") return current;
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
      }
    };
  }, [editWorkspace, requestFocus]);

  /* ---------------------------------------------------------------- */
  /* sync                                                              */
  /* ---------------------------------------------------------------- */

  const backend = useMemo(() => (syncConfig ? createBackend(syncConfig) : null), [syncConfig]);
  const running = useRef(false);
  const failures = useRef(0);
  const retryAfter = useRef(0);

  /** Applies a merge result, but only when it actually brought something in. */
  const absorb = useCallback(
    (payload: SyncPayload) => {
      const current = live.current;
      if (!current || !changedBy({ docs: current.docs, graves: current.graves }, payload)) return;
      // Undo snapshots predate work this device did not author; replaying one
      // would delete the other device's rows.
      history.clear();

      const active = payload.docs[current.activeDocId] ? current.activeDocId : Object.keys(payload.docs)[0];
      if (!active) return;
      const views = { ...current.views };
      for (const id of Object.keys(views)) if (!payload.docs[id]) delete views[id];
      applyWorkspace({ ...current, ...payload, activeDocId: active, views });
    },
    [applyWorkspace, history]
  );

  const syncNow = useCallback(async () => {
    if (!backend || running.current || !live.current || Date.now() < retryAfter.current) return;
    running.current = true;
    setSyncStatus("syncing");
    try {
      // Pull, merge into whatever is local right now, then offer the result
      // back. A lost race just means the next round settles it.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const stored = await backend.pull();
        if (!stored) break;
        absorb(
          mergeWorkspace(payloadOf(live.current!), stored.payload, {
            // Nothing typed here yet, and never synced with this remote:
            // this device is joining, not contributing a blank document.
            adoptRemote: edits.current === 0 && !hasSynced(configKey(syncConfig!))
          })
        );

        // Nothing of ours is unpushed and the remote has a version, so a push
        // would only echo back what it already holds. On GitHub every push is
        // a commit — an idle device must not leave a trail of empty ones.
        if (edits.current === pushed.current && stored.version !== null) break;

        // Captured before the request: anything typed during the round trip
        // must stay pending rather than be marked as sent.
        const covered = edits.current;
        const accepted = await backend.push(payloadOf(live.current!), stored.version);
        if (accepted !== null) {
          pushed.current = covered;
          break;
        }
      }
      failures.current = 0;
      retryAfter.current = 0;
      markSynced(configKey(syncConfig!));
      setSyncStatus("idle");
      void saveWorkspace(live.current!);
    } catch (error) {
      if (isLocked(error)) {
        // The remote holds bytes this device cannot read. Retrying is pointless
        // until the passphrase changes — and pushing would be worse than
        // pointless, since it would write over notes nobody here can recover.
        retryAfter.current = Date.now() + MAX_BACKOFF_MS;
        setSyncStatus("locked");
        return;
      }
      // Back off, or a dead endpoint means a failing request every 1.5s forever.
      failures.current += 1;
      retryAfter.current = Date.now() + Math.min(2 ** failures.current * 1000, MAX_BACKOFF_MS);
      setSyncStatus(navigator.onLine === false ? "offline" : "error");
    } finally {
      running.current = false;
    }
  }, [backend, absorb, syncConfig]);

  // Push shortly after edits settle, pull on a slow timer, and catch up
  // whenever the tab or the network comes back. Waits for the local workspace
  // to load first, since there is nothing to merge against before then.
  const loaded = workspace !== null;
  useEffect(() => {
    if (!backend) {
      setSyncStatus("off");
      return;
    }
    if (!loaded) return;
    setSyncStatus("idle");
    void syncNow();

    const push = setInterval(() => {
      if (edits.current !== pushed.current) void syncNow();
    }, backend.cadence.pushMs);
    const pull = setInterval(() => {
      // A hidden tab catches up on the visibilitychange below instead.
      if (!document.hidden) void syncNow();
    }, backend.cadence.pullMs);
    const wake = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(push);
      clearInterval(pull);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [backend, loaded, syncNow]);

  // Another tab of this browser is just another device: re-read the shared
  // database and merge it the same way. The save effect above does the
  // announcing, so there is no second timer here.
  useEffect(() => {
    let cancelled = false;
    const stop = watchOtherTabs(() => {
      void loadWorkspace().then((stored) => {
        if (cancelled || !live.current || !stored) return;
        // A tab that has not been typed into defers to what is already in the
        // shared database rather than adding its own starter document.
        absorb(mergeWorkspace(payloadOf(live.current), payloadOf(stored), { adoptRemote: edits.current === 0 }));
      });
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [absorb]);

  const setSyncConfig = useCallback((next: SyncConfig | null) => {
    saveSyncConfig(next);
    failures.current = 0;
    retryAfter.current = 0;
    setSyncConfigState(next);
  }, []);

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
    sync: { status: syncStatus, config: syncConfig, setConfig: setSyncConfig, now: syncNow },
    saveFailed
  };
}

function payloadOf(workspace: Workspace): SyncPayload {
  return { docs: workspace.docs, graves: workspace.graves };
}
