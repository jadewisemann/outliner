import type { SyncPayload } from "./types";
import { readPayload } from "./validate";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error";

/** A request that never answers would otherwise wedge the sync loop for good. */
const TIMEOUT_MS = 15_000;

export type SyncConfig = {
  /**
   * A URL that answers GET with the stored payload and accepts PUT of a new
   * one. A Firebase Realtime Database path works as-is
   * (`https://<db>.firebaseio.com/outliner.json?auth=<token>`), as does any
   * endpoint that stores and returns a JSON body.
   */
  url: string;
  /** Sent as `Authorization: Bearer …` when present. */
  token: string;
};

/**
 * The whole remote protocol: read a JSON document, write a JSON document.
 *
 * Correctness does not depend on locking. Every device pulls, merges and
 * pushes, and the merge is order-independent, so a lost race is repaired by
 * the next round. `ETag`/`If-Match` is used when the server offers it, purely
 * to make that round happen sooner.
 */
export function createRestBackend(config: SyncConfig) {
  const headers = (extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
    ...extra
  });

  return {
    async pull() {
      const response = await fetch(config.url, {
        headers: headers(),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status === 404) return { payload: emptyPayload(), version: null };
      if (!response.ok) throw new Error(`sync pull failed: ${response.status}`);

      // Whatever is at the other end is untrusted, even when it is the user's
      // own server: a malformed body must not be able to damage the workspace.
      const payload = readPayload(await response.json().catch(() => null));
      return { payload: payload ?? emptyPayload(), version: response.headers.get("etag") };
    },

    /** Resolves to `null` when the remote moved on and the caller should re-merge. */
    async push(payload: SyncPayload, version: string | null) {
      const response = await fetch(config.url, {
        method: "PUT",
        headers: headers(version ? { "if-match": version } : {}),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status === 412 || response.status === 409) return null;
      if (!response.ok) throw new Error(`sync push failed: ${response.status}`);
      return response.headers.get("etag") ?? undefined;
    }
  };
}

function emptyPayload(): SyncPayload {
  return { docs: {}, graves: {} };
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

const CONFIG_KEY = "outliner:sync";
const SYNCED_KEY = "outliner:synced";

/**
 * Whether this device has ever completed a sync with `url`. Used once, to
 * decide that a first sign-in should adopt the remote rather than merge an
 * untouched starter document into it.
 */
export function hasSynced(url: string): boolean {
  try {
    return localStorage.getItem(SYNCED_KEY) === url;
  } catch {
    return false;
  }
}

export function markSynced(url: string): void {
  try {
    localStorage.setItem(SYNCED_KEY, url);
  } catch {
    /* private mode — the adoption check just re-runs next time */
  }
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncConfig;
    return parsed.url ? { url: parsed.url, token: parsed.token ?? "" } : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig | null): void {
  try {
    if (config?.url) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* private mode — sync just stays off for this session */
  }
}

/* ------------------------------------------------------------------ */
/* other tabs                                                          */
/* ------------------------------------------------------------------ */

/**
 * Two tabs of the same browser are two devices as far as the merge is
 * concerned. They exchange a ping rather than the payload, and each reads the
 * shared IndexedDB copy — same code path as a remote pull, no extra protocol.
 */
export function watchOtherTabs(onChanged: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel("outliner");
  channel.onmessage = (event) => {
    if (event.data === "changed") onChanged();
  };
  return () => channel.close();
}

export function announceToOtherTabs(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("outliner");
  channel.postMessage("changed");
  channel.close();
}
