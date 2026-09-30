import { describe, expect, it } from "vitest";
import { MAX_SKEW_MS } from "@/shared/lib/clock";
import { exportBackup, parseBackup } from "../../lib/formats";
import { makeWorkspace } from "../types";
import { readPayload, readWorkspace } from "../validate";

describe("readPayload", () => {
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

  it("keeps a stored keyboard table and drops a malformed one", () => {
    const doc = { rootId: "r", nodes: { r: { children: [] } } };
    const of = (keymap: unknown) => readPayload({ docs: { a: doc }, graves: {}, keymap })?.keymap;

    expect(of({ keys: { bold: "Mod+B" }, edited: { at: 5, by: "laptop" } })?.keys.bold).toBe("Mod+B");
    // An action this build has never heard of is kept, not erased: an older
    // build must not take away a binding a newer one added.
    expect(of({ keys: { somethingNew: "Mod+J" } })?.keys.somethingNew).toBe("Mod+J");

    expect(of(null)).toBeNull();
    expect(of({ keys: "not a table" })).toBeNull();
    expect(of({ keys: {} })).toBeNull();
    expect(of({ keys: { bold: 7 } })).toBeNull();
    expect(of({ keys: { bold: "x".repeat(200) } })).toBeNull();
  });

  it("refuses a v4 backup whose documents are unusable", () => {
    expect(parseBackup(JSON.stringify({ version: 4, docs: { a: { id: "a", nodes: {} } } }))).toBeNull();
  });
});
