import { describe, expect, it } from "vitest";
import {
  appendChild,
  bulkIndent,
  bulkPatch,
  bulkOutdent,
  bulkRemove,
  indent,
  insertAfter,
  insertOutlineText,
  mergeIntoPrevious,
  moveVertically,
  outdent,
  patchNode,
  reparent,
  splitAt,
  toOutlineText,
  widerScope,
  bulkMove,
  linkChildren,
  subtree,
  visibleRows
} from "../tree";
import { makeDoc, makeNode, type Doc, type Id } from "../../types";

/** Builds a document from indented text; a lone `~` stands for an empty row. */
function build(outline: string): Doc {
  const doc = makeDoc("test");
  const root = doc.nodes[doc.rootId];
  root.children = [];
  const stack: { depth: number; id: Id }[] = [];

  for (const raw of outline.trim().split("\n")) {
    const depth = (raw.match(/^ */)?.[0].length ?? 0) / 2;
    const node = makeNode({ text: raw.trim() === "~" ? "" : raw.trim() });
    doc.nodes[node.id] = node;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parentId = stack[stack.length - 1]?.id ?? doc.rootId;
    doc.nodes[parentId].children.push(node.id);
    stack.push({ depth, id: node.id });
  }
  return linkChildren(doc);
}

/**
 * Renders the outline, and asserts on the way that the `children` cache still
 * agrees with the `parent`/`sort` fields the merge relies on. Every operation
 * in this file is checked against that invariant for free.
 */
const shape = (doc: Doc) => {
  for (const node of Object.values(doc.nodes)) {
    for (const child of node.children) {
      expect(doc.nodes[child]?.parent, `parent of ${doc.nodes[child]?.text}`).toBe(node.id);
    }
    const sorts = node.children.map((child) => doc.nodes[child].sort);
    expect(sorts, `sibling order under ${node.text}`).toEqual([...sorts].sort());
  }
  return visibleRows(doc, doc.rootId)
    .map((row) => `${"  ".repeat(row.depth)}${row.node.text}`)
    .join("\n");
};

const find = (doc: Doc, text: string): Id => Object.values(doc.nodes).find((node) => node.text === text)!.id;

describe("visibleRows", () => {
  it("hides children of a collapsed node but keeps the node itself", () => {
    const doc = build(`
a
  a1
b`);
    const collapsed = patchNode(doc, find(doc, "a"), { collapsed: true });
    expect(shape(collapsed)).toBe("a\nb");
  });
});

describe("splitAt", () => {
  it("keeps the head in place and hands the children to the tail", () => {
    const doc = build(`
hello world
  child`);
    const { doc: next, focusId } = splitAt(doc, find(doc, "hello world"), 5);
    expect(shape(next)).toBe("hello\n world\n  child");
    expect(next.nodes[focusId!].text).toBe(" world");
  });

  it("splitting at the end makes a new empty sibling below", () => {
    const doc = build("only");
    const { doc: next, focusId } = splitAt(doc, find(doc, "only"), 4);
    expect(shape(next)).toBe("only\n");
    expect(next.nodes[focusId!].text).toBe("");
  });
});

describe("mergeIntoPrevious", () => {
  it("joins a row into its preceding sibling", () => {
    const doc = build(`
one
two`);
    const { doc: next, caret } = mergeIntoPrevious(doc, doc.rootId, find(doc, "two"));
    expect(shape(next)).toBe("onetwo");
    expect(caret).toBe(3);
  });

  it("moves orphaned children under the row that absorbed the text", () => {
    const doc = build(`
one
two
  child`);
    const { doc: next } = mergeIntoPrevious(doc, doc.rootId, find(doc, "two"));
    expect(shape(next)).toBe("onetwo\n  child");
  });

  it("leaves children in place when merging a first child into its parent", () => {
    const doc = build(`
parent
  first
    grandchild
  second`);
    const { doc: next } = mergeIntoPrevious(doc, doc.rootId, find(doc, "first"));
    expect(shape(next)).toBe("parentfirst\n  grandchild\n  second");
  });

  it("does nothing at the very first row", () => {
    const doc = build("one");
    expect(mergeIntoPrevious(doc, doc.rootId, find(doc, "one")).doc).toBe(doc);
  });
});

