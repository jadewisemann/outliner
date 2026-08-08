import { describe, expect, it } from "vitest";
import { createHistory } from "./history";
import { mergeWorkspace } from "./merge";
import { insertAfter, patchNode, visibleRows } from "./tree";
import { makeWorkspace, type Workspace } from "./types";

const text = (workspace: Workspace) => {
  const doc = workspace.docs[workspace.activeDocId];
  return visibleRows(doc, doc.rootId).map((row) => row.node.text);
};

function edit(workspace: Workspace, mutate: (doc: Workspace["docs"][string]) => Workspace["docs"][string]): Workspace {
  const doc = workspace.docs[workspace.activeDocId];
  return { ...workspace, docs: { ...workspace.docs, [doc.id]: mutate(doc) } };
}

describe("createHistory", () => {
  it("restores the previous state", () => {
    const history = createHistory();
    const first = makeWorkspace();
    const row = first.docs[first.activeDocId].nodes[first.docs[first.activeDocId].rootId].children[0];

    const second = edit(first, (doc) => patchNode(doc, row, { text: "typed" }));
    history.record(first);
    expect(text(history.undo(second)!)).toEqual([""]);
  });

  it("an undone edit survives the next sync", () => {
    // Restoring the old snapshot verbatim would lose: the remote still holds
    // the newer stamp, so the merge would put the typed text straight back.
    const history = createHistory();
    const before = makeWorkspace();
    const doc = before.docs[before.activeDocId];
    const row = doc.nodes[doc.rootId].children[0];

    const typed = edit(before, (current) => patchNode(current, row, { text: "typed on this device" }));
    const remote = { docs: typed.docs, graves: typed.graves };

    history.record(before);
    const undone = history.undo(typed)!;
    const merged = mergeWorkspace({ docs: undone.docs, graves: undone.graves }, remote);

    expect(merged.docs[doc.id].nodes[row].text).toBe("");
  });

  it("an undone row insertion is not resurrected by the next sync", () => {
    const history = createHistory();
    const before = makeWorkspace();
    const doc = before.docs[before.activeDocId];
    const row = doc.nodes[doc.rootId].children[0];

    const added = edit(before, (current) => insertAfter(current, row, "added").doc);
    const remote = { docs: added.docs, graves: added.graves };

    history.record(before);
    const undone = history.undo(added)!;
    const merged = mergeWorkspace({ docs: undone.docs, graves: undone.graves }, remote);

    expect(visibleRows(merged.docs[doc.id], doc.rootId).map((r) => r.node.text)).toEqual([""]);
  });

  it("redo puts it back", () => {
    const history = createHistory();
    const before = makeWorkspace();
    const doc = before.docs[before.activeDocId];
    const row = doc.nodes[doc.rootId].children[0];

    const typed = edit(before, (current) => patchNode(current, row, { text: "typed" }));
    history.record(before);
    const undone = history.undo(typed)!;
    expect(text(history.redo(undone)!)).toEqual(["typed"]);
  });

  it("coalesces a run of edits sharing a key into one step", () => {
    const history = createHistory();
    const start = makeWorkspace();
    const doc = start.docs[start.activeDocId];
    const row = doc.nodes[doc.rootId].children[0];

    let current = start;
    for (const value of ["h", "he", "hel"]) {
      const next = edit(current, (now) => patchNode(now, row, { text: value }));
      history.record(current, `text:${row}`);
      current = next;
    }
    expect(text(history.undo(current)!)).toEqual([""]);
    expect(history.undo(current)).toBeNull();
  });

  it("has nothing to undo after a merge invalidates the stack", () => {
    const history = createHistory();
    const start = makeWorkspace();
    history.record(start);
    history.clear();
    expect(history.undo(start)).toBeNull();
  });
});
