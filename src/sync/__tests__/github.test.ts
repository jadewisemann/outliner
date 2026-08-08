import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackend, type Backend, type Version } from "../api/remote";
import { isLocked } from "../api/cipher";
import { makeDoc, stamp, type Doc, type SyncPayload } from "../../types";

/**
 * The contents API, in memory: GET a file or a folder, PUT and DELETE with a
 * sha that has to be current. Enough of the real thing to hold the backend to
 * the two promises that matter — a push carries only what changed, and a
 * gravestone is in the repository before the file it condemns is gone.
 */
function fakeGithub(seed: Record<string, string> = {}) {
  const files = new Map<string, { text: string; sha: string }>();
  const writes: string[] = [];
  const commits: string[] = [];
  /** Every version a path has held, newest last — the repository's memory. */
  const past = new Map<string, { sha: string; text: string; message: string }[]>();
  let writtenMessage = "seed";
  let counter = 0;
  let blobReads = 0;

  const store = (path: string, text: string) => {
    counter += 1;
    const sha = `sha-${counter}`;
    files.set(path, { text, sha });
    past.set(path, [...(past.get(path) ?? []), { sha, text, message: writtenMessage }]);
  };
  for (const [path, text] of Object.entries(seed)) store(path, text);

  const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body))
    }) as unknown as Response;

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
    const ifNoneMatch = (init.headers as Record<string, string> | undefined)?.["if-none-match"];

    const blob = /^\/repos\/tester\/notes\/git\/blobs\/(.+)$/.exec(url.pathname);
    if (blob) {
      const found = [...files.values()].find((file) => file.sha === decodeURIComponent(blob[1]));
      if (!found) return reply(404, {});
      blobReads += 1;
      return reply(200, found.text);
    }

    if (url.pathname === "/repos/tester/notes/commits") {
      const path = url.searchParams.get("path") ?? "";
      const versions = [...(past.get(path) ?? [])].reverse();
      return reply(
        200,
        versions.map((version) => ({
          sha: version.sha,
          commit: { message: version.message, author: { date: "2026-01-02T03:04:05Z", name: "tester" } }
        }))
      );
    }

    const prefix = "/repos/tester/notes/contents/";
    if (!url.pathname.startsWith(prefix)) return reply(404, {});
    const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const held = files.get(path);

    if (method === "GET") {
      const ref = url.searchParams.get("ref");
      if (ref) {
        const version = (past.get(path) ?? []).find((each) => each.sha === ref);
        if (!version) return reply(404, {});
        return reply(200, { content: Buffer.from(version.text, "utf8").toString("base64"), encoding: "base64", sha: ref });
      }
      if (held) {
        if (ifNoneMatch === held.sha) return reply(304);
        return reply(
          200,
          { content: Buffer.from(held.text, "utf8").toString("base64"), encoding: "base64", sha: held.sha },
          { etag: held.sha }
        );
      }
      const children = [...files.entries()]
        .filter(([at]) => at.startsWith(`${path}/`) && !at.slice(path.length + 1).includes("/"))
        .map(([at, file]) => ({ name: at.slice(path.length + 1), path: at, sha: file.sha, type: "file" }));
      if (children.length === 0) return reply(404, {});
      const etag = children.map((child) => child.sha).join(",");
      if (ifNoneMatch === etag) return reply(304);
      return reply(200, children, { etag });
    }

    if (method === "PUT") {
      if (held ? body.sha !== held.sha : Boolean(body.sha)) return reply(409, {});
      writtenMessage = String(body.message);
      store(path, Buffer.from(String(body.content), "base64").toString("utf8"));
      writes.push(path);
      commits.push(String(body.message));
      return reply(200, { content: { sha: files.get(path)!.sha } });
    }

    if (method === "DELETE") {
      if (!held) return reply(404, {});
      if (body.sha !== held.sha) return reply(409, {});
      files.delete(path);
      writes.push(path);
      commits.push(String(body.message));
      return reply(200, {});
    }
    return reply(405, {});
  };

  vi.stubGlobal("fetch", fetch);
  return {
    files,
    writes,
    commits,
    /** Rewrites a file behind the backend's back, as another device would. */
    overwrite: store,
    blobReads: () => blobReads
  };
}

const connect = (passphrase?: string): Backend =>
  createBackend({ kind: "github", repo: "tester/notes", path: "outliner", token: "pat", passphrase });

const payload = (docs: Doc[], graves: SyncPayload["graves"] = {}): SyncPayload => ({
  docs: Object.fromEntries(docs.map((doc) => [doc.id, doc])),
  graves
});

const docFiles = (repo: { files: Map<string, unknown> }) =>
  [...repo.files.keys()].filter((path) => path.startsWith("outliner/docs/"));

/** Round-trips a document through JSON, the way a pull would rebuild it. */
const reread = (doc: Doc): Doc => JSON.parse(JSON.stringify(doc)) as Doc;

afterEach(() => vi.unstubAllGlobals());

