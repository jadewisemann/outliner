import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackend, type Backend } from "../api/remote";
import { createKeyring, isLocked } from "../api/cipher";
import { mergeWorkspace } from "../merge";
import { lacks, shouldPush } from "../push";
import { makeDoc, makeNode, type SyncPayload } from "../../types";

/**
 * The shell's folder commands, in memory, with the same rules as
 * `src-tauri/src/folder.rs`: a write goes through only over the stamp it was
 * read at, and only names that look like conflict copies are ever removed.
 * `folder.rs` has its own tests for the disk side; these hold the web side to
 * what it does with the answers.
 */
function fakeFolder() {
  const files = new Map<string, string>();
  const retired: string[] = [];
  const stampOf = (text: string) => `${text.length}:${[...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`;
  const isCopy = (name: string) =>
    name !== "outliner.json" &&
    name.startsWith("outliner") &&
    name.endsWith(".json") &&
    /^[ .\-(_]/.test(name.slice(8)) &&
    !/^outliner copy( \d+)?\.json$/.test(name);
  const retire = (copies: { name: string; stamp: string }[]) => {
    for (const { name, stamp } of copies) {
      const text = files.get(name);
      if (!isCopy(name) || text === undefined || stampOf(text) !== stamp) continue;
      files.delete(name);
      retired.push(name);
    }
    return [];
  };

  const invoke = async (command: string, args: Record<string, unknown> = {}) => {
    if (command === "folder_read") {
      const canonical = files.get("outliner.json");
      return {
        canonical: canonical === undefined ? null : { name: "outliner.json", text: canonical, stamp: stampOf(canonical) },
        copies: [...files]
          .filter(([name]) => isCopy(name))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([name, text]) => ({ name, text, stamp: stampOf(text) }))
      };
    }
    if (command === "folder_write") {
      const current = files.get("outliner.json");
      if ((current === undefined ? null : stampOf(current)) !== args.expect) return null;
      files.set("outliner.json", String(args.text));
      retire(args.retire as { name: string; stamp: string }[]);
      return stampOf(String(args.text));
    }
    if (command === "folder_retire") return retire(args.copies as { name: string; stamp: string }[]);
    if (command === "folder_set_aside") {
      const current = files.get("outliner.json");
      if (current === undefined || stampOf(current) !== args.expect) return false;
      files.delete("outliner.json");
      files.set("outliner.unreadable-1.json", current);
      return true;
    }
    throw new Error(`unexpected command ${command}`);
  };
  return { files, retired, invoke };
}

function payloadWith(...texts: string[]): SyncPayload {
  const doc = makeDoc("notes");
  for (const text of texts) {
    const node = makeNode({ text, parent: doc.rootId });
    doc.nodes[node.id] = node;
  }
  return { docs: { [doc.id]: doc }, graves: {}, keymap: null };
}

const texts = (payload: SyncPayload) =>
  Object.values(payload.docs)
    .flatMap((doc) => Object.values(doc.nodes).map((node) => node.text))
    .filter(Boolean)
    .sort();

/** One round of the sync loop, reduced to the part the folder backend changes. */
async function round(backend: Backend, local: SyncPayload, unpushed = false): Promise<SyncPayload> {
  const stored = await backend.pull();
  const merged = mergeWorkspace(local, stored.payload);
  if (shouldPush({ stored, local: merged, unpushed, unguarded: backend.unguarded === true })) {
    expect(await backend.push(merged, stored.version)).not.toBeNull();
  }
  return merged;
}

let folder: ReturnType<typeof fakeFolder>;
beforeEach(() => {
  folder = fakeFolder();
  (window as unknown as { __TAURI__: unknown }).__TAURI__ = { core: { invoke: folder.invoke } };
});
afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

const open = (passphrase?: string) => createBackend({ kind: "file", dir: "/notes", passphrase });

