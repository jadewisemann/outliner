import { describe, expect, it } from "vitest";
import { combineLocal } from "../store";
import { makeDoc, makeWorkspace, type Workspace } from "../types";

/** A workspace with one more document than `base`, as a second replica would hold. */
function withDoc(base: Workspace, title: string): Workspace {
  const doc = makeDoc(title);
  return { ...base, docs: { ...base.docs, [doc.id]: doc } };
}

describe("the webview database and the shell's replica", () => {
  it("uses whichever exists when only one does", () => {
    const workspace = makeWorkspace();
    expect(combineLocal(workspace, null)).toBe(workspace);
    expect(combineLocal(null, workspace)).toBe(workspace);
    expect(combineLocal(null, null)).toBeNull();
  });

  it("merges the two, so a lost webview database is made whole from the file", () => {
    const base = makeWorkspace();
    const stored = withDoc(base, "db only");
    const replica = withDoc(base, "file only");
    const combined = combineLocal(stored, replica)!;
    const titles = Object.values(combined.docs).map((doc) => doc.title).sort();
    expect(titles).toEqual(["Inbox", "db only", "file only"]);
    // Device-local state comes from the database copy.
    expect(combined.activeDocId).toBe(stored.activeDocId);
    expect(combined.views).toBe(stored.views);
  });
});