describe("indent and outdent", () => {
  it("indents under the previous sibling, carrying the subtree", () => {
    const doc = build(`
a
b
  b1`);
    const { doc: next } = indent(doc, find(doc, "b"));
    expect(shape(next)).toBe("a\n  b\n    b1");
  });

  it("refuses to indent the first child", () => {
    const doc = build("a\nb");
    expect(indent(doc, find(doc, "a")).doc).toBe(doc);
  });

  it("outdents to just after the former parent", () => {
    const doc = build(`
a
  a1
  a2
b`);
    const { doc: next } = outdent(doc, find(doc, "a1"), doc.rootId);
    expect(shape(next)).toBe("a\n  a2\na1\nb");
  });

  it("refuses to outdent at the zoom root's top level", () => {
    const doc = build("a");
    expect(outdent(doc, find(doc, "a"), doc.rootId).doc).toBe(doc);
  });
});

describe("moveVertically", () => {
  it("swaps with the sibling above and stops at the top of the zoom", () => {
    const doc = build("a\nb");
    const moved = moveVertically(doc, find(doc, "b"), -1, doc.rootId).doc;
    expect(shape(moved)).toBe("b\na");
    expect(moveVertically(moved, find(moved, "b"), -1, doc.rootId).doc).toBe(moved);
  });

  it("leaves the parent at the end of its list instead of stopping", () => {
    const doc = build(`
a
  a1
b`);
    const moved = moveVertically(doc, find(doc, "a1"), 1, doc.rootId).doc;
    expect(shape(moved)).toBe("a\nb\na1");
    expect(moveVertically(moved, find(moved, "a1"), 1, doc.rootId).doc).toBe(moved);
  });

  it("enters the row below when that row is expanded", () => {
    const doc = build(`
a
  a1
  a2
b
  b1`);
    expect(shape(moveVertically(doc, find(doc, "a2"), 1, doc.rootId).doc)).toBe("a\n  a1\nb\n  a2\n  b1");
  });

  it("steps over a collapsed row rather than into it", () => {
    const doc = build(`
a
  a1
  a2
b
  b1`);
    const collapsed = patchNode(doc, find(doc, "b"), { collapsed: true });
    expect(shape(moveVertically(collapsed, find(collapsed, "a2"), 1, doc.rootId).doc)).toBe("a\n  a1\nb\na2");
  });

  it("takes the level of the deepest row above when moving up", () => {
    const doc = build(`
a
  a1
b`);
    expect(shape(moveVertically(doc, find(doc, "b"), -1, doc.rootId).doc)).toBe("a\n  b\n  a1");
  });

  it("carries a whole selection across a level boundary", () => {
    const doc = build(`
a
  a1
  a2
b
  b1`);
    const chosen = [find(doc, "a1"), find(doc, "a2")];
    expect(shape(bulkMove(doc, doc.rootId, chosen, 1).doc)).toBe("a\nb\n  a1\n  a2\n  b1");
  });
});

describe("widerScope", () => {
  const doc = build(`
a
  a1
    a11
  a2
b`);
  const rows = visibleRows(doc, doc.rootId);
  const texts = (ids: Id[]) => ids.map((id) => doc.nodes[id].text);

  it("grows from a row to what hangs under it, then to the list it sits in", () => {
    const own = widerScope(rows, [find(doc, "a")]);
    expect(texts(own)).toEqual(["a", "a1", "a11", "a2"]);
    expect(texts(widerScope(rows, own))).toEqual(["a", "a1", "a11", "a2", "b"]);
  });

  it("skips a step that would not grow the selection", () => {
    // a11 is a childless only child, so both its own subtree and its own list
    // are just itself; the first press has to land on a1's list.
    expect(texts(widerScope(rows, [find(doc, "a11")]))).toEqual(["a1", "a11", "a2"]);
  });

  it("stops once everything drawn is held", () => {
    const all = rows.map((row) => row.id);
    expect(widerScope(rows, all)).toBe(all);
  });
});

describe("removeNode", () => {
  it("deletes the subtree and focuses the row above", () => {
    const doc = build(`
a
b
  b1`);
    const before = Object.keys(doc.nodes).length;
    const { doc: next, focusId } = bulkRemove(doc, doc.rootId, [find(doc, "b")]);
    expect(shape(next)).toBe("a");
    expect(Object.keys(next.nodes).length).toBe(before - 2);
    expect(next.nodes[focusId!].text).toBe("a");
  });
});

