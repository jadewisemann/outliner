import { describe, expect, it } from "vitest";
import { indentNode, toggleCollapse, updateNodeText } from "./outline";
import {
  bulkDeleteNodes,
  bulkIndentNodes,
  bulkOutdentNodes,
  insertNodesFromText,
  normalizeTopLevelSelection,
  parseIndentedText,
  selectVisibleRange,
  serializeNodesForClipboard
} from "./bulkOutline";
import { getVisibleNodes } from "./outlineSelectors";
import { makeClock, makeDocumentWithTexts, makeIdGenerator } from "../test/factories";

describe("bulk outline commands", () => {
  it("parses indented multiline text into outline drafts", () => {
    expect(parseIndentedText("\n  Parent\n    Child\n\tTabbed\nPlain")).toEqual([
      { text: "Parent", depth: 0 },
      { text: "Child", depth: 1 },
      { text: "Tabbed", depth: 0 },
      { text: "Plain", depth: 0 }
    ]);
  });

  it("inserts pasted multiline text while preserving indentation and cursor suffix", () => {
    const ids = makeIdGenerator("p");
    const now = makeClock();
    let doc = makeDocumentWithTexts(["HelloWorld"]);
    const targetId = doc.nodes[doc.rootId].children[0];
    const result = insertNodesFromText(doc, targetId, 5, " A\n  B\nC", ids, now);
    const rootChildren = result.document.nodes[result.document.rootId].children;
    const [target, c] = rootChildren;
    const [b] = result.document.nodes[target].children;
    expect(result.document.nodes[target].text).toBe("Hello A");
    expect(result.document.nodes[target].children).toEqual([b]);
    expect(result.document.nodes[b].text).toBe("B");
    expect(result.document.nodes[c].text).toBe("CWorld");
    expect(result.selectedNodeId).toBe(c);
  });

  it("selects a visible range with shift arrow navigation", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, _, c] = doc.nodes[doc.rootId].children;
    expect(selectVisibleRange(doc, doc.rootId, a, c)).toEqual(doc.nodes[doc.rootId].children);
  });

  it("excludes hidden descendants from range selection", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    const collapsed = toggleCollapse(nested, a, () => 11);
    expect(selectVisibleRange(collapsed, collapsed.rootId, a, c)).toEqual([a, c]);
  });

  it("normalizes nested selections to top-level selected subtrees", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    expect(normalizeTopLevelSelection(nested, [a, b, c])).toEqual([a, c]);
  });

  it("indents selected sibling blocks while preserving order", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C", "D"]);
    const [a, b, c, d] = doc.nodes[doc.rootId].children;
    const result = bulkIndentNodes(doc, [b, c], () => 10);
    expect(result.nodes[result.rootId].children).toEqual([a, d]);
    expect(result.nodes[a].children).toEqual([b, c]);
  });

  it("outdents selected sibling blocks while preserving order", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = bulkIndentNodes(doc, [b, c], () => 10);
    const result = bulkOutdentNodes(nested, [b, c], () => 11);
    expect(result.nodes[result.rootId].children).toEqual([a, b, c]);
    expect(result.nodes[a].children).toEqual([]);
  });

  it("deletes selected top-level subtrees", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, b, () => 10);
    const result = bulkDeleteNodes(nested, [a, b], () => 11);
    expect(result.document.nodes[result.document.rootId].children).toEqual([c]);
    expect(result.document.nodes[a]).toBeUndefined();
    expect(result.document.nodes[b]).toBeUndefined();
    expect(result.selectedNodeId).toBe(c);
  });

  it("serializes selected nodes as indented plain text", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = doc.nodes[doc.rootId].children;
    const nested = updateNodeText(indentNode(doc, b, () => 10), c, "C", () => 11);
    expect(serializeNodesForClipboard(nested, [a, b, c])).toBe("A\n  B\nC");
  });

  it("keeps bulk operations scoped to visible order", () => {
    const doc = makeDocumentWithTexts(["A", "B", "C"]);
    const visibleIds = getVisibleNodes(doc).map((item) => item.id);
    expect(selectVisibleRange(doc, doc.rootId, visibleIds[2], visibleIds[0])).toEqual(visibleIds);
  });
});
