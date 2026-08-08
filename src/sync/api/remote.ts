import type { SyncPayload } from "../../types";
import { readPayload } from "../../storage/validate";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error";

/** A request that never answers would otherwise wedge the sync loop for good. */
const TIMEOUT_MS = 15_000;

/**
 * Two kinds of remote, one contract: read a versioned JSON document, write it
 * back with compare-and-swap. Anything that can do that can hold the notes.
 */
export type SyncConfig =
  | {
      kind: "rest";
      /**
       * A URL that answers GET with the stored payload and accepts PUT of a
       * new one. A Firebase Realtime Database path works as-is, as does any
       * endpoint that stores and returns a JSON body.
       */
      url: string;
      /** Sent as `Authorization: Bearer …` when present. */
      token: string;
    }
  | {
      kind: "github";
      /** `owner/name`. */
      repo: string;
      /** File path inside the repository. */
      path: string;
      /** A fine-grained PAT with contents read/write on this one repository. */
      token: string;
    };

export type Stored = { payload: SyncPayload; version: string | null };

export type Backend = {
  pull(): Promise<Stored>;
  /** Resolves to `null` when the remote moved on and the caller should re-merge. */
  push(payload: SyncPayload, version: string | null): Promise<string | null | undefined>;
  /**
   * How often this remote likes to be talked to. A private server can take an
   * update every couple of seconds; on GitHub every push is a commit, so the
   * cadence is gentler.
   */
  cadence: { pullMs: number; pushMs: number };
};

export function createBackend(config: SyncConfig): Backend {
  return config.kind === "github" ? createGithubBackend(config) : createRestBackend(config);
}

/** Stable identity of a remote, for the has-ever-synced marker. */
export function configKey(config: SyncConfig): string {
  return config.kind === "github" ? `github:${config.repo}#${config.path}` : config.url;
}

/* ------------------------------------------------------------------ */
/* plain REST                                                          */
/* ------------------------------------------------------------------ */

/**
 * Correctness does not depend on locking. Every device pulls, merges and
 * pushes, and the merge is order-independent, so a lost race is repaired by
 * the next round. `ETag`/`If-Match` is used when the server offers it, purely
 * to make that round happen sooner.
 */
function createRestBackend(config: Extract<SyncConfig, { kind: "rest" }>): Backend {
  const headers = (extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
    ...extra
  });

  return {
    cadence: { pullMs: 10_000, pushMs: 1_500 },

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

    async push(payload, version) {
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

/* ------------------------------------------------------------------ */
/* GitHub contents API                                                 */
/* ------------------------------------------------------------------ */

/**
 * GitHub happens to implement the contract exactly: GET a file returns its
 * content plus a `sha`, PUT with that `sha` is a true compare-and-swap, and a
 * stale `sha` is refused — which feeds the existing pull-merge-push retry
 * loop unchanged. Every accepted push is a commit, so the repository history
 * doubles as a version archive for free.
 */
function createGithubBackend(config: Extract<SyncConfig, { kind: "github" }>): Backend {
  const path = config.path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${config.token}`,
    "x-github-api-version": "2022-11-28"
  };

  // Conditional GETs: an unchanged file answers 304 with no body, which does
  // not count against the API rate limit — polling an idle remote is free.
  let cached: { etag: string; stored: Stored } | null = null;

  return {
    cadence: { pullMs: 30_000, pushMs: 10_000 },

    async pull() {
      const response = await fetch(url, {
        headers: cached ? { ...headers, "if-none-match": cached.etag } : headers,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status === 304 && cached) return cached.stored;
      if (response.status === 404) return { payload: emptyPayload(), version: null };
      if (!response.ok) throw new Error(`github pull failed: ${response.status}`);

      const body = (await response.json()) as { content?: string; encoding?: string; sha?: string };
      let raw: string;
      if (body.encoding === "base64" && typeof body.content === "string" && body.content !== "") {
        raw = fromBase64(body.content);
      } else {
        // Past 1MB the API stops inlining content; ask for the raw bytes.
        const rawResponse = await fetch(url, {
          headers: { ...headers, accept: "application/vnd.github.raw+json" },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (!rawResponse.ok) throw new Error(`github raw pull failed: ${rawResponse.status}`);
        raw = await rawResponse.text();
      }

      const payload = readPayload(parse(raw)) ?? emptyPayload();
      const stored: Stored = { payload, version: body.sha ?? null };
      const etag = response.headers.get("etag");
      if (etag) cached = { etag, stored };
      return stored;
    },

    async push(payload, version) {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: "outliner sync",
          content: toBase64(JSON.stringify(payload)),
          ...(version ? { sha: version } : {})
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status === 409) return null;
      if (!response.ok) throw new Error(`github push failed: ${response.status}`);
      cached = null;
      const body = (await response.json().catch(() => null)) as { content?: { sha?: string } } | null;
      return body?.content?.sha ?? undefined;
    }
  };
}

function emptyPayload(): SyncPayload {
  return { docs: {}, graves: {} };
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** btoa/atob speak latin-1 only; the notes are UTF-8. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

const CONFIG_KEY = "outliner:sync";
const SYNCED_KEY = "outliner:synced";

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.kind === "github" && typeof parsed.repo === "string" && typeof parsed.token === "string") {
      return {
        kind: "github",
        repo: parsed.repo,
        path: typeof parsed.path === "string" && parsed.path !== "" ? parsed.path : "outliner.json",
        token: parsed.token
      };
    }
    // Configs saved before backends had a `kind` were always plain REST.
    if (typeof parsed?.url === "string" && parsed.url !== "") {
      return { kind: "rest", url: parsed.url, token: typeof parsed.token === "string" ? parsed.token : "" };
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
