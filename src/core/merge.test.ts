import { describe, expect, it } from "vitest";
import { mergeWorkspace, pruneGraves } from "./merge";
import {
  bulkRemove,
  indent,
  insertAfter,
  patchNode,
  removeNode,
  splitAt,
  visibleRows
} from "./tree";
import { makeDoc, stamp, type Doc, type Id, type SyncPayload } from "./types";

/** Two devices start from the same document and then diverge. */
function fork(doc: Doc): [Doc, Doc] {
  return [structuredClone(doc), structuredClone(doc)];
}

const payload = (doc: Doc, graves: SyncPayload["graves"] = {}): SyncPayload => ({ docs: { [doc.id]: doc }, graves });

const shape = (payload: SyncPayload, docId: Id) =>
  visibleRows(payload.docs[docId], payload.docs[docId].rootId)
    .map((row) => `${"  ".repeat(row.depth)}${row.node.text}`)
    .join("\n");

function seed(): { doc: Doc; a: Id; b: Id } {
  let doc = makeDoc("shared");
  const first = doc.nodes[doc.rootId].children[0];
  doc = patchNode(doc, first, { text: "alpha" });
  const added = insertAfter(doc, first, "beta");
  return { doc: added.doc, a: first, b: added.focusId! };
}

describe("mergeWorkspace", () => {
  it("keeps edits both devices made to different rows", () => {
    const { doc, a, b } = seed();
    const [mine, theirs] = fork(doc);

    const merged = mergeWorkspace(
      payload(patchNode(mine, a, { text: "alpha edited here" })),
      payload(patchNode(theirs, b, { text: "beta edited there" }))
    );

    expect(shape(merged, doc.id)).toBe("alpha edited here\nbeta edited there");
  });

  it("keeps rows both devices inserted in the same place", () => {
    const { doc, a } = seed();
    const [mine, theirs] = fork(doc);

    const merged = mergeWorkspace(
      payload(insertAfter(mine, a, "from laptop").doc),
      payload(insertAfter(theirs, a, "from phone").doc)
    );

    const rows = shape(merged, doc.id).split("\n");
    expect(rows).toContain("from laptop");
    expect(rows).toContain("from phone");
    expect(rows[0]).toBe("alpha");
    expect(rows).toHaveLength(4);
  });

  it("keeps a text edit and a move made on different devices", () => {
    const { doc, a, b } = seed();
    const [mine, theirs] = fork(doc);

    const merged = mergeWorkspace(
      payload(patchNode(mine, b, { text: "beta rewritten" })),
      payload(indent(theirs, b).doc)
    );

    expect(shape(merged, doc.id)).toBe("alpha\n  beta rewritten");
  });

  it("does not let an untouched device resurrect a deleted row", () => {
    const { doc, b } = seed();
    const [mine, theirs] = fork(doc);
    const deleted = removeNode(mine, mine.rootId, b).doc;

    expect(shape(mergeWorkspace(payload(deleted), payload(theirs)), doc.id)).toBe("alpha");
    // …and merging the other way round gives the same answer.
    expect(shape(mergeWorkspace(payload(theirs), payload(deleted)), doc.id)).toBe("alpha");
  });

  it("brings a row back when the other device edited it after the delete", () => {
    const { doc, b } = seed();
    const [mine, theirs] = fork(doc);
    const deleted = removeNode(mine, mine.rootId, b).doc;
    const rewritten = patchNode(theirs, b, { text: "beta is still wanted" });

    expect(shape(mergeWorkspace(payload(deleted), payload(rewritten)), doc.id)).toBe("alpha\nbeta is still wanted");
  });

  it("deletes a whole subtree without stranding its children", () => {
    const { doc, a } = seed();
    const withChild = splitAt(patchNode(doc, a, { text: "alpha" }), a, 5).doc;
    const [mine, theirs] = fork(withChild);
    const target = visibleRows(mine, mine.rootId)[0].id;

    const merged = mergeWorkspace(payload(bulkRemove(mine, mine.rootId, [target]).doc), payload(theirs));
    const nodes = Object.values(merged.docs[doc.id].nodes);
    expect(nodes.every((node) => node.parent === null || merged.docs[doc.id].nodes[node.parent])).toBe(true);
  });

  it("repairs the loop when each device moves a row under the other's", () => {
    const { doc, a, b } = seed();
    const [mine, theirs] = fork(doc);

    // Mine: beta under alpha. Theirs: alpha under beta. Applied naively that is a cycle.
    const merged = mergeWorkspace(
      payload({ ...mine, nodes: { ...mine.nodes, [b]: { ...mine.nodes[b], parent: a, moved: stamp() } } }),
      payload({ ...theirs, nodes: { ...theirs.nodes, [a]: { ...theirs.nodes[a], parent: b, moved: stamp() } } })
    );

    const rows = visibleRows(merged.docs[doc.id], doc.rootId);
    expect(rows.map((row) => row.node.text).sort()).toEqual(["alpha", "beta"]);
  });

  it("is idempotent and order-independent", () => {
    const { doc, a, b } = seed();
    const [mine, theirs] = fork(doc);
    const left = payload(patchNode(mine, a, { text: "left" }));
    const right = payload(indent(patchNode(theirs, b, { text: "right" }), b).doc);

    const once = mergeWorkspace(left, right);
    expect(shape(mergeWorkspace(once, right), doc.id)).toBe(shape(once, doc.id));
    expect(shape(mergeWorkspace(right, left), doc.id)).toBe(shape(once, doc.id));
  });

  it("never leaves the workspace with no documents", () => {
    const { doc } = seed();
    const merged = mergeWorkspace({ docs: {}, graves: { [doc.id]: stamp() } }, payload(doc));
    expect(Object.keys(merged.docs)).toHaveLength(1);
  });

  it("removes a document on the device that still has it", () => {
    const { doc } = seed();
    const other = makeDoc("kept");
    const both: SyncPayload = { docs: { [doc.id]: doc, [other.id]: other }, graves: {} };
    const dropped: SyncPayload = { docs: { [other.id]: other }, graves: { [doc.id]: stamp() } };

    expect(Object.keys(mergeWorkspace(both, dropped).docs)).toEqual([other.id]);
  });
});

describe("pruneGraves", () => {
  it("forgets gravestones once they are older than the window", () => {
    const { doc, b } = seed();
    const deleted = removeNode(doc, doc.rootId, b).doc;
    const before = Object.keys(deleted.graves).length;
    expect(before).toBeGreaterThan(0);

    const pruned = pruneGraves({ docs: { [doc.id]: deleted }, graves: {} }, Date.now() + 40 * 24 * 3600 * 1000);
    expect(Object.keys(pruned.docs[doc.id].graves)).toHaveLength(0);
  });
});