describe("the GitHub backend, one file per document", () => {
  it("gives every document its own file and reports an untouched repository as empty", async () => {
    const repo = fakeGithub();
    const backend = connect();

    const empty = await backend.pull();
    expect(empty.payload.docs).toEqual({});
    expect(empty.version).toBeNull();

    const one = makeDoc("첫 문서");
    const two = makeDoc("Second");
    const version = await backend.push(payload([one, two]), empty.version);

    expect(docFiles(repo).sort()).toEqual(
      [`outliner/docs/${one.id}.json`, `outliner/docs/${two.id}.json`].sort()
    );
    expect(repo.commits).toEqual(["outliner: 첫 문서", "outliner: Second"]);
    expect(version).not.toBeNull();
  });

  it("commits only the document that changed", async () => {
    const repo = fakeGithub();
    const backend = connect();
    const one = makeDoc("one");
    const two = makeDoc("two");
    const version = await backend.push(payload([one, two]), (await backend.pull()).version);
    repo.writes.length = 0;

    const edited = { ...two, title: "two, renamed", titleEdited: stamp() };
    await backend.push(payload([one, edited]), version as Version);

    expect(repo.writes).toEqual([`outliner/docs/${two.id}.json`]);
  });

  it("writes nothing at all when a rebuilt payload holds the same content", async () => {
    const repo = fakeGithub();
    const backend = connect();
    const doc = makeDoc("stable");
    const version = await backend.push(payload([doc]), (await backend.pull()).version);
    repo.writes.length = 0;

    // A merge hands back documents assembled from scratch; only the bytes decide.
    await backend.push(payload([reread(doc)]), version as Version);

    expect(repo.writes).toEqual([]);
  });

  it("re-reads only the documents whose sha moved", async () => {
    const repo = fakeGithub();
    const backend = connect();
    const one = makeDoc("one");
    const two = makeDoc("two");
    await backend.push(payload([one, two]), (await backend.pull()).version);

    const before = repo.blobReads();
    await backend.pull();
    expect(repo.blobReads()).toBe(before);

    repo.overwrite(`outliner/docs/${one.id}.json`, JSON.stringify({ ...one, title: "changed elsewhere" }));
    const stored = await backend.pull();
    expect(repo.blobReads()).toBe(before + 1);
    expect(stored.payload.docs[one.id].title).toBe("changed elsewhere");
  });

  it("asks for a re-merge instead of overwriting a document another device wrote", async () => {
    const repo = fakeGithub();
    const backend = connect();
    const doc = makeDoc("contested");
    const version = await backend.push(payload([doc]), (await backend.pull()).version);

    repo.overwrite(`outliner/docs/${doc.id}.json`, JSON.stringify({ ...doc, title: "theirs" }));
    const result = await backend.push(payload([{ ...doc, title: "mine", titleEdited: stamp() }]), version as Version);

    expect(result).toBeNull();
    expect(repo.files.get(`outliner/docs/${doc.id}.json`)?.text).toContain("theirs");
  });

  it("buries a document before removing its file", async () => {
    const repo = fakeGithub();
    const backend = connect();
    const kept = makeDoc("kept");
    const gone = makeDoc("gone");
    const version = await backend.push(payload([kept, gone]), (await backend.pull()).version);
    repo.writes.length = 0;

    await backend.push(payload([kept], { [gone.id]: stamp() }), version as Version);

    // A device reading in between must find the gravestone, or it would take
    // the missing file for a document of its own to upload again.
    expect(repo.writes).toEqual(["outliner/graves.json", `outliner/docs/${gone.id}.json`]);
    expect(docFiles(repo)).toEqual([`outliner/docs/${kept.id}.json`]);
  });

  it("leaves a document it cannot read alone rather than deleting it", async () => {
    const doc = makeDoc("readable");
    const repo = fakeGithub({
      [`outliner/docs/${doc.id}.json`]: JSON.stringify(doc),
      "outliner/docs/mystery.json": "written by a build that knows more"
    });
    const backend = connect();

    const stored = await backend.pull();
    expect(Object.keys(stored.payload.docs)).toEqual([doc.id]);

    await backend.push(stored.payload, stored.version);
    expect(repo.files.has("outliner/docs/mystery.json")).toBe(true);
  });

  it("adopts a workspace written before the split and then retires the old file", async () => {
    const doc = makeDoc("이전 형식");
    const repo = fakeGithub({ "outliner.json": JSON.stringify({ docs: { [doc.id]: doc }, graves: {} }) });
    const backend = connect();

    const stored = await backend.pull();
    expect(stored.payload.docs[doc.id].title).toBe("이전 형식");
    // Null, not a version: the folder does not exist yet, so the store must push.
    expect(stored.version).toBeNull();

    await backend.push(stored.payload, stored.version);
    expect(docFiles(repo)).toEqual([`outliner/docs/${doc.id}.json`]);
    expect(repo.files.has("outliner.json")).toBe(false);
  });

  it("puts nothing readable in the repository when a passphrase is set", async () => {
    const repo = fakeGithub();
    const laptop = connect("hunter2");
    const doc = makeDoc("사업 계획");

    await laptop.push(payload([doc]), (await laptop.pull()).version);
    const file = repo.files.get(`outliner/docs/${doc.id}.json`)!.text;
    expect(file).not.toContain("사업 계획");
    expect(file).toContain("PBKDF2-SHA256");

    // A second device with the same passphrase learns the salt from the file.
    const phone = connect("hunter2");
    expect((await phone.pull()).payload.docs[doc.id].title).toBe("사업 계획");
  });

  it("still commits nothing for an untouched document when encrypted", async () => {
    // The initialisation vector is fresh every time, so the ciphertext always
    // differs — only the plaintext may decide whether a file is rewritten.
    const repo = fakeGithub();
    const backend = connect("hunter2");
    const doc = makeDoc("stable");
    const version = await backend.push(payload([doc]), (await backend.pull()).version);
    repo.writes.length = 0;

    await backend.push(payload([reread(doc)]), version as Version);
    expect(repo.writes).toEqual([]);
  });

  it("stops rather than overwriting a workspace it cannot read", async () => {
    const repo = fakeGithub();
    const doc = makeDoc("locked away");
    await connect("hunter2").push(payload([doc]), { docs: {}, graves: null } as unknown as Version);
    const files = [...repo.files.keys()];

    // No passphrase, or the wrong one: unreadable is not the same as absent.
    await expect(connect().pull()).rejects.toSatisfy(isLocked);
    await expect(connect("wrong").pull()).rejects.toSatisfy(isLocked);
    expect([...repo.files.keys()]).toEqual(files);
  });

  it("encrypts a workspace that was already there in plaintext", async () => {
    const doc = makeDoc("plain to begin with");
    const repo = fakeGithub({ [`outliner/docs/${doc.id}.json`]: JSON.stringify(doc) });
    const backend = connect("hunter2");

    const stored = await backend.pull();
    expect(stored.payload.docs[doc.id].title).toBe("plain to begin with");

    await backend.push({ ...stored.payload, docs: { [doc.id]: { ...doc, title: "sealed now" } } }, stored.version);
    expect(repo.files.get(`outliner/docs/${doc.id}.json`)!.text).not.toContain("sealed now");
  });

  it("reads a folder path left over from the single-file layout as the same folder", async () => {
    const doc = makeDoc("legacy path");
    fakeGithub({ [`outliner/docs/${doc.id}.json`]: JSON.stringify(doc) });
    const backend = createBackend({ kind: "github", repo: "tester/notes", path: "outliner.json", token: "pat" });

    expect(Object.keys((await backend.pull()).payload.docs)).toEqual([doc.id]);
  });

  it("writes the document that buried a row before the one that received it", async () => {
    const repo = fakeGithub();
    const backend = connect();

    // Two documents already on the remote, so the mirror knows their graves.
    const source = makeDoc("source");
    const target = makeDoc("target");
    let version: Version = (await backend.push(payload([source, target]), (await backend.pull()).version)) ?? null;
    repo.writes.length = 0;

    // A row moves: the source gains a gravestone, the target gains the row.
    const moved = Object.keys(source.nodes).find((id) => id !== source.rootId)!;
    const rest = { ...source.nodes };
    delete rest[moved];
    const cut: Doc = {
      ...source,
      nodes: { ...rest, [source.rootId]: { ...source.nodes[source.rootId], children: [] } },
      graves: { [moved]: stamp() }
    };
    const grafted: Doc = {
      ...target,
      nodes: {
        ...target.nodes,
        [moved]: { ...source.nodes[moved], parent: target.rootId },
        [target.rootId]: {
          ...target.nodes[target.rootId],
          children: [...target.nodes[target.rootId].children, moved]
        }
      }
    };

    // Offered destination-first, so only the ordering rule can save it.
    version = (await backend.push(payload([grafted, cut]), version)) ?? null;
    expect(repo.writes).toEqual([`outliner/docs/${cut.id}.json`, `outliner/docs/${grafted.id}.json`]);
  });

  it("reads a document's past out of the commit log, and opens it with the same key", async () => {
    const repo = fakeGithub();
    const backend = connect("hunter2");
    const doc = makeDoc("history");
    const row = Object.keys(doc.nodes).find((id) => id !== doc.rootId)!;

    let version = (await backend.push(payload([{ ...doc, nodes: { ...doc.nodes, [row]: { ...doc.nodes[row], text: "first" } } }]), (await backend.pull()).version)) ?? null;
    version = (await backend.push(payload([{ ...doc, nodes: { ...doc.nodes, [row]: { ...doc.nodes[row], text: "second" } } }]), version)) ?? null;

    const revisions = await backend.history!.list(doc.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].message).toBe("outliner: history");

    // Newest first, so the older commit still holds the first wording — and it
    // is encrypted on disk, so reading it back proves the key is applied.
    expect(repo.files.get(`outliner/docs/${doc.id}.json`)!.text).not.toContain("second");
    expect((await backend.history!.read(doc.id, revisions[1].id))!.nodes[row].text).toBe("first");
    expect((await backend.history!.read(doc.id, revisions[0].id))!.nodes[row].text).toBe("second");
  });

  it("has no history to offer on a plain REST endpoint", () => {
    expect(createBackend({ kind: "rest", url: "https://example.test/notes", token: "" }).history).toBeUndefined();
  });
});
