import { describe, expect, it } from "vitest";
import {
  moveInto,
  moveToDoc,
  nestsInto,
  remove,
  rename,
  reorder,
  restore,
  restoreVersion,
  select,
  setInbox,
  toggleBookmark
} from "../documents";
import { makeDoc, makeFolder, makeWorkspace, type Doc, type Workspace } from "../types";

/** A workspace holding exactly the documents given, keyed by id; the first one is open. */
function workspaceOf(...docs: Doc[]): Workspace {
  return { ...makeWorkspace(), docs: Object.fromEntries(docs.map((doc) => [doc.id, doc])), activeDocId: docs[0].id };
}

/**
 * The same workspace, except that reading its documents far more often than
 * any walk over a handful of them needs throws. A walk that never ends then
 * fails the test instead of hanging the run, which is what it did to the tab.
 */
function bounded(workspace: Workspace): Workspace {
  let reads = 0;
  const docs = new Proxy(workspace.docs, {
    get(target, key, receiver) {
      reads += 1;
      if (reads > 1_000) throw new Error("the walk up the folders did not end");
      return Reflect.get(target, key, receiver);
    }
  });
  return { ...workspace, docs };
}

describe("nestsInto", () => {
  const top = makeFolder("top");
  const middle = makeFolder("middle", { parent: top.id });
  const bottom = makeFolder("bottom", { parent: middle.id });
  const aside = makeFolder("aside");
  const workspace = workspaceOf(top, middle, bottom, aside);

  it("counts a folder filed into itself", () => {
    expect(nestsInto(workspace, top.id, top.id)).toBe(true);
  });

  it("counts a folder filed into its own descendant", () => {
    expect(nestsInto(workspace, top.id, middle.id)).toBe(true);
    expect(nestsInto(workspace, top.id, bottom.id)).toBe(true);
  });

  it("allows an unrelated folder, an ancestor, and the top level", () => {
    expect(nestsInto(workspace, top.id, aside.id)).toBe(false);
    expect(nestsInto(workspace, bottom.id, top.id)).toBe(false);
    expect(nestsInto(workspace, top.id, null)).toBe(false);
  });

  it("ends on a loop that is already there", () => {
    // Two devices filing A into B and B into A at the same time: each
    // document's position merges on its own, so both moves land.
    const notes = makeDoc("notes");
    const a = makeFolder("A");
    const b = makeFolder("B", { parent: a.id });
    const looped = bounded(workspaceOf(notes, { ...a, parent: b.id }, b));

    expect(nestsInto(looped, notes.id, a.id)).toBe(false);
    expect(nestsInto(looped, notes.id, b.id)).toBe(false);
    // The loop passes through A, so B still counts as being under A.
    expect(nestsInto(looped, a.id, b.id)).toBe(true);
  });
});

describe("filing into a folder caught in a loop", () => {
  const notes = makeDoc("notes");
  const a = makeFolder("A");
  const b = makeFolder("B", { parent: a.id });
  const looped = () => bounded(workspaceOf(notes, { ...a, parent: b.id }, b));

  it("files the document instead of hanging", () => {
    expect(moveInto(looped(), notes.id, a.id).docs[notes.id].parent).toBe(a.id);
    expect(reorder(looped(), notes.id, a.id, 0).docs[notes.id].parent).toBe(a.id);
  });

  it("can take a folder of the loop back to the top level, which breaks the loop", () => {
    expect(moveInto(looped(), a.id, null).docs[a.id].parent).toBeNull();
    expect(reorder(looped(), b.id, null, 0).docs[b.id].parent).toBeNull();
  });
});

describe("an operation with nothing to do", () => {
  it("returns the very workspace it was given", () => {
    // The store drops an edit whose result is the workspace it started from,
    // and React skips the render (DESIGN.md principle 4).
    const notes = makeDoc("notes", { inbox: true });
    const folder = makeFolder("folder");
    const binned = { ...makeDoc("binned"), deleted: { at: 1, by: "test" } };
    const workspace = workspaceOf(notes, folder, binned);
    const row = notes.nodes[notes.rootId].children[0];

    const results: [string, Workspace][] = [
      ["inbox on a folder", setInbox(workspace, folder.id)],
      ["inbox where it already is", setInbox(workspace, notes.id)],
      ["bookmark on nothing", toggleBookmark(workspace, "missing")],
      ["rename nothing", rename(workspace, "missing", "title")],
      ["file nothing", moveInto(workspace, "missing", null)],
      ["file a folder into itself", moveInto(workspace, folder.id, folder.id)],
      ["trash the last document", remove(workspace, notes.id)],
      ["trash what is in the trash", remove(workspace, binned.id)],
      ["restore what is not in the trash", restore(workspace, notes.id)],
      ["restore a version of nothing", restoreVersion(workspace, makeDoc("gone"))],
      ["open a folder", select(workspace, folder.id)],
      ["open the trash", select(workspace, binned.id)],
      ["drop a folder into itself", reorder(workspace, folder.id, folder.id, 0)],
      ["move a row into a folder", moveToDoc(workspace, row, folder.id)],
      ["move a row into its own document", moveToDoc(workspace, row, notes.id)]
    ];
    for (const [what, result] of results) expect(result, what).toBe(workspace);
  });
});
