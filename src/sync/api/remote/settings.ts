import type { SyncConfig } from "./contract";

const CONFIG_KEY = "outliner:sync";
const SYNCED_KEY = "outliner:synced";

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Sits beside the token, and is worth exactly what the token is worth: it
    // keeps the remote from reading the notes, not someone holding this browser.
    const passphrase = typeof parsed?.passphrase === "string" && parsed.passphrase !== "" ? parsed.passphrase : undefined;
    if (parsed?.kind === "github" && typeof parsed.repo === "string" && typeof parsed.token === "string") {
      return {
        kind: "github",
        repo: parsed.repo,
        path: typeof parsed.path === "string" && parsed.path !== "" ? parsed.path : "outliner",
        token: parsed.token,
        passphrase
      };
    }
    // Configs saved before backends had a `kind` were always plain REST.
    if (typeof parsed?.url === "string" && parsed.url !== "") {
      return {
        kind: "rest",
        url: parsed.url,
        token: typeof parsed.token === "string" ? parsed.token : "",
        passphrase
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig | null): void {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* private mode — sync just stays off for this session */
  }
}

/**
 * Whether this device has ever completed a sync with this remote. Used once,
 * to decide that a first sign-in should adopt the remote rather than merge an
 * untouched starter document into it.
 */
export function hasSynced(key: string): boolean {
  try {
    return localStorage.getItem(SYNCED_KEY) === key;
  } catch {
    return false;
  }
}

export function markSynced(key: string): void {
  try {
    localStorage.setItem(SYNCED_KEY, key);
  } catch {
    /* private mode — the adoption check just re-runs next time */
  }
}

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
