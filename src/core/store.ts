import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeWorkspace } from "./merge";
import { keyBetween } from "./order";
import { loadWorkspace, saveWorkspace } from "./persist";
import {
  announceToOtherTabs,
  createRestBackend,
  loadSyncConfig,
  saveSyncConfig,
  watchOtherTabs,
  type Backend,
  type SyncConfig,
  type SyncStatus
} from "./sync";
import { ensureEditable, visibleRows, type Edit } from "./tree";
import {
  docList,
  makeDoc,
  makeWorkspace,
  stamp,
  type Doc,
  type DocView,
  type Id,
  type SyncPayload,
  type Workspace
} from "./types";

export type FocusRequest = { id: Id; caret: number | "end"; seq: number };

const UNDO_LIMIT = 200;
const COALESCE_MS = 700;
const SAVE_DEBOUNCE_MS = 400;
const PUSH_DEBOUNCE_MS = 1500;
const PULL_INTERVAL_MS = 10_000;

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
      const next = Object.keys(loaded.docs).length > 0 ? loaded : makeWorkspace();
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

  const dirty = useRef(false);
  const applyWorkspace = useCallback((next: Workspace) => {
    live.current = next;
    setWorkspace(next);
  }, []);

  const commit = useCallback(
    (next: Workspace, previous: Workspace, options: EditOptions) => {
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
      dirty.current = true;
      applyWorkspace(next);
    },
    [applyWorkspace]
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

  const undo = useCallback(() => {
    const current = live.current;
    const previous = past.current.pop();
    if (!current || !previous) return;
    future.current = [...future.current, current];
    lastEdit.current = null;
    dirty.current = true;
    applyWorkspace(previous);
  }, [applyWorkspace]);

  const redo = useCallback(() => {
    const current = live.current;
    const next = future.current.pop();
    if (!current || !next) return;
    past.current = [...past.current, current];
    lastEdit.current = null;
    dirty.current = true;
    applyWorkspace(next);
  }, [applyWorkspace]);

  /* ---------------------------------------------------------------- */
  /* documents                                                         */
  /* ---------------------------------------------------------------- */

  const docs = useMemo(() => {
    const attach = (current: Workspace, doc: Doc): Workspace => ({
      ...current,
      docs: { ...current.docs, [doc.id]: doc },
      activeDocId: doc.id,
      views: { ...current.views, [doc.id]: { zoomId: doc.rootId, focusId: doc.nodes[doc.rootId].children[0] ?? null } }
    });
    const lastSort = (current: Workspace) => docList(current).at(-1)?.sort ?? null;

    return {
      create(title = "Untitled") {
        const current = live.current;
        const doc = makeDoc(title, { sort: keyBetween(current ? lastSort(current) : null, null) });
        editWorkspace((now) => attach(now, doc));
        requestFocus(doc.nodes[doc.rootId].children[0]);
        return doc;
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
          if (Object.keys(remaining).length === 0) return current;
          const views = { ...current.views };
          delete views[id];
          return {
            ...current,
            docs: remaining,
            graves: { ...current.graves, [id]: stamp() },
            views,
            activeDocId: current.activeDocId === id ? Object.keys(remaining)[0] : current.activeDocId
          };
        });
      },
      select(id: Id, options: { zoomId?: Id; focusId?: Id } = {}) {
        editWorkspace(
          (current) => {
            const target = current.docs[id];
            if (!target) return current;
            const existing = current.views[id] ?? { zoomId: target.rootId, focusId: null };
            return {
              ...current,
              activeDocId: id,
              views: {
                ...current.views,
                [id]: { zoomId: options.zoomId ?? existing.zoomId, focusId: options.focusId ?? existing.focusId }
              }
            };
          },
          { transient: true }
        );
        if (options.focusId) requestFocus(options.focusId);
      },
      /** Drops `id` at `toIndex` in the sidebar list. */
      reorder(id: Id, toIndex: number) {
        editWorkspace((current) => {
          const ordered = docList(current).filter((doc) => doc.id !== id);
          const at = Math.max(0, Math.min(toIndex, ordered.length));
          const sort = keyBetween(ordered[at - 1]?.sort ?? null, ordered[at]?.sort ?? null);
          return { ...current, docs: { ...current.docs, [id]: { ...current.docs[id], sort, moved: stamp() } } };
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

  const backend = useMemo<Backend | null>(() => (syncConfig ? createRestBackend(syncConfig) : null), [syncConfig]);
  const version = useRef<string | null>(null);
  const running = useRef(false);

  const absorb = useCallback(
    (payload: SyncPayload) => {
      const current = live.current;
      if (!current) return;
      const active = payload.docs[current.activeDocId] ? current.activeDocId : Object.keys(payload.docs)[0];
      applyWorkspace({ ...current, ...payload, activeDocId: active ?? current.activeDocId });
    },
    [applyWorkspace]
  );

  const syncNow = useCallback(async () => {
    if (!backend || running.current || !live.current) return;
    running.current = true;
    setSyncStatus("syncing");
    try {
      // Pull, merge into whatever is local right now, then offer the result
      // back. A lost race just means the next round settles it.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const stored = await backend.pull();
        if (!stored) break;
        const merged = mergeWorkspace(payloadOf(live.current!), stored.payload);
        absorb(merged);
        const pushed = await backend.push(payloadOf(live.current!), stored.version);
        if (pushed !== null) {
          version.current = pushed ?? null;
          dirty.current = false;
          break;
        }
      }
      setSyncStatus("idle");
      void saveWorkspace(live.current!);
    } catch {
      setSyncStatus(navigator.onLine === false ? "offline" : "error");
    } finally {
      running.current = false;
    }
  }, [backend, absorb]);

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
      if (dirty.current) void syncNow();
    }, PUSH_DEBOUNCE_MS);
    const pull = setInterval(() => {
      // A hidden tab catches up on the visibilitychange below instead.
      if (!document.hidden) void syncNow();
    }, PULL_INTERVAL_MS);
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
  // database and merge it the same way.
  useEffect(() => {
    let announcing = false;
    const stop = watchOtherTabs(() => {
      void loadWorkspace().then((stored) => {
        if (!live.current || announcing) return;
        absorb(mergeWorkspace(payloadOf(live.current), payloadOf(stored)));
      });
    });
    const announce = setInterval(() => {
      if (!dirty.current || !live.current) return;
      announcing = true;
      void saveWorkspace(live.current).then(() => {
        announceToOtherTabs();
        announcing = false;
      });
    }, 1200);
    return () => {
      stop();
      clearInterval(announce);
    };
  }, [absorb]);

  const setSyncConfig = useCallback((next: SyncConfig | null) => {
    saveSyncConfig(next);
    version.current = null;
    setSyncConfigState(next);
  }, []);

  /* ---------------------------------------------------------------- */

  const doc = workspace ? workspace.docs[workspace.activeDocId] : null;
  const stored = workspace && doc ? workspace.views[doc.id] : null;
  const view: DocView = {
    zoomId: doc && stored && doc.nodes[stored.zoomId] ? stored.zoomId : doc?.rootId ?? "",
    focusId: stored?.focusId ?? null
  };
  const zoomId = view.zoomId;
  const rows = useMemo(() => (doc && zoomId ? visibleRows(doc, zoomId) : []), [doc, zoomId]);

  // A zoomed node with nothing under it would be a dead end — give it a row.
  useEffect(() => {
    if (doc && zoomId && rows.length === 0) edit((current) => ensureEditable(current, zoomId), { transient: true });
  }, [doc, zoomId, rows.length, edit]);

  return {
    ready: workspace !== null && doc !== null,
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
    sync: { status: syncStatus, config: syncConfig, setConfig: setSyncConfig, now: syncNow }
  };
}

function payloadOf(workspace: Workspace): SyncPayload {
  return { docs: workspace.docs, graves: workspace.graves };
}
