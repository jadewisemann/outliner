import { describe, expect, it } from "vitest";
import { backlinks, findNode, itemLinksIn, labelOf } from "../links";
import { patchNode } from "../../outline/tree";
import { makeDoc, makeWorkspace, type Doc, type Workspace } from "../../types";

/** Two documents: "Notes" with two rows, "Journal" with one that links to them. */
function seed(): { workspace: Workspace; notesId: string; rowId: string; linkerId: string } {
  let notes = makeDoc("Notes");
  const first = notes.nodes[notes.rootId].children[0];
  notes = patchNode(notes, first, { text: "the target row" });

  let journal = makeDoc("Journal");
  const linker = journal.nodes[journal.rootId].children[0];
  journal = patchNode(journal, linker, { text: `see ((${first})) and [[Notes]]` });

  const workspace: Workspace = {
    ...makeWorkspace(),
    docs: { [notes.id]: notes, [journal.id]: journal },
    activeDocId: notes.id
  };
  return { workspace, notesId: notes.id, rowId: first, linkerId: linker };
}

describe("item links", () => {
  it("reads the ids out of a row", () => {
    expect(itemLinksIn("a ((abc-123)) b ((x))")).toEqual(["abc-123", "x"]);
    expect(itemLinksIn("(( spaced ))")).toEqual([]);
  });

  it("renders from the target's current text, so the two cannot disagree", () => {
    const { workspace, rowId, notesId } = seed();
    expect(labelOf(workspace, rowId)).toBe("the target row");

    const renamed = { ...workspace, docs: { ...workspace.docs, [notesId]: patchNode(workspace.docs[notesId], rowId, { text: "renamed" }) } };
    expect(labelOf(renamed, rowId)).toBe("renamed");
  });

  it("reports a target that no longer exists rather than pretending", () => {
    const { workspace } = seed();
    expect(labelOf(workspace, "gone")).toBeNull();
    expect(findNode(workspace, "gone")).toBeNull();
  });

  it("finds a row wherever it lives", () => {
    const { workspace, rowId, notesId } = seed();
    expect(findNode(workspace, rowId)).toMatchObject({ docId: notesId, docTitle: "Notes" });
  });
});

describe("backlinks", () => {
  it("indexes both item links and document links in one pass", () => {
    const { workspace, rowId, notesId, linkerId } = seed();
    const index = backlinks(workspace);

    expect(index.get(rowId)?.map((source) => source.nodeId)).toEqual([linkerId]);
    expect(index.get(notesId)?.map((source) => source.nodeId)).toEqual([linkerId]);
  });

  it("does not count a row linking to itself", () => {
    let doc = makeDoc("self");
    const first = doc.nodes[doc.rootId].children[0];
    doc = patchNode(doc, first, { text: `((${first}))` });
    const workspace: Workspace = { ...makeWorkspace(), docs: { [doc.id]: doc }, activeDocId: doc.id };

    expect(backlinks(workspace).get(first)).toBeUndefined();
  });

  it("does not count a document linking to its own title", () => {
    let doc: Doc = makeDoc("Notes");
    const first = doc.nodes[doc.rootId].children[0];
    doc = patchNode(doc, first, { text: "about [[Notes]]" });
    const workspace: Workspace = { ...makeWorkspace(), docs: { [doc.id]: doc }, activeDocId: doc.id };

    expect(backlinks(workspace).get(doc.id)).toBeUndefined();
  });

  it("sees links written in a note as well as in the text", () => {
    const { workspace, rowId, notesId, linkerId } = seed();
    const journalId = Object.keys(workspace.docs).find((id) => id !== notesId)!;
    const moved = {
      ...workspace,
      docs: {
        ...workspace.docs,
        [journalId]: patchNode(workspace.docs[journalId], linkerId, { text: "plain", note: `((${rowId}))` })
      }
    };
    expect(backlinks(moved).get(rowId)?.map((source) => source.nodeId)).toEqual([linkerId]);
  });
});
