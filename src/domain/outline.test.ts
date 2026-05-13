import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  createInitialView,
  createNodeAfter,
  ensureEditableNode,
  indentNode,
  outdentNode,
  removeEmptyNodeOrPromoteChildren,
  splitNode,
  toggleCollapse,
  updateNodeText,
  zoomInto,
  zoomToAncestor
} from "./outline";
import { exportToJson, exportToMarkdown, importFromJson } from "./exporters";
import {
  getBreadcrumbPath,
  getNextVisibleNode,
  getPreviousVisibleNode,
  getVisibleNodes
} from "./outlineSelectors";
import { makeClock, makeDocumentWithTexts, makeIdGenerator } from "../test/factories";

describe("outline commands", () => {
  it("creates the first editable node in an empty root", () => {
    const result = ensureEditableNode(createEmptyDocument(() => 1), makeIdGenerator(), makeClock());
    expect(result.document.nodes[result.document.rootId].children).toEqual([result.nodeId]);
  });

  it("creates a node after the target sibling", () => {
    const ids = makeIdGenerator();
    const now = makeClock();
    let doc = createEmptyDocument(now);
    const first = ensureEditableNode(doc, ids, now);
    doc = first.document;
    const second = createNodeAfter(doc, first.nodeId, ids, now);
    expect(second.document.nodes[doc.rootId].children).toEqual([first.nodeId, second.nodeId]);
  });

  it("splits a node at the cursor offset", () => {
    const ids = makeIdGenerator();
    const now = makeClock();
    let doc = makeDocumentWithTexts(["hello world"]);
    const nodeId = doc.nodes[doc.rootId].children[0];
    const result = splitNode(doc, nodeId, 5, ids, now);
    const children = result.document.nodes[result.document.rootId].children;
    expect(result.document.nodes[children[0]].text).toBe("hello");
    expect(result.document.nodes[children[1]].text).toBe(" world");
  });

  it("moves the current node under the previous sibling when indenting", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const next = indentNode(doc, b, () => 10);
    expect(next.nodes[next.rootId].children).toEqual([a]);
    expect(next.nodes[a].children).toEqual([b]);
  });

  it("does nothing when indenting the first sibling", () => {
    const doc = makeDocumentWithTexts(["A"]);
    const [a] = doc.nodes[doc.rootId].children;
    expect(indentNode(doc, a)).toBe(doc);
  });

  it("moves the current node after its parent when outdenting", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const indented = indentNode(doc, b, () => 10);
    const outdented = outdentNode(indented, b, () => 11);
    expect(outdented.nodes[outdented.rootId].children).toEqual([a, b]);
    expect(outdented.nodes[a].children).toEqual([]);
  });

  it("does nothing when outdenting a root child", () => {
    const doc = makeDocumentWithTexts(["A"]);
    const [a] = doc.nodes[doc.rootId].children;
    expect(outdentNode(doc, a)).toBe(doc);
  });

  it("promotes children when removing an empty parent", () => {
    const doc = makeDocumentWithTexts(["", "Child"]);
    const [parent, child] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, child, () => 10);
    const result = removeEmptyNodeOrPromoteChildren(nested, parent, () => 11);
    expect(result.document.nodes[result.document.rootId].children).toEqual([child]);
    expect(result.document.nodes[parent]).toBeUndefined();
    expect(result.selectedNodeId).toBe(child);
  });
});

describe("outline selectors", () => {
  it("excludes descendants of collapsed nodes", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    const collapsed = toggleCollapse(nested, a, () => 11);
    expect(getVisibleNodes(collapsed).map((item) => item.id)).toEqual([a]);
  });

  it("returns breadcrumb path for a zoomed node", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    expect(getBreadcrumbPath(nested, b)).toEqual([nested.rootId, a, b]);
  });

  it("navigates previous and next visible nodes", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    expect(getNextVisibleNode(doc, doc.rootId, a)).toBe(b);
    expect(getPreviousVisibleNode(doc, doc.rootId, c)).toBe(b);
  });
});

describe("view commands", () => {
  it("zooms into a node and back to an ancestor", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    const zoomed = zoomInto(createInitialView(nested), nested, a);
    expect(zoomed.zoomNodeId).toBe(a);
    expect(zoomed.selectedNodeId).toBe(b);
    expect(zoomToAncestor(zoomed, nested, nested.rootId).zoomNodeId).toBe(nested.rootId);
  });
});

describe("exporters", () => {
  it("exports and imports json", () => {
    const doc = updateNodeText(makeDocumentWithTexts(["A"]), "n-1", "A");
    const view = createInitialView(doc);
    const imported = importFromJson(exportToJson(doc, view));
    expect(imported.document.nodes[doc.rootId].children).toEqual(doc.nodes[doc.rootId].children);
  });

  it("exports markdown using hierarchy indentation", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [_, b] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    expect(exportToMarkdown(nested)).toBe("- A\n  - B");
  });
});
