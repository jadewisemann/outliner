import { pruneGraves } from "./merge";
import type { SyncPayload } from "./types";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error";

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

export type Stored = { payload: SyncPayload; version: string | null };

export interface Backend {
  pull(): Promise<Stored | null>;
  /** Returns `null` when the remote moved on and the caller should re-merge. */
  push(payload: SyncPayload, version: string | null): Promise<string | null | undefined>;
}

/**
 * The whole remote protocol: read a JSON document, write a JSON document.
 *
 * Correctness does not depend on locking. Every device pulls, merges and
 * pushes, and the merge is order-independent, so a lost race is repaired by
 * the next round. `ETag`/`If-Match` is used when the server offers it, purely
 * to make that round happen sooner.
 */
export function createRestBackend(config: SyncConfig): Backend {
  const headers = (extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
    ...extra
  });

  return {
    async pull() {
      const response = await fetch(config.url, { headers: headers(), cache: "no-store" });
      if (response.status === 404) return { payload: emptyPayload(), version: null };
      if (!response.ok) throw new Error(`sync pull failed: ${response.status}`);

      const body = (await response.json()) as SyncPayload | null;
      return { payload: isPayload(body) ? body : emptyPayload(), version: response.headers.get("etag") };
    },

    async push(payload, version) {
      const response = await fetch(config.url, {
        method: "PUT",
        headers: headers(version ? { "if-match": version } : {}),
        body: JSON.stringify(pruneGraves(payload, Date.now()))
      });
      if (response.status === 412 || response.status === 409) return null;
      if (!response.ok) throw new Error(`sync push failed: ${response.status}`);
      return response.headers.get("etag") ?? undefined;
    }
  };
}

export function emptyPayload(): SyncPayload {
  return { docs: {}, graves: {} };
}

function isPayload(value: unknown): value is SyncPayload {
  return typeof value === "object" && value !== null && "docs" in value && typeof (value as SyncPayload).docs === "object";
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

const CONFIG_KEY = "outliner:sync";

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
