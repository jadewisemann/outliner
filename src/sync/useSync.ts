import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { changedBy, mergeWorkspace } from "./merge";
import { isLocked } from "./api/cipher";
import { loadWorkspace, saveWorkspace } from "../storage/persist";
import {
  configKey,
  createBackend,
  hasSynced,
  loadSyncConfig,
  markSynced,
  saveSyncConfig,
  watchOtherTabs,
  type Files,
  type History,
  type SyncConfig,
  type SyncStatus
} from "./api/remote";
import type { SyncPayload, Workspace } from "../types";

/** Longest gap between retries after the endpoint starts failing. */
const MAX_BACKOFF_MS = 5 * 60_000;

export type SyncApi = {
  status: SyncStatus;
  config: SyncConfig | null;
  setConfig(next: SyncConfig | null): void;
  now(): Promise<void>;
  /** Present only on a backend that keeps history — today, GitHub. */
  history: History | null;
  /** Likewise for somewhere to put attachment bytes. */
  files: Files | null;
  /** Counts edits worth syncing, so a push knows exactly what it covered. */
  noteEdit(): void;
};

/**
 * The whole sync loop: pull–merge–push with backoff, the visibility and
 * online catch-ups, and the cross-tab ping. It owns nothing but the loop —
 * the workspace lives with the caller, reached through `live` and `apply`.
 */
export function useSync(options: {
  live: MutableRefObject<Workspace | null>;
  apply(next: Workspace): void;
  /**
   * Called when a merge actually brought something in, before it is applied.
   * The caller clears its undo history here: snapshots predate work this
   * device did not author, and replaying one would delete the other device's
   * rows.
   */
  onAbsorb(): void;
  ready: boolean;
}): SyncApi {
  const { live, apply, onAbsorb, ready } = options;

  const [config, setConfigState] = useState<SyncConfig | null>(() => loadSyncConfig());
  const [status, setStatus] = useState<SyncStatus>(() => (loadSyncConfig() ? "idle" : "off"));

  const backend = useMemo(() => (config ? createBackend(config) : null), [config]);
  const running = useRef(false);
  const failures = useRef(0);
  const retryAfter = useRef(0);
  const edits = useRef(0);
  const pushed = useRef(0);

  /** Applies a merge result, but only when it actually brought something in. */
  const absorb = useCallback(
    (payload: SyncPayload) => {
      const current = live.current;
      if (!current || !changedBy({ docs: current.docs, graves: current.graves }, payload)) return;
      onAbsorb();

      const active = payload.docs[current.activeDocId] ? current.activeDocId : Object.keys(payload.docs)[0];
      if (!active) return;
      const views = { ...current.views };
      for (const id of Object.keys(views)) if (!payload.docs[id]) delete views[id];
      apply({ ...current, ...payload, activeDocId: active, views });
    },
    [live, apply, onAbsorb]
  );

  const now = useCallback(async () => {
    if (!backend || running.current || !live.current || Date.now() < retryAfter.current) return;
    running.current = true;
    setStatus("syncing");
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
            adoptRemote: edits.current === 0 && !hasSynced(configKey(config!))
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
      markSynced(configKey(config!));
      setStatus("idle");
      void saveWorkspace(live.current!);
    } catch (error) {
      if (isLocked(error)) {
        // The remote holds bytes this device cannot read. Retrying is pointless
        // until the passphrase changes — and pushing would be worse than
        // pointless, since it would write over notes nobody here can recover.
        retryAfter.current = Date.now() + MAX_BACKOFF_MS;
        setStatus("locked");
        return;
      }
      // Back off, or a dead endpoint means a failing request every 1.5s forever.
      failures.current += 1;
      retryAfter.current = Date.now() + Math.min(2 ** failures.current * 1000, MAX_BACKOFF_MS);
      setStatus(navigator.onLine === false ? "offline" : "error");
    } finally {
      running.current = false;
    }
  }, [backend, absorb, config, live]);

  // Push shortly after edits settle, pull on a slow timer, and catch up
  // whenever the tab or the network comes back. Waits for the local workspace
  // to load first, since there is nothing to merge against before then.
  useEffect(() => {
    if (!backend) {
      setStatus("off");
      return;
    }
    if (!ready) return;
    setStatus("idle");
    void now();

    const push = setInterval(() => {
      if (edits.current !== pushed.current) void now();
    }, backend.cadence.pushMs);
    const pull = setInterval(() => {
      // A hidden tab catches up on the visibilitychange below instead.
      if (!document.hidden) void now();
    }, backend.cadence.pullMs);
    const wake = () => {
      if (document.visibilityState === "visible") void now();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(push);
      clearInterval(pull);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [backend, ready, now]);

  // Another tab of this browser is just another device: re-read the shared
  // database and merge it the same way. The caller's save path does the
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
  }, [absorb, live]);

  const setConfig = useCallback((next: SyncConfig | null) => {
    saveSyncConfig(next);
    failures.current = 0;
    retryAfter.current = 0;
    setConfigState(next);
  }, []);

  const noteEdit = useCallback(() => {
    edits.current += 1;
  }, []);

  return {
    status,
    config,
    setConfig,
    now,
    history: backend?.history ?? null,
    files: backend?.files ?? null,
    noteEdit
  };
}

function payloadOf(workspace: Workspace): SyncPayload {
  return { docs: workspace.docs, graves: workspace.graves };
}
