import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackend, type Backend, type Version } from "../api/remote";
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
  let counter = 0;
  let blobReads = 0;

  const store = (path: string, text: string) => {
    counter += 1;
    files.set(path, { text, sha: `sha-${counter}` });
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

    const prefix = "/repos/tester/notes/contents/";
    if (!url.pathname.startsWith(prefix)) return reply(404, {});
    const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const held = files.get(path);

    if (method === "GET") {
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

const connect = (): Backend =>
  createBackend({ kind: "github", repo: "tester/notes", path: "outliner", token: "pat" });

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

  it("reads a folder path left over from the single-file layout as the same folder", async () => {
    const doc = makeDoc("legacy path");
    fakeGithub({ [`outliner/docs/${doc.id}.json`]: JSON.stringify(doc) });
    const backend = createBackend({ kind: "github", repo: "tester/notes", path: "outliner.json", token: "pat" });

    expect(Object.keys((await backend.pull()).payload.docs)).toEqual([doc.id]);
  });
});
