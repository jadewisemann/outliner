import type { Doc, Id, Stamp, SyncPayload } from "../../types";
import { readDoc, readGraves, readPayload } from "../../storage/validate";
import { createKeyring, plainKeyring, type Keyring } from "./cipher";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error" | "locked";

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
      /** Set to keep the remote from being able to read any of it. */
      passphrase?: string;
    }
  | {
      kind: "github";
      /** `owner/name`. */
      repo: string;
      /** Folder inside the repository that holds the workspace. */
      path: string;
      /** A fine-grained PAT with contents read/write on this one repository. */
      token: string;
      /** Set to keep the remote from being able to read any of it. */
      passphrase?: string;
    };

/** Per-file shas of the split GitHub layout — one token covering many files. */
type GithubVersion = { docs: Record<Id, string>; graves: string | null };

/**
 * Whatever a backend needs to recognise its own last write. Opaque to the sync
 * loop, which only ever asks whether the remote holds anything at all (`null`)
 * and hands the token straight back on the next push.
 */
export type Version = string | GithubVersion | null;

export type Stored = { payload: SyncPayload; version: Version };

/** One past version of one document, as the remote remembers it. */
export type Revision = { id: string; message: string; at: string; author: string };

/**
 * Reading the past. Only a backend that keeps history can offer this — a plain
 * `GET`/`PUT` URL has no memory, which is exactly the difference between the
 * two backends and why this is optional rather than part of the contract.
 */
export type History = {
  list(docId: Id): Promise<Revision[]>;
  read(docId: Id, revision: string): Promise<Doc | null>;
};

/**
 * Somewhere to put bytes that are not notes.
 *
 * Optional for the same reason history is: a plain `GET`/`PUT` URL is one
 * document, with no room beside it. A repository has room.
 */
export type Files = {
  put(name: string, bytes: Uint8Array): Promise<void>;
  /** Null when the file is not there; throws `locked` when it cannot be read. */
  get(name: string): Promise<Uint8Array | null>;
};

export type Backend = {
  pull(): Promise<Stored>;
  history?: History;
  files?: Files;
  /** Resolves to `null` when the remote moved on and the caller should re-merge. */
  push(payload: SyncPayload, version: Version): Promise<Version | undefined>;
  /**
   * How often this remote likes to be talked to. A private server can take an
   * update every couple of seconds; on GitHub every push is a commit, so the
   * cadence is gentler.
   */
  cadence: { pullMs: number; pushMs: number };
};

export function createBackend(config: SyncConfig): Backend {
  const keys = config.passphrase ? createKeyring(config.passphrase) : plainKeyring();
  return config.kind === "github" ? createGithubBackend(config, keys) : createRestBackend(config, keys);
}

