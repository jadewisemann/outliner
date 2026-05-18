import {
  createEmptyDocument,
  createNodeAfter,
  ensureEditableNode,
  indentNode,
  updateNodeText
} from "../domain/outline";
import type { Clock, IdGenerator, NodeId, OutlineDocument, OutlineNode } from "../domain/outlineTypes";

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
  const timestamp = 1_000;
  const rootId = "root";
  const children = Array.from({ length: count }, (_, index) => `large-${index + 1}`);
  const nodes: Record<NodeId, OutlineNode> = {
    [rootId]: {
      id: rootId,
      text: "",
      children,
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
  for (let index = 0; index < count; index += 1) {
    const id = children[index];
    nodes[id] = {
      id,
      text: `Node ${index + 1}`,
      children: [],
      collapsed: false,
      createdAt: timestamp + index + 1,
      updatedAt: timestamp + index + 1
    };
  }
  return { rootId, nodes };
}

export function makeLargeGroupedDocument(parentCount: number, childrenPerParent: number): OutlineDocument {
  const timestamp = 1_000;
  const rootId = "root";
  const rootChildren: NodeId[] = [];
  const nodes: Record<NodeId, OutlineNode> = {
    [rootId]: {
      id: rootId,
      text: "",
      children: rootChildren,
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
  let tick = timestamp + 1;
  for (let parentIndex = 1; parentIndex <= parentCount; parentIndex += 1) {
    const parentId = `group-${parentIndex}`;
    const childIds = Array.from({ length: childrenPerParent }, (_, childIndex) => `${parentId}-${childIndex + 1}`);
    rootChildren.push(parentId);
    nodes[parentId] = {
      id: parentId,
      text: `Group ${parentIndex}`,
      children: childIds,
      collapsed: false,
      createdAt: tick,
      updatedAt: tick
    };
    tick += 1;
    for (const childId of childIds) {
      nodes[childId] = {
        id: childId,
        text: childId,
        children: [],
        collapsed: false,
        createdAt: tick,
        updatedAt: tick
      };
      tick += 1;
    }
  }
  return { rootId, nodes };
}

export function makeNestedDocument(): OutlineDocument {
  const doc = makeDocumentWithTexts(["A", "B", "C"]);
  const ids = doc.nodes[doc.rootId].children;
  return indentNode(indentNode(doc, ids[1], () => 2_000), ids[2], () => 2_001);
}
