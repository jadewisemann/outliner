import { describe, expect, it } from "vitest";
import { indentNode, revealNode, toggleCollapse, updateNodeLinks, updateNodeMetadata, updateNodeText } from "./outline";
import {
  extractTags,
  findLinkCandidates,
  findNodesByTag,
  getBacklinks,
  getBrokenLinks,
  searchOutline
} from "./searchSelectors";
import { makeDocumentWithTexts, makeLargeDocument } from "../test/factories";

describe("outline search", () => {
  it("finds text matches under the current zoom root", () => {
    const doc = makeDocumentWithTexts(["Project", "Alpha note", "Beta note"]);
    const [project, alpha, beta] = doc.nodes[doc.rootId].children;
    const nested = indentNode(indentNode(doc, alpha, () => 10), beta, () => 11);
    expect(searchOutline(nested, "note", { zoomNodeId: project }).map((result) => result.nodeId)).toEqual([
      alpha,
      beta
    ]);
  });

  it("includes matches inside collapsed descendants", () => {
    const doc = makeDocumentWithTexts(["Parent", "Hidden target"]);
    const [parent, child] = doc.nodes[doc.rootId].children;
    const collapsed = toggleCollapse(indentNode(doc, child, () => 10), parent, () => 11);
    expect(searchOutline(collapsed, "target").map((result) => result.nodeId)).toEqual([child]);
  });

  it("includes note text matches in node search", () => {
    const doc = makeDocumentWithTexts(["Project", "Decision"]);
    const [_, decision] = doc.nodes[doc.rootId].children;
    const withNote = updateNodeMetadata(doc, decision, { note: "Discuss launch risk" }, () => 10);
    expect(searchOutline(withNote, "launch")[0]).toMatchObject({
      nodeId: decision,
      text: "Discuss launch risk",
      source: "note",
      matchText: "launch"
    });
  });

  it("returns depth, breadcrumb, and match ranges", () => {
    const doc = makeDocumentWithTexts(["Parent", "Nested Alpha"]);
    const [parent, child] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, child, () => 10);
    expect(searchOutline(nested, "alpha")[0]).toMatchObject({
      nodeId: child,
      depth: 1,
      breadcrumbIds: [nested.rootId, parent, child],
      matchStart: 7,
      matchEnd: 12,
      matchText: "Alpha"
    });
  });

  it("reveals collapsed ancestors when navigating to a match", () => {
    const doc = makeDocumentWithTexts(["Parent", "Hidden target"]);
    const [parent, child] = doc.nodes[doc.rootId].children;
    const collapsed = toggleCollapse(indentNode(doc, child, () => 10), parent, () => 11);
    expect(revealNode(collapsed, child, () => 12).nodes[parent].collapsed).toBe(false);
  });

  it("searches 10,000 nodes within the MVP budget", () => {
    const doc = updateNodeText(makeLargeDocument(10_000), "large-9999", "Needle", () => 20_000);
    const start = performance.now();
    const results = searchOutline(doc, "needle");
    const duration = performance.now() - start;
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe("large-9999");
    expect(duration).toBeLessThan(75);
  });
});

describe("tags and internal links", () => {
  it("extracts hash and at tags from node text", () => {
    expect(extractTags("Plan #phase9 with @jade").map((tag) => tag.source)).toEqual(["#phase9", "@jade"]);
  });

  it("filters nodes by tag under the current zoom root", () => {
    const doc = makeDocumentWithTexts(["Root #skip", "Parent", "Child #phase9"]);
    const [_, parent, child] = doc.nodes[doc.rootId].children;
    const nested = indentNode(doc, child, () => 10);
    expect(findNodesByTag(nested, parent, "#phase9").map((result) => result.nodeId)).toEqual([child]);
  });

  it("finds internal link candidates from node text", () => {
    const doc = makeDocumentWithTexts(["Alpha item", "Beta item"]);
    expect(findLinkCandidates(doc, doc.rootId, "alp")).toEqual([
      expect.objectContaining({ nodeId: "n-1", label: "Alpha item" })
    ]);
  });

  it("keeps metadata links stable after the target text changes", () => {
    const doc = makeDocumentWithTexts(["Source [[Target]]", "Target"]);
    const [source, target] = doc.nodes[doc.rootId].children;
    const linked = updateNodeLinks(doc, source, [{ source: "[[Target]]", targetNodeId: target, label: "Target" }], () => 10);
    const renamed = updateNodeText(linked, target, "Renamed", () => 11);
    expect(getBacklinks(renamed, target)).toEqual([
      expect.objectContaining({ sourceNodeId: source, targetNodeId: target, broken: false })
    ]);
  });

  it("marks links to deleted nodes as broken", () => {
    const doc = makeDocumentWithTexts(["Source [[Missing]]"]);
    const [source] = doc.nodes[doc.rootId].children;
    const linked = updateNodeLinks(doc, source, [{ source: "[[Missing]]", targetNodeId: "missing", label: "Missing" }]);
    expect(getBrokenLinks(linked)).toEqual([
      expect.objectContaining({ sourceNodeId: source, targetNodeId: "missing", broken: true })
    ]);
  });
});
