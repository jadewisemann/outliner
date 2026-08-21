import { describe, expect, it } from "vitest";
import { patchNode } from "../outline/tree";
import { hasContent, inboxDoc, makeDoc, makeFolder, makeWorkspace, type Doc, type Workspace } from "../types";

/** A workspace holding exactly the documents given, keyed by id. */
function workspaceOf(...docs: Doc[]): Workspace {
  return { ...makeWorkspace(), docs: Object.fromEntries(docs.map((doc) => [doc.id, doc])), activeDocId: docs[0].id };
}

const at = (doc: Doc, when: number): Doc => ({ ...doc, titleEdited: { at: when, by: "test" } });

describe("inboxDoc", () => {
  it("finds the marked document", () => {
    const plain = makeDoc("notes");
    const marked = makeDoc("capture", { inbox: true });
    expect(inboxDoc(workspaceOf(plain, marked))?.id).toBe(marked.id);
  });

  it("is null when nothing is marked", () => {
    expect(inboxDoc(workspaceOf(makeDoc("notes")))).toBeNull();
  });

  it("picks the newest mark, and the same one on every device", () => {
    // Two devices apart can each mark their own, and the merge has no reason to
    // prefer either — so the tie has to break the same way everywhere or a
    // capture would land in different documents depending on where it was made.
    const older = at(makeDoc("desk", { inbox: true }), 100);
    const newer = at(makeDoc("phone", { inbox: true }), 200);
    expect(inboxDoc(workspaceOf(older, newer))?.id).toBe(newer.id);
    expect(inboxDoc(workspaceOf(newer, older))?.id).toBe(newer.id);

    const [a, b] = [at(makeDoc("a", { inbox: true }), 100), at(makeDoc("b", { inbox: true }), 100)];
    const expected = a.id < b.id ? a.id : b.id;
    expect(inboxDoc(workspaceOf(a, b))?.id).toBe(expected);
    expect(inboxDoc(workspaceOf(b, a))?.id).toBe(expected);
  });

  it("ignores a mark that cannot hold a capture", () => {
    // A folder holds no outline, and a trashed document is on its way out.
    expect(inboxDoc(workspaceOf(makeDoc("notes"), makeFolder("filed", { inbox: true })))).toBeNull();
    const binned = { ...makeDoc("gone", { inbox: true }), deleted: { at: 1, by: "test" } };
    expect(inboxDoc(workspaceOf(makeDoc("notes"), binned))).toBeNull();
  });
});

describe("hasContent", () => {
  it("is false for a workspace nobody has typed into", () => {
    // A durability warning greeting a first visit would be warning about the
    // loss of nothing.
    expect(hasContent(makeWorkspace())).toBe(false);
  });

  it("is true once a row carries text or a note", () => {
    const doc = makeDoc("notes");
    const first = doc.nodes[doc.rootId].children[0];
    expect(hasContent(workspaceOf(patchNode(doc, first, { text: "buy milk" })))).toBe(true);
    expect(hasContent(workspaceOf(patchNode(doc, first, { note: "why" })))).toBe(true);
    // Whitespace is not something to lose.
    expect(hasContent(workspaceOf(patchNode(doc, first, { text: "   " })))).toBe(false);
  });
});