describe("folder backend", () => {
  it("writes the REST backend's format, so the file moves between the two", async () => {
    const backend = open();
    await round(backend, payloadWith("첫 줄"), true);
    const written = JSON.parse(folder.files.get("outliner.json")!);
    expect(texts(written)).toEqual(["첫 줄"]);
  });

  it("refuses a write over a file that changed since it was read", async () => {
    const backend = open();
    await round(backend, payloadWith("a"), true);
    const stored = await backend.pull();
    folder.files.set("outliner.json", JSON.stringify(payloadWith("someone else")));
    expect(await backend.push(payloadWith("mine"), stored.version)).toBeNull();
  });

  it("repairs a file that a sync service replaced with an older copy", async () => {
    const a = open();
    const b = open();
    const first = await round(a, payloadWith("from A"), true);
    let onB = await round(b, payloadWith());
    onB = mergeWorkspace(onB, payloadWith("from B"));
    onB = await round(b, onB, true);

    // The service puts A's old version back without asking. B has no new
    // edits, so only the unguarded check notices.
    folder.files.set("outliner.json", JSON.stringify(first));
    const stored = await b.pull();
    expect(lacks(stored.payload, onB)).toBe(true);
    await round(b, onB);
    expect(texts(JSON.parse(folder.files.get("outliner.json")!))).toEqual(["from A", "from B"]);
  });

  it("stays quiet when idle, so a shared folder is not rewritten every few seconds", async () => {
    const backend = open();
    const local = await round(backend, payloadWith("a"), true);
    const before = folder.files.get("outliner.json");
    const stored = await backend.pull();
    expect(shouldPush({ stored, local, unpushed: false, unguarded: true })).toBe(false);
    expect(folder.files.get("outliner.json")).toBe(before);
  });

  it("merges conflict copies, writes the result, then moves aside only what it merged", async () => {
    const backend = open();
    await round(backend, payloadWith("canonical"), true);
    folder.files.set("outliner (Jade's conflicted copy 2026-09-29).json", JSON.stringify(payloadWith("in copy")));
    folder.files.set("outliner.sync-conflict-20260929-101010-ABC.json", "not json {");
    folder.files.set("outliner copy.json", JSON.stringify(payloadWith("a snapshot someone kept")));
    folder.files.set("notes.json", JSON.stringify(payloadWith("unrelated")));

    const stored = await backend.pull();
    expect(stored.rewrite).toBe(true);
    const merged = await round(backend, payloadWith());

    expect(texts(merged)).toEqual(["canonical", "in copy"]);
    expect(texts(JSON.parse(folder.files.get("outliner.json")!))).toEqual(["canonical", "in copy"]);
    expect(folder.retired).toEqual(["outliner (Jade's conflicted copy 2026-09-29).json"]);
    // Unreadable is not the same as empty: that one stays for a person to look at.
    expect(folder.files.has("outliner.sync-conflict-20260929-101010-ABC.json")).toBe(true);
    // Finder's Duplicate is a person's snapshot, not a sync service's copy.
    expect(folder.files.has("outliner copy.json")).toBe(true);
    expect(folder.files.has("notes.json")).toBe(true);
  });

  it("moves a copy the file already covers without rewriting the file", async () => {
    const backend = open();
    const local = await round(backend, payloadWith("a"), true);
    const before = folder.files.get("outliner.json");
    folder.files.set("outliner (1).json", before!);
    const stored = await backend.pull();
    expect(stored.rewrite).toBe(false);
    expect(shouldPush({ stored, local, unpushed: false, unguarded: true })).toBe(false);
    expect(folder.retired).toEqual(["outliner (1).json"]);
    expect(folder.files.get("outliner.json")).toBe(before);
  });

  it("does not move a copy that changed after it was merged", async () => {
    const backend = open();
    await round(backend, payloadWith("a"), true);
    folder.files.set("outliner (1).json", JSON.stringify(payloadWith("first")));
    const stored = await backend.pull();
    // The sync service delivers a newer version under the same name mid-round.
    folder.files.set("outliner (1).json", JSON.stringify(payloadWith("second")));
    await backend.push(stored.payload, stored.version);
    expect(folder.retired).toEqual([]);
    const next = await round(backend, stored.payload);
    expect(texts(next)).toContain("second");
  });

  it("sets an unreadable file aside instead of writing over it", async () => {
    const backend = open();
    folder.files.set("outliner.json", "{ half a file");
    await round(backend, payloadWith("mine"));
    expect(folder.files.get("outliner.unreadable-1.json")).toBe("{ half a file");
    expect(texts(JSON.parse(folder.files.get("outliner.json")!))).toEqual(["mine"]);
  });

  it("skips a copy sealed with a passphrase this device does not have, and leaves it", async () => {
    const backend = open();
    await round(backend, payloadWith("a"), true);
    folder.files.set("outliner 2.json", await createKeyring("other").seal(JSON.stringify(payloadWith("secret"))));
    const stored = await backend.pull();
    expect(texts(stored.payload)).toEqual(["a"]);
    expect(folder.files.has("outliner 2.json")).toBe(true);
  });

  it("stops at a canonical file sealed with a passphrase this device does not have", async () => {
    folder.files.set("outliner.json", await createKeyring("other").seal(JSON.stringify(payloadWith("secret"))));
    await expect(open().pull()).rejects.toSatisfy(isLocked);
  });

  it("hands back the same answer for an unchanged folder", async () => {
    const backend = open();
    await round(backend, payloadWith("a"), true);
    const first = await backend.pull();
    expect(await backend.pull()).toBe(first);
  });

  it("seals the file when a passphrase is set, and reads it back", async () => {
    const backend = open("pw");
    await round(backend, payloadWith("비밀"), true);
    expect(folder.files.get("outliner.json")).not.toContain("비밀");
    const again = await open("pw").pull();
    expect(texts(again.payload)).toEqual(["비밀"]);
  });
});

describe("shouldPush", () => {
  // With `children` rebuilt, as every real workspace is (principle 5). The
  // fixture adds rows without linking them, and an unlinked payload merges
  // into a new object even with nothing to add.
  const settled = (payload: SyncPayload) => mergeWorkspace(payload, payload);
  const stored = { payload: settled(payloadWith("x")), version: "v1" };

  it("pushes unpushed edits, an empty remote, and a rewrite request", () => {
    const local = stored.payload;
    expect(shouldPush({ stored, local, unpushed: true, unguarded: false })).toBe(true);
    expect(shouldPush({ stored: { ...stored, version: null }, local, unpushed: false, unguarded: false })).toBe(true);
    expect(shouldPush({ stored: { ...stored, rewrite: true }, local, unpushed: false, unguarded: false })).toBe(true);
  });

  it("leaves a guarded remote alone even when it lacks something — CAS already covers that", () => {
    const local = mergeWorkspace(stored.payload, payloadWith("more"));
    expect(shouldPush({ stored, local, unpushed: false, unguarded: false })).toBe(false);
    expect(shouldPush({ stored, local, unpushed: false, unguarded: true })).toBe(true);
  });

  it("finds nothing missing when the remote already holds it all", () => {
    expect(lacks(stored.payload, stored.payload)).toBe(false);
    expect(lacks(stored.payload, payloadWith("new doc"))).toBe(true);
  });
});
