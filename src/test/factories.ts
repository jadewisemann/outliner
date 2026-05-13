import {
  createEmptyDocument,
  createNodeAfter,
  ensureEditableNode,
  indentNode,
  updateNodeText
} from "../domain/outline";
import type { Clock, IdGenerator, OutlineDocument } from "../domain/outlineTypes";

export function makeIdGenerator(prefix = "node"): IdGenerator {
  let next = 1;
  return () => `${prefix}-${next++}`;
}

export function makeClock(start = 1_000): Clock {
  let next = start;
  return () => next++;
}

export function makeDocumentWithTexts(texts: string[]): OutlineDocument {
  const createId = makeIdGenerator("n");
  const now = makeClock();
  let doc = createEmptyDocument(now);
  const first = ensureEditableNode(doc, createId, now);
  doc = first.document;
  doc = updateNodeText(doc, first.nodeId, texts[0] ?? "", now);
  let lastId = first.nodeId;
  for (const text of texts.slice(1)) {
    const created = createNodeAfter(doc, lastId, createId, now);
    doc = updateNodeText(created.document, created.nodeId, text, now);
    lastId = created.nodeId;
  }
  return doc;
}

export function makeLargeDocument(count: number): OutlineDocument {
  const createId = makeIdGenerator("large");
  const now = makeClock();
  let doc = createEmptyDocument(now);
  const first = ensureEditableNode(doc, createId, now);
  doc = updateNodeText(first.document, first.nodeId, "Node 1", now);
  let lastId = first.nodeId;
  for (let i = 2; i <= count; i += 1) {
    const created = createNodeAfter(doc, lastId, createId, now);
    doc = updateNodeText(created.document, created.nodeId, `Node ${i}`, now);
    lastId = created.nodeId;
  }
  return doc;
}

export function makeNestedDocument(): OutlineDocument {
  const doc = makeDocumentWithTexts(["A", "B", "C"]);
  const ids = doc.nodes[doc.rootId].children;
  return indentNode(indentNode(doc, ids[1], () => 2_000), ids[2], () => 2_001);
}