describe("reparent", () => {
  it("moves a row under a new parent", () => {
    const doc = build(`
a
b`);
    const { doc: next } = reparent(doc, find(doc, "b"), find(doc, "a"), 0);
    expect(shape(next)).toBe("a\n  b");
  });

  it("refuses to drop a row inside its own subtree", () => {
    const doc = build(`
a
  a1`);
    expect(reparent(doc, find(doc, "a"), find(doc, "a1"), 0).doc).toBe(doc);
  });
});

describe("bulk operations", () => {
  const doc = build(`
head
a
b
c`);

  it("indents a selection under the row above it", () => {
    const ids = [find(doc, "a"), find(doc, "b"), find(doc, "c")];
    expect(shape(bulkIndent(doc, doc.rootId, ids).doc)).toBe("head\n  a\n  b\n  c");
  });

  it("outdent reverses indent", () => {
    const ids = [find(doc, "a"), find(doc, "b")];
    const indented = bulkIndent(doc, doc.rootId, ids).doc;
    expect(shape(bulkOutdent(indented, doc.rootId, ids).doc)).toBe(shape(doc));
  });

  it("skips rows whose parent is also selected", () => {
    const nested = build(`
head
a
  a1`);
    const ids = [find(nested, "a"), find(nested, "a1")];
    expect(shape(bulkIndent(nested, nested.rootId, ids).doc)).toBe("head\n  a\n    a1");
  });

  it("gives a whole selection one display flag, leaving the shape alone", () => {
    const ids = [find(doc, "a"), find(doc, "c")];
    const next = bulkPatch(doc, ids, { color: 3 }).doc;
    expect(shape(next)).toBe(shape(doc));
    expect(ids.map((id) => next.nodes[id].color)).toEqual([3, 3]);
    expect(next.nodes[find(doc, "b")].color).toBe(0);
  });

  it("returns the very same document when nothing would change", () => {
    // DESIGN.md 원칙 4: no-op detection and the render skip both hang on
    // object identity, so a same-value write must not build a new map.
    const ids = [find(doc, "a"), find(doc, "b")];
    const coloured = bulkPatch(doc, ids, { color: 2 }).doc;
    expect(bulkPatch(coloured, ids, { color: 2 }).doc).toBe(coloured);
    expect(bulkPatch(doc, [], { color: 2 }).doc).toBe(doc);
  });

  it("removes every selected row and focuses the survivor above", () => {
    const ids = [find(doc, "a"), find(doc, "c")];
    const { doc: next, focusId } = bulkRemove(doc, doc.rootId, ids);
    expect(shape(next)).toBe("head\nb");
    expect(next.nodes[focusId!].text).toBe("head");
  });
});

describe("insertOutlineText", () => {
  it("rebuilds indentation and replaces the empty row it was pasted into", () => {
    const doc = build(`
keep
~`);
    const target = visibleRows(doc, doc.rootId)[1].id;
    const { doc: next, focusId } = insertOutlineText(doc, target, "- one\n  - one-a\n- two");
    expect(shape(next)).toBe("keep\none\n  one-a\ntwo");
    expect(next.nodes[focusId!].text).toBe("two");
  });

  it("keeps a non-empty row and inserts after it", () => {
    const doc = build("keep");
    const { doc: next } = insertOutlineText(doc, find(doc, "keep"), "one\n  two");
    expect(shape(next)).toBe("keep\none\n  two");
  });
});

describe("toOutlineText", () => {
  it("round-trips through insertOutlineText", () => {
    const doc = build(`
one
  one-a
two`);
    const text = toOutlineText(doc, doc.nodes[doc.rootId].children);
    expect(text).toBe("one\n  one-a\ntwo");
  });
});

