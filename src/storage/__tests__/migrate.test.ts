import { describe, expect, it } from "vitest";
import { migrate } from "../migrate";
import { visibleRows } from "../../outline/tree";
import { makeWorkspace } from "../../types";

/** A workspace in the shape version 3 stored: sibling order in `children` only. */
const V3 = {
  version: 3,
  activeDocId: "doc",
  docOrder: ["doc"],
  views: { doc: { zoomId: "root", focusId: "a" } },
  docs: {
    doc: {
      id: "doc",
      title: "Notes",
      rootId: "root",
      nodes: {
        root: { id: "root", text: "", children: ["a", "b"], note: "", collapsed: false, done: false, heading: 0 },
        a: { id: "a", text: "alpha", children: ["a1"], note: "a note", collapsed: false, done: false, heading: 1 },
        a1: { id: "a1", text: "alpha one", children: [], note: "", collapsed: true, done: true, heading: 0 },
        b: { id: "b", text: "beta", children: [], note: "", collapsed: false, done: false, heading: 0 }
      }
    }
  }
};

describe("migrate", () => {
  it("keeps the outline, its order, and its per-node flags", () => {
    const workspace = migrate(structuredClone(V3));
    const doc = workspace.docs.doc;

    expect(workspace.version).toBe(4);
    expect(doc.title).toBe("Notes");
    expect(visibleRows(doc, doc.rootId).map((row) => `${"  ".repeat(row.depth)}${row.node.text}`)).toEqual([
      "alpha",
      "  alpha one",
      "beta"
    ]);
    expect(doc.nodes.a.note).toBe("a note");
    expect(doc.nodes.a.heading).toBe(1);
    expect(doc.nodes.a1.done).toBe(true);
    expect(doc.nodes.a1.collapsed).toBe(true);
  });

  it("derives the position fields the merge depends on", () => {
    const doc = migrate(structuredClone(V3)).docs.doc;
    expect(doc.nodes.a.parent).toBe("root");
    expect(doc.nodes.a1.parent).toBe("a");
    expect(doc.nodes.root.parent).toBeNull();
    expect(doc.nodes.a.sort < doc.nodes.b.sort).toBe(true);
  });

  it("keeps where the reader was", () => {
    expect(migrate(structuredClone(V3)).views.doc.zoomId).toBe("root");
    expect(migrate(structuredClone(V3)).activeDocId).toBe("doc");
  });

  it("passes a current workspace through untouched", () => {
    const workspace = makeWorkspace();
    expect(migrate(workspace)).toBe(workspace);
  });

  it("falls back to a fresh workspace only for input it cannot read", () => {
    for (const input of [null, "nonsense", {}, { version: 3, docs: {} }]) {
      expect(migrate(input).docs).toBeDefined();
      expect(Object.keys(migrate(input).docs).length).toBeGreaterThan(0);
    }
  });
});
