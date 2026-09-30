import { describe, expect, it } from "vitest";
import { createHistory, insertAfter, makeWorkspace, patchNode, visibleRows, type Workspace } from "@/entities/outline";
import { mergeWorkspace } from "../merge";

/**
 * Undo re-stamps rather than restoring a snapshot (DESIGN.md principle 10):
 * what undo puts back has to beat the remote's copy in the next merge.
 */
function edit(workspace: Workspace, mutate: (doc: Workspace["docs"][string]) => Workspace["docs"][string]): Workspace {
  const doc = workspace.docs[workspace.activeDocId];
  return { ...workspace, docs: { ...workspace.docs, [doc.id]: mutate(doc) } };
}

describe("an undo and the next sync", () => {
  it("an undone edit survives the next sync", () => {
    // Restoring the old snapshot verbatim would lose: the remote still holds
    // the newer stamp, so the merge would put the typed text straight back.
    const history = createHistory();
    const before = makeWorkspace();
    const doc = before.docs[before.activeDocId];
    const row = doc.nodes[doc.rootId].children[0];

    const typed = edit(before, (current) => patchNode(current, row, { text: "typed on this device" }));
    const remote = { docs: typed.docs, graves: typed.graves, keymap: typed.keymap };

    history.record(before);
    const undone = history.undo(typed)!;
    const merged = mergeWorkspace({ docs: undone.docs, graves: undone.graves, keymap: undone.keymap }, remote);

    expect(merged.docs[doc.id].nodes[row].text).toBe("");
  });

  it("an undone row insertion is not resurrected by the next sync", () => {
    const history = createHistory();
    const before = makeWorkspace();
    const doc = before.docs[before.activeDocId];
    const row = doc.nodes[doc.rootId].children[0];

    const added = edit(before, (current) => insertAfter(current, row, "added").doc);
    const remote = { docs: added.docs, graves: added.graves, keymap: added.keymap };

    history.record(before);
    const undone = history.undo(added)!;
    const merged = mergeWorkspace({ docs: undone.docs, graves: undone.graves, keymap: undone.keymap }, remote);

    expect(visibleRows(merged.docs[doc.id], doc.rootId).map((r) => r.node.text)).toEqual([""]);
  });
});
