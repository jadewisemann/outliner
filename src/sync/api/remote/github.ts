import type { Doc, Id, Stamp } from "../../../types";
import { readDoc, readGraves, readPayload } from "../../../storage/validate";
import type { Keyring } from "../cipher";
import { TIMEOUT_MS, type Backend, type GithubVersion, type Stored, type SyncConfig } from "./contract";
import { fromBase64, fromBinaryString, parse, serialize, toBase64, toBinaryString } from "./codec";

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
export function createGithubBackend(config: Extract<SyncConfig, { kind: "github" }>, keys: Keyring): Backend {
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
export function repoFolder(path: string): string {
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