/** Stable identity of a remote, for the has-ever-synced marker. */
export function configKey(config: SyncConfig): string {
  return config.kind === "github" ? `github:${config.repo}#${repoFolder(config.path)}` : config.url;
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
function createRestBackend(config: Extract<SyncConfig, { kind: "rest" }>, keys: Keyring): Backend {
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
      const payload = readPayload(parse(await keys.open(await response.text())));
      return { payload: payload ?? emptyPayload(), version: response.headers.get("etag") };
    },

    async push(payload, version) {
      const etag = typeof version === "string" ? version : null;
      const response = await fetch(config.url, {
        method: "PUT",
        headers: headers(etag ? { "if-match": etag } : {}),
        body: await keys.seal(JSON.stringify(payload)),
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
 * GitHub implements the contract exactly: GET a file returns its content plus
 * a `sha`, PUT with that `sha` is a true compare-and-swap, and a stale `sha` is
 * refused — which feeds the existing pull-merge-push retry loop unchanged.
 * Every accepted push is a commit, so the repository history doubles as a
 * version archive for free.
 *
 * The workspace is spread over a folder rather than kept in one file:
 *
 *     {folder}/docs/{id}.json    one whole document
 *     {folder}/graves.json       ids of deleted documents
 *
 * A single file makes every commit a rewrite of everything, which says nothing
 * about what changed. Split up, a push carries only the documents that were
 * actually touched and the history reads like an edit log. The files are
 * written with sorted keys and indentation for the same reason: identical
 * content serialises identically on every device, so an untouched document
 * never produces a commit, and a one-row edit shows up as one changed row.
 *
 * Nothing here needs the writes to be atomic. The merge is order-independent,
 * so a device reading the repository between two of them sees a state some
 * device could have had, and settles on the next round. The one ordering that
 * matters is gravestones before deletions — a reader that saw the missing file
 * without the gravestone would upload its own copy straight back.
 */
function createGithubBackend(config: Extract<SyncConfig, { kind: "github" }>, keys: Keyring): Backend {
  const folder = repoFolder(config.path).split("/");
  const contents = (segments: string[]) =>
    `https://api.github.com/repos/${config.repo}/contents/${segments.map(encodeURIComponent).join("/")}`;
  const docsUrl = contents([...folder, "docs"]);
  const gravesUrl = contents([...folder, "graves.json"]);
  // Where the workspace lived before it was split up.
  const legacyUrl = contents([...folder.slice(0, -1), `${folder[folder.length - 1]}.json`]);

  const api = (url: string, init: RequestInit = {}, accept = "application/vnd.github+json") =>
    fetch(url, {
      ...init,
      headers: {
        accept,
        authorization: `Bearer ${config.token}`,
        "x-github-api-version": "2022-11-28",
        ...(init.headers as Record<string, string> | undefined)
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

  /**
   * What this device believes the repository holds. The text is kept so a push
   * can tell an untouched document from an edited one without asking, and the
   * `Doc` so a pull can skip re-parsing a file whose sha has not moved.
   */
  let mirror = new Map<Id, { sha: string; text: string; doc: Doc | null }>();
  let graves: { etag: string | null; sha: string | null; text: string; value: Record<Id, Stamp> } = {
    etag: null,
    sha: null,
    text: serialize({}),
    value: {}
  };
  // Conditional GETs: an unchanged file or folder answers 304 with no body,
  // which does not count against the rate limit — polling an idle remote is
  // free, however many documents it holds.
  let listing: { etag: string; entries: [Id, string][] } | null = null;
  let legacySha: string | null = null;
  let legacyChecked = false;

  /** The document files present, newest sha each, or `null` if there is no folder. */
  async function list(): Promise<[Id, string][] | null> {
    const response = await api(docsUrl, listing ? { headers: { "if-none-match": listing.etag } } : {});
    if (response.status === 304 && listing) return listing.entries;
    if (response.status === 404) {
      listing = null;
      return null;
    }
    if (!response.ok) throw new Error(`github pull failed: ${response.status}`);

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return null;
    const entries: [Id, string][] = [];
    for (const item of body) {
      if (!item || typeof item !== "object") continue;
      const { name, sha, type } = item as { name?: unknown; sha?: unknown; type?: unknown };
      if (type !== "file" || typeof name !== "string" || typeof sha !== "string") continue;
      const id = docIdOf(name);
      if (id) entries.push([id, sha]);
    }
    const etag = response.headers.get("etag");
    listing = etag ? { etag, entries } : null;
    return entries;
  }

  /** Reads one document by its blob sha, which the folder listing already gave us. */
  async function readFile(id: Id, sha: string) {
    const response = await api(
      `https://api.github.com/repos/${config.repo}/git/blobs/${encodeURIComponent(sha)}`,
      {},
      "application/vnd.github.raw"
    );
    if (!response.ok) throw new Error(`github pull failed: ${response.status}`);
    const text = await keys.open(await response.text());
    // A file this device cannot read is left alone rather than deleted: it may
    // be written by a build that knows more than this one.
    return { sha, text, doc: readDoc(id, parse(text)) };
  }

  async function loadGraves(): Promise<void> {
    const response = await api(gravesUrl, graves.etag ? { headers: { "if-none-match": graves.etag } } : {});
    if (response.status === 304) return;
    if (response.status === 404) {
      graves = { etag: null, sha: null, text: serialize({}), value: {} };
      return;
    }
    if (!response.ok) throw new Error(`github pull failed: ${response.status}`);
    const body = (await response.json()) as { content?: string; encoding?: string; sha?: string };
    const stored = body.encoding === "base64" && typeof body.content === "string" ? fromBase64(body.content) : "{}";
    const text = await keys.open(stored);
    graves = {
      etag: response.headers.get("etag"),
      sha: body.sha ?? null,
      text,
      value: readGraves(parse(text))
    };
  }

  /**
   * Reads the pre-split single file, once, so a repository written by an
   * earlier build keeps its notes. The version comes back `null`: the folder
   * does not exist yet, so the store must push rather than assume the remote
   * already holds everything.
   */
  async function adoptLegacy(): Promise<Stored | null> {
    if (legacyChecked) return null;
    legacyChecked = true;
    const response = await api(legacyUrl);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`github pull failed: ${response.status}`);
    const body = (await response.json()) as { content?: string; encoding?: string; sha?: string };
    if (body.encoding !== "base64" || typeof body.content !== "string") return null;
    const payload = readPayload(parse(await keys.open(fromBase64(body.content))));
    if (!payload) return null;
    legacySha = body.sha ?? null;
    return { payload, version: null };
  }

  /** Resolves to the new sha, or `null` when another device wrote first. */
  async function write(url: string, text: string, sha: string | null, message: string): Promise<string | null> {
    const response = await api(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, content: toBase64(await keys.seal(text)), ...(sha ? { sha } : {}) })
    });
    // 422 is what a missing sha for an existing file looks like: same story as
    // a stale one, and the same cure — pull, merge, try again.
    if (response.status === 409 || response.status === 422) {
      listing = null;
      return null;
    }
    if (!response.ok) throw new Error(`github push failed: ${response.status}`);
    const body = (await response.json().catch(() => null)) as { content?: { sha?: string } } | null;
    const next = body?.content?.sha;
    if (typeof next !== "string") {
      listing = null;
      return null;
    }
    listing = null;
    return next;
  }

  async function remove(url: string, sha: string, message: string): Promise<boolean> {
    const response = await api(url, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, sha })
    });
    listing = null;
    // Already gone — another device removed it first, which is the outcome.
    if (response.status === 404) return true;
    if (response.status === 409 || response.status === 422) return false;
    if (!response.ok) throw new Error(`github push failed: ${response.status}`);
    return true;
  }

  return {
    cadence: { pullMs: 30_000, pushMs: 10_000 },

    /**
     * Attachments live beside the documents rather than inside them. A note
     * stays a line of text; the bytes are a file, and a file is what a
     * repository is good at.
     *
     * They are sealed with the same key as everything else, which is why they
     * cannot be linked to directly — a private repository would refuse the
     * request and an encrypted one would return noise. They are fetched
     * through the API and turned into an object URL, same as the notes.
     */
    files: {
      async put(name, bytes) {
        const url = contents([...folder, "files", name]);
        const existing = await api(url);
        // Names are content-addressed, so a file that is already there is the
        // same file: uploading it again would only add a commit.
        if (existing.status === 200) return;
        const written = await write(url, toBinaryString(bytes), null, `outliner: attach ${name}`);
        if (!written) throw new Error("github attach failed");
      },

      async get(name) {
        const response = await api(contents([...folder, "files", name]));
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`github attach read failed: ${response.status}`);
        const body = (await response.json()) as { content?: string; encoding?: string };
        if (body.encoding !== "base64" || typeof body.content !== "string") return null;
        return fromBinaryString(await keys.open(fromBase64(body.content)));
      }
    },

    /**
     * Every push was a commit, so the repository has been keeping a version
     * archive all along — this is only the part that reads it back. Encrypted
     * workspaces work too: an old file is opened with the same key as a new one.
     */
    history: {
      async list(docId) {
        const name = fileNameOf(docId);
        if (!name) return [];
        const path = [...folder, "docs", name].join("/");
        const response = await api(
          `https://api.github.com/repos/${config.repo}/commits?per_page=40&path=${encodeURIComponent(path)}`
        );
        if (!response.ok) return [];
        const body = (await response.json()) as unknown;
        if (!Array.isArray(body)) return [];
        return body.flatMap((entry) => {
          const commit = entry as { sha?: unknown; commit?: { message?: unknown; author?: { date?: unknown; name?: unknown } } };
          if (typeof commit.sha !== "string") return [];
          return [
            {
              id: commit.sha,
              message: String(commit.commit?.message ?? ""),
              at: String(commit.commit?.author?.date ?? ""),
              author: String(commit.commit?.author?.name ?? "")
            }
          ];
        });
      },

      async read(docId, revision) {
        const name = fileNameOf(docId);
        if (!name) return null;
        const response = await api(`${contents([...folder, "docs", name])}?ref=${encodeURIComponent(revision)}`);
        if (!response.ok) return null;
        const body = (await response.json()) as { content?: string; encoding?: string };
        if (body.encoding !== "base64" || typeof body.content !== "string") return null;
        return readDoc(docId, parse(await keys.open(fromBase64(body.content))));
      }
    },

    async pull() {
      const entries = await list();
      if (entries === null) {
        const adopted = await adoptLegacy();
        if (adopted) return adopted;
      }
      await loadGraves();

      const docs: Record<Id, Doc> = {};
      const shas: Record<Id, string> = {};
      const next = new Map<Id, { sha: string; text: string; doc: Doc | null }>();
      for (const [id, sha] of entries ?? []) {
        const held = mirror.get(id);
        const file = held && held.sha === sha ? held : await readFile(id, sha);
        next.set(id, file);
        shas[id] = sha;
        // Reusing the same `Doc` object is what lets the merge come back
        // identical and the render be skipped when nothing moved.
        if (file.doc) docs[id] = file.doc;
      }
      mirror = next;

      const empty = (entries === null || entries.length === 0) && graves.sha === null;
      return { payload: { docs, graves: graves.value }, version: empty ? null : { docs: shas, graves: graves.sha } };
    },

    async push(payload, version) {
      const known: GithubVersion =
        version && typeof version === "object" ? version : { docs: {}, graves: null };
      const shas = { ...known.docs };

      // Gravestones travel ahead of the deletions they justify.
      const gravesText = serialize(payload.graves);
      let gravesSha = known.graves;
      if (gravesText !== graves.text) {
        const written = await write(gravesUrl, gravesText, gravesSha, "outliner: tombstones");
        if (!written) return null;
        gravesSha = written;
        graves = { etag: null, sha: written, text: gravesText, value: payload.graves };
      }

      // A document that buried something goes first. Moving a row to another
      // document is two files: if the destination were written first, a device
      // reading in between would see the row in both places until it caught
      // up. Same family as gravestones-before-deletions, one level down.
      const buried = (id: Id, doc: Doc) => {
        const known = mirror.get(id)?.doc;
        return known ? Object.keys(doc.graves).length > Object.keys(known.graves).length : false;
      };
      const changed = Object.entries(payload.docs).sort(
        ([a, left], [b, right]) => Number(buried(b, right)) - Number(buried(a, left))
      );

      for (const [id, doc] of changed) {
        const name = fileNameOf(id);
        if (!name) continue;
        const text = serialize(doc);
        if (mirror.get(id)?.text === text) continue;
        const written = await write(
          contents([...folder, "docs", name]),
          text,
          shas[id] ?? null,
          `outliner: ${subject(doc.title)}`
        );
        if (!written) return null;
        shas[id] = written;
        mirror.set(id, { sha: written, text, doc });
      }

      // Only a gravestone removes a file. Absence from the payload on its own
      // is not evidence of a delete — it is also what an unreadable file looks
      // like, and dropping one of those would destroy a document.
      for (const id of Object.keys(known.docs)) {
        if (payload.docs[id] || !payload.graves[id]) continue;
        const name = fileNameOf(id);
        if (!name) continue;
        if (!(await remove(contents([...folder, "docs", name]), known.docs[id], "outliner: remove document"))) {
          return null;
        }
        delete shas[id];
        mirror.delete(id);
      }

      // The split files now hold everything the old one did.
      if (legacySha) {
        await remove(legacyUrl, legacySha, "outliner: split workspace into one file per document");
        legacySha = null;
      }

      return { docs: shas, graves: gravesSha };
    }
  };
}