describe("regressions", () => {
  it("pressing Enter at the start of a line keeps that row's identity", () => {
    // Reusing the id for the tail would leave the original id holding an empty
    // row, so a merge could resolve another device's text into the blank one.
    const doc = build(`
hello
  child`);
    const hello = find(doc, "hello");
    const { doc: next } = splitAt(doc, hello, 0);
    expect(shape(next)).toBe("\nhello\n  child");
    expect(next.nodes[hello].text).toBe("hello");
    expect(next.nodes[hello].children).toHaveLength(1);
  });

  it("a selection already at the edge does not reorder itself", () => {
    const doc = build("a\nb\nc");
    const bottom = [find(doc, "b"), find(doc, "c")];
    const top = [find(doc, "a"), find(doc, "b")];
    expect(shape(bulkMove(doc, doc.rootId, bottom, 1).doc)).toBe("a\nb\nc");
    expect(shape(bulkMove(doc, doc.rootId, top, -1).doc)).toBe("a\nb\nc");
  });

  it("keeps both notes when two rows are joined", () => {
    let doc = build("one\ntwo");
    doc = patchNode(doc, find(doc, "one"), { note: "note one" });
    doc = patchNode(doc, find(doc, "two"), { note: "note two" });
    const { doc: next } = mergeIntoPrevious(doc, doc.rootId, find(doc, "two"));
    expect(next.nodes[find(next, "onetwo")].note).toBe("note one\nnote two");
  });

  it("never focuses a row it just deleted", () => {
    const doc = build(`
a
  a1
b`);
    const { doc: next, focusId } = bulkRemove(doc, doc.rootId, [find(doc, "a")]);
    expect(next.nodes[focusId!]).toBeDefined();
    expect(next.nodes[focusId!].text).toBe("b");
  });

  it("leaves the document alone when the target parent is gone", () => {
    const doc = build("a\nb");
    expect(appendChild(doc, "missing").doc).toBe(doc);
    const { doc: next } = reparent(doc, find(doc, "b"), "missing", 0);
    expect(shape(next)).toBe("a\nb");
  });

  it("keeps relative nesting when pasted text is uniformly indented", () => {
    // Copying a nested block out of another editor brings its leading indent
    // along; measuring depth from the shallowest line preserves the structure.
    const doc = build("keep");
    const { doc: next } = insertOutlineText(doc, find(doc, "keep"), "    parent\n      child\n    sibling");
    expect(shape(next)).toBe("keep\nparent\n  child\nsibling");
  });

  it("does not hang on a document that contains a cycle", () => {
    const doc = build(`
a
  a1`);
    const a = find(doc, "a");
    const a1 = find(doc, "a1");
    const cyclic = { ...doc, nodes: { ...doc.nodes, [a1]: { ...doc.nodes[a1], children: [a] } } };
    expect(() => visibleRows(cyclic, cyclic.rootId)).not.toThrow();
    expect(() => subtree(cyclic, a)).not.toThrow();
  });
});

describe("appendChild", () => {
  it("reuses a trailing empty row instead of stacking blanks", () => {
    const doc = build("a\n~");
    const { doc: next, focusId } = appendChild(doc, doc.rootId);
    expect(next).toBe(doc);
    expect(next.nodes[focusId!].text).toBe("");
  });
});

describe("visibleRows as a filter", () => {
  it("keeps matches and the ancestors that place them", () => {
    let doc = makeDoc("filter");
    const first = doc.nodes[doc.rootId].children[0];
    doc = patchNode(doc, first, { text: "Projects" });
    const child = insertAfter(doc, first, "");
    doc = indent(child.doc, child.focusId!).doc;
    doc = patchNode(doc, child.focusId!, { text: "ship the outliner" });
    const other = insertAfter(doc, first, "Groceries");
    doc = other.doc;

    const rows = visibleRows(doc, doc.rootId, { match: (node) => node.text.includes("outliner") });
    expect(rows.map((row) => row.node.text)).toEqual(["Projects", "ship the outliner"]);
  });

  it("looks inside collapsed parents, which a reader cannot open while filtering", () => {
    let doc = makeDoc("filter");
    const first = doc.nodes[doc.rootId].children[0];
    doc = patchNode(doc, first, { text: "box" });
    const child = insertAfter(doc, first, "");
    doc = indent(child.doc, child.focusId!).doc;
    doc = patchNode(doc, child.focusId!, { text: "needle" });
    doc = patchNode(doc, first, { collapsed: true });

    expect(visibleRows(doc, doc.rootId).map((row) => row.node.text)).toEqual(["box"]);
    expect(
      visibleRows(doc, doc.rootId, { match: (node) => node.text === "needle" }).map((row) => row.node.text)
    ).toEqual(["box", "needle"]);
  });

  it("hides a completed row together with everything under it", () => {
    let doc = makeDoc("filter");
    const first = doc.nodes[doc.rootId].children[0];
    doc = patchNode(doc, first, { text: "done thing", done: true });
    const sibling = insertAfter(doc, first, "still open");
    doc = sibling.doc;
    const child = appendChild(doc, first);
    doc = patchNode(child.doc, child.focusId!, { text: "under it" });

    expect(visibleRows(doc, doc.rootId).map((row) => row.node.text)).toEqual(["done thing", "under it", "still open"]);
    expect(visibleRows(doc, doc.rootId, { hideCompleted: true }).map((row) => row.node.text)).toEqual(["still open"]);
  });
});
