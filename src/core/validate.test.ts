import { describe, expect, it } from "vitest";
import { parseBackup, exportBackup } from "./formats";
import { mergeWorkspace } from "./merge";
import { makeWorkspace } from "./types";
import { MAX_SKEW_MS, readPayload, readWorkspace } from "./validate";

/** Whatever a sync endpoint or an imported file hands us, it must not crash the app. */
const HOSTILE: [string, unknown][] = [
  ["not an object", "hello"],
  ["null", null],
  ["docs missing", {}],
  ["docs not an object", { docs: [] }],
  ["graves missing", { docs: {} }],
  ["a null document", { docs: { a: null }, graves: {} }],
  ["a document with no root", { docs: { a: { id: "a", rootId: "r", nodes: {} } }, graves: {} }],
  ["nodes not an object", { docs: { a: { rootId: "r", nodes: 7 } }, graves: {} }],
  ["graves not an object", { docs: {}, graves: "x" }],
  ["a node id of __proto__", { docs: { a: { rootId: "r", nodes: { r: {}, __proto__: {} } } }, graves: {} }],
  ["a node id of constructor", { docs: { a: { rootId: "r", nodes: { r: {}, constructor: {} } } }, graves: {} }],
  ["a document id of __proto__", { docs: { __proto__: { rootId: "r", nodes: { r: {} } } }, graves: {} }]
];

describe("readPayload", () => {
  it.each(HOSTILE)("survives %s", (_label, value) => {
    const payload = readPayload(value);
    expect(() => mergeWorkspace({ docs: {}, graves: {} }, payload ?? { docs: {}, graves: {} })).not.toThrow();
  });

  it("drops prototype-chain keys instead of adopting them", () => {
    const payload = readPayload({ docs: { a: { rootId: "r", nodes: { r: {}, constructor: {} } } }, graves: {} });
    expect(Object.keys(payload!.docs.a.nodes)).toEqual(["r"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("pulls a far-future timestamp back to now", () => {
    const now = 1_000_000;
    const payload = readPayload(
      { docs: { a: { rootId: "r", nodes: { r: { edited: { at: Number.MAX_SAFE_INTEGER, by: "evil" } } } } }, graves: {} },
      now
    );
    expect(payload!.docs.a.nodes.r.edited.at).toBe(now + MAX_SKEW_MS);
  });

  it("severs links to nodes that did not survive validation", () => {
    const payload = readPayload({
      docs: { a: { rootId: "r", nodes: { r: { children: ["gone", "kept"] }, kept: { parent: "vanished" } } } },
      graves: {}
    });
    expect(payload!.docs.a.nodes.r.children).toEqual(["kept"]);
    expect(payload!.docs.a.nodes.kept.parent).toBeNull();
  });
});

describe("readWorkspace", () => {
  it("repairs an activeDocId that points nowhere", () => {
    const workspace = readWorkspace({ docs: { a: { rootId: "r", nodes: { r: {} } } }, activeDocId: "missing" });
    expect(workspace!.activeDocId).toBe("a");
  });

  it("rejects a workspace with no usable document", () => {
    expect(readWorkspace({ docs: {} })).toBeNull();
  });
});

describe("parseBackup", () => {
  it("round-trips a real backup", () => {
    const workspace = makeWorkspace();
    expect(parseBackup(exportBackup(workspace))?.activeDocId).toBe(workspace.activeDocId);
  });

  it("refuses a version it does not understand rather than emptying the workspace", () => {
    // Importing replaces everything, so a file from a newer build must not
    // quietly become a blank Inbox.
    expect(parseBackup(JSON.stringify({ version: 9, docs: { a: { rootId: "r", nodes: { r: {} } } } }))).toBeNull();
    expect(parseBackup(JSON.stringify({ docs: { a: 1 } }))).toBeNull();
    expect(parseBackup("not json")).toBeNull();
  });

  it("refuses a v4 backup whose documents are unusable", () => {
    expect(parseBackup(JSON.stringify({ version: 4, docs: { a: { id: "a", nodes: {} } } }))).toBeNull();
  });
});
