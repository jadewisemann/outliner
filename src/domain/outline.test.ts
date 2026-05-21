import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  createInitialView,
  createNodeAfter,
  ensureEditableNode,
  indentNode,
  moveNodeDown,
  moveNodeUp,
  outdentNode,
  removeEmptyNodeOrPromoteChildren,
  splitNode,
  toggleCollapse,
  updateNodeLinks,
  updateNodeMetadata,
  updateNodeText,
  zoomInto,
  zoomToAncestor
} from "./outline";
import {
  applyImportedOutline,
  exportToJson,
  exportToMarkdown,
  exportToOpml,
  exportToPlainText,
  importFromJson,
  importFromOpml,
  importFromPlainText,
  previewImport
} from "./exporters";
import {
  getBreadcrumbPath,
  getNextVisibleNode,
  getPreviousVisibleNode,
  getVisibleNodes
} from "./outlineSelectors";
import {
  makeClock,
  makeDocumentWithTexts,
  makeIdGenerator,
  makeLargeDocument,
  makeLargeGroupedDocument
} from "../test/factories";

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

  it("moves the current node before the previous visible sibling with alt arrow up", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const result = moveNodeUp(doc, b, doc.rootId, () => 10);
    expect(result.nodes[result.rootId].children).toEqual([b, a, c]);
  });

  it("moves the current node after the next visible sibling with alt arrow down", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const result = moveNodeDown(doc, b, doc.rootId, () => 10);
    expect(result.nodes[result.rootId].children).toEqual([a, c, b]);
  });

  it("moves a first child up into the previous parent sibling when it preserves structure", () => {
    const doc = makeDocumentWithTexts(["A", "A.A", "B", "B.A"]);
    const [a, aa, b, ba] = doc.nodes[doc.rootId].children;
    const nested = indentNode(indentNode(doc, aa, () => 10), ba, () => 11);
    const result = moveNodeUp(nested, ba, nested.rootId, () => 12);
    expect(result.nodes[result.rootId].children).toEqual([a, b]);
    expect(result.nodes[a].children).toEqual([aa, ba]);
    expect(result.nodes[b].children).toEqual([]);
  });

  it("outdents a first child above its parent when no previous parent sibling exists", () => {
    const doc = makeDocumentWithTexts(["A", "A.A", "B"]);
    const [a, aa, b] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, aa, () => 10);
    const result = moveNodeUp(nested, aa, nested.rootId, () => 11);
    expect(result.nodes[result.rootId].children).toEqual([aa, a, b]);
    expect(result.nodes[a].children).toEqual([]);
  });

  it("moves a last child down into the next parent sibling when it preserves structure", () => {
    const doc = makeDocumentWithTexts(["A", "A.A", "B", "B.A"]);
    const [a, aa, b, ba] = doc.nodes[doc.rootId].children;
    const nested = indentNode(indentNode(doc, aa, () => 10), ba, () => 11);
    const result = moveNodeDown(nested, aa, nested.rootId, () => 12);
    expect(result.nodes[result.rootId].children).toEqual([a, b]);
    expect(result.nodes[a].children).toEqual([]);
    expect(result.nodes[b].children).toEqual([aa, ba]);
  });

  it("outdents a last child below its parent when no next parent sibling exists", () => {
    const doc = makeDocumentWithTexts(["A", "B", "B.A"]);
    const [a, b, ba] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, ba, () => 10);
    const result = moveNodeDown(nested, ba, nested.rootId, () => 11);
    expect(result.nodes[result.rootId].children).toEqual([a, b, ba]);
    expect(result.nodes[b].children).toEqual([]);
  });

  it("does nothing when moving beyond visible boundaries", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    expect(moveNodeUp(doc, a, doc.rootId)).toBe(doc);
    expect(moveNodeDown(doc, b, doc.rootId)).toBe(doc);
  });

  it("moves a collapsed subtree as one visible block", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    const collapsed = toggleCollapse(nested, a, () => 11);
    const result = moveNodeDown(collapsed, a, collapsed.rootId, () => 12);
    expect(result.nodes[result.rootId].children).toEqual([c, a]);
    expect(result.nodes[a].children).toEqual([b]);
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

  it("does not mutate the input document when updating node content", () => {
    const doc = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const before = cloneDocument(doc);

    updateNodeText(doc, a, "Renamed", () => 10);
    updateNodeLinks(doc, a, [{ source: "[[B]]", targetNodeId: b, label: "B" }], () => 11);
    updateNodeMetadata(doc, a, { heading: 2, color: "red" }, () => 12);

    expect(doc).toEqual(before);
  });

  it("does not mutate the input document when changing hierarchy", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = indentNode(indentNode(doc, b, () => 10), c, () => 11);
    const before = cloneDocument(nested);

    indentNode(nested, c, () => 12);
    outdentNode(nested, c, () => 13);
    moveNodeUp(nested, c, nested.rootId, () => 14);
    moveNodeDown(nested, b, nested.rootId, () => 15);
    removeEmptyNodeOrPromoteChildren(updateNodeText(nested, a, "", () => 16), a, () => 17);

    expect(nested).toEqual(before);
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

  it("calculates 10,000 visible nodes within the MVP budget", () => {
    const doc = makeLargeDocument(10_000);
    const start = performance.now();
    const visible = getVisibleNodes(doc);
    const duration = performance.now() - start;
    expect(visible).toHaveLength(10_000);
    expect(visible[0]).toMatchObject({ id: "large-1", depth: 0 });
    expect(visible[9_999]).toMatchObject({ id: "large-10000", depth: 0 });
    expect(duration).toBeLessThan(50);
  });

  it("keeps collapse and zoom behavior correct in a large grouped fixture", () => {
    const doc = makeLargeGroupedDocument(100, 99);
    const firstGroupId = doc.nodes[doc.rootId].children[0];
    const collapsed = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [firstGroupId]: {
          ...doc.nodes[firstGroupId],
          collapsed: true
        }
      }
    };
    expect(getVisibleNodes(collapsed)).toHaveLength(9_901);
    const zoomed = getVisibleNodes(collapsed, firstGroupId);
    expect(zoomed).toHaveLength(99);
    expect(zoomed[0]).toMatchObject({ id: "group-1-1", depth: 0 });
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

  it("exports heading, color, and note metadata without numbered output", () => {
    const doc = makeDocumentWithTexts(["Title"]);
    const [title] = doc.nodes[doc.rootId].children;
    const withMetadata = updateNodeMetadata(doc, title, { heading: 2, color: "#336699", note: "More context" }, () => 10);
    const formatted = {
      ...withMetadata,
      nodes: {
        ...withMetadata.nodes,
        [title]: {
          ...withMetadata.nodes[title],
          numbered: true
        }
      }
    };
    expect(exportToMarkdown(formatted)).toBe("- ## Title {color=#336699}\n  > More context");
  });

  it("exports opml using outline hierarchy and supported metadata", () => {
    const doc = makeDocumentWithTexts(["Title & plan", "Child"]);
    const [title, child] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, child, () => 10);
    const withMetadata = updateNodeMetadata(nested, title, { note: "More <context>", heading: 2, color: "#336699" }, () => 11);
    const formatted = toggleCollapse(
      {
        ...withMetadata,
        nodes: {
          ...withMetadata.nodes,
          [title]: {
            ...withMetadata.nodes[title],
            numbered: true
          }
        }
      },
      title,
      () => 12
    );

    expect(exportToOpml(formatted)).toContain(
      '<outline text="Title &amp; plan" _note="More &lt;context&gt;" _collapsed="true" _heading="2" _color="#336699">'
    );
    expect(exportToOpml(formatted)).not.toContain("_numbered");
    expect(exportToOpml(formatted)).toContain('<outline text="Child"/>');
  });

  it("imports opml hierarchy and supported metadata", () => {
    const imported = importFromOpml(
      `<?xml version="1.0"?><opml version="2.0"><body><outline text="A" _note="Note" _collapsed="true" _heading="3" _color="#123456" _numbered="true"><outline text="B"/></outline></body></opml>`,
      makeIdGenerator("imported"),
      () => 10
    );
    const [a] = imported.document.nodes[imported.document.rootId].children;
    const [b] = imported.document.nodes[a].children;

    expect(imported.document.nodes[a]).toMatchObject({
      text: "A",
      note: "Note",
      collapsed: true,
      heading: 3,
      color: "#123456"
    });
    expect(imported.document.nodes[a].numbered).toBeUndefined();
    expect(imported.document.nodes[b].text).toBe("B");
    expect(imported.view.selectedNodeId).toBe(a);
  });

  it("round-trips indentation plain text hierarchy", () => {
    const imported = importFromPlainText("A\n  B\n    C\nD", makeIdGenerator("plain"), () => 10);
    expect(exportToPlainText(imported.document)).toBe("A\n  B\n    C\nD");
  });

  it("round-trips plain text body continuations and notes", () => {
    const doc = makeDocumentWithTexts(["A line 1\nA line 2", "B"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const withNote = updateNodeMetadata(doc, a, { note: "Note one\nNote two" }, () => 10);
    const nested = indentNode(withNote, b, () => 11);

    const exported = exportToPlainText(nested);
    expect(exported).toBe("A line 1\n  | A line 2\n  > Note one\n  > Note two\n  B");

    const imported = importFromPlainText(exported, makeIdGenerator("plain"), () => 20);
    const [importedA] = imported.document.nodes[imported.document.rootId].children;
    const [importedB] = imported.document.nodes[importedA].children;
    expect(imported.document.nodes[importedA]).toMatchObject({
      text: "A line 1\nA line 2",
      note: "Note one\nNote two"
    });
    expect(imported.document.nodes[importedB].text).toBe("B");
  });

  it("exports visible items only when requested", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const nested = toggleCollapse(indentNode(doc, b, () => 10), a, () => 11);

    expect(exportToPlainText(nested, { visibleOnly: true })).toBe("A\nC");
    expect(exportToMarkdown(nested, { visibleOnly: true })).toBe("- A\n- C");
    expect(exportToOpml(nested, { visibleOnly: true })).not.toContain('text="B"');
  });

  it("returns import errors without mutating the current workspace", () => {
    const doc = makeDocumentWithTexts(["A"]);
    const view = createInitialView(doc);
    const result = previewImport("<opml><body><outline></body></opml>", "opml", makeIdGenerator("bad"), () => 10);

    expect(result.ok).toBe(false);
    expect(applyImportedOutline({ document: doc, view }, result, { mode: "replace" })).toEqual({ document: doc, view });
  });

  it("applies imported outlines by replacing, merging, or inserting under a node", () => {
    const doc = makeDocumentWithTexts(["A"]);
    const [a] = doc.nodes[doc.rootId].children;
    const view = createInitialView(doc);
    const imported = previewImport("B\n  C", "plainText", makeIdGenerator("added"), () => 20);

    const replaced = applyImportedOutline({ document: doc, view }, imported, { mode: "replace" });
    expect(replaced.document.nodes[replaced.document.rootId].children).toEqual(["added-1"]);

    const merged = applyImportedOutline({ document: doc, view }, imported, { mode: "mergeRoot" });
    expect(merged.document.nodes[merged.document.rootId].children).toEqual([a, "added-1"]);

    const inserted = applyImportedOutline({ document: doc, view }, imported, { mode: "insertUnder", targetNodeId: a });
    expect(inserted.document.nodes[a].children).toEqual(["added-1"]);
  });
});

function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