/**
 * The configured path names the folder the workspace lives in. A path left
 * over from the single-file layout (`outliner.json`) names the same folder,
 * next to the file it should be migrated from.
 */
function repoFolder(path: string): string {
  const trimmed = path
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.json$/i, "");
  return trimmed === "" ? "outliner" : trimmed;
}

/**
 * A document id is minted as a UUID, but an imported backup can carry anything,
 * so it is escaped before becoming a file name. Anything that would not survive
 * as a path component at all keeps its place in the workspace and stays off
 * this remote, rather than taking the sync down with it.
 */
function fileNameOf(id: Id): string | null {
  if (id === "") return null;
  const name = `${encodeURIComponent(id)}.json`;
  return name.length > 200 ? null : name;
}

function docIdOf(name: string): Id | null {
  if (!name.endsWith(".json")) return null;
  try {
    const id = decodeURIComponent(name.slice(0, -".json".length));
    return fileNameOf(id) === name ? id : null;
  } catch {
    return null;
  }
}

/** Commit subjects read like an edit log, so a title has to be trimmed to one. */
function subject(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();
  if (line === "") return "untitled";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/**
 * Object keys in sorted order and one field per line. Sorting is what makes the
 * bytes depend on the content alone rather than on which device assembled the
 * object, so an untouched document never looks changed; the indentation is what
 * makes a one-row edit a one-line diff.
 */
function serialize(value: unknown): string {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) out[key] = ordered(source[key]);
  return out;
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

/**
 * Bytes as a string, one character per byte.
 *
 * Attachments go through the same seal-and-base64 path as the notes, and that
 * path speaks strings — so the bytes are carried as latin-1 rather than given
 * a second encoding of their own.
 */
function toBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 0x8000) out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return out;
}

function fromBinaryString(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
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
