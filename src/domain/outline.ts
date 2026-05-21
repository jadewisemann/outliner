import type {
  Clock,
  IdGenerator,
  NodeId,
  OutlineDocument,
  OutlineLink,
  OutlineNodeMetadata,
  OutlineNode,
  ViewState
} from "./outlineTypes";

export const ROOT_ID = "root";

export function createEmptyDocument(now: Clock = Date.now): OutlineDocument {
  const timestamp = now();
  return {
    rootId: ROOT_ID,
    nodes: {
      [ROOT_ID]: {
        id: ROOT_ID,
        text: "",
        children: [],
        collapsed: false,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }
  };
}

export function createInitialView(document: OutlineDocument): ViewState {
  const firstChild = document.nodes[document.rootId]?.children[0];
  return {
    zoomNodeId: document.rootId,
    selectedNodeId: firstChild
  };
}

export function ensureEditableNode(
  document: OutlineDocument,
  createId: IdGenerator,
  now: Clock
): { document: OutlineDocument; nodeId: NodeId } {
  const root = document.nodes[document.rootId];
  if (root.children.length > 0) {
    return { document, nodeId: root.children[0] };
  }
  const id = createId();
  const node = makeNode(id, "", now());
  return {
    document: {
      ...document,
      nodes: {
        ...document.nodes,
        [id]: node,
        [root.id]: { ...root, children: [id], updatedAt: node.createdAt }
      }
    },
    nodeId: id
  };
}

export function updateNodeText(
  document: OutlineDocument,
  nodeId: NodeId,
  text: string,
  now: Clock = Date.now
): OutlineDocument {
  const node = document.nodes[nodeId];
  if (!node || nodeId === document.rootId) {
    return document;
  }
  return replaceNode(document, {
    ...node,
    text,
    updatedAt: now()
  });
}

export function parseNodeTextInput(text: string): Pick<OutlineNode, "text" | "tags" | "completed"> {
  const completedMatch = /^\s*\[([ xX])\]\s*/.exec(text);
  const completed = completedMatch ? completedMatch[1].toLocaleLowerCase() === "x" : undefined;
  const withoutCompletion = completedMatch ? text.slice(completedMatch[0].length) : text;
  const tags = extractTagRanges(withoutCompletion).map((tag) => tag.source);
  const parsedText = tags.length > 0 ? removeTagsFromText(withoutCompletion).trim() : withoutCompletion;
  return {
    text: parsedText,
    tags: tags.length > 0 ? [...new Set(tags)] : undefined,
    completed
  };
}

export function toggleNodeCompleted(
  document: OutlineDocument,
  nodeId: NodeId,
  now: Clock = Date.now
): OutlineDocument {
  const node = document.nodes[nodeId];
  if (!node || nodeId === document.rootId) {
    return document;
  }
  return replaceNode(document, {
    ...node,
    completed: !node.completed,
    updatedAt: now()
  });
}

export function updateNodeLinks(
  document: OutlineDocument,
  nodeId: NodeId,
  links: OutlineLink[],
  now: Clock = Date.now
): OutlineDocument {
  const node = document.nodes[nodeId];
  if (!node || nodeId === document.rootId) {
    return document;
  }
  return replaceNode(document, {
    ...node,
    links,
    updatedAt: now()
  });
}

export function updateNodeMetadata(
  document: OutlineDocument,
  nodeId: NodeId,
  metadata: Partial<OutlineNodeMetadata>,
  now: Clock = Date.now
): OutlineDocument {
  const node = document.nodes[nodeId];
  if (!node || nodeId === document.rootId) {
    return document;
  }
  return replaceNode(document, {
    ...node,
    ...metadata,
    updatedAt: now()
  });
}

export function createNodeAfter(
  document: OutlineDocument,
  targetId: NodeId,
  createId: IdGenerator,
  now: Clock = Date.now
): { document: OutlineDocument; nodeId: NodeId } {
  const parentId = findParentId(document, targetId);
  if (!parentId) {
    return { document, nodeId: targetId };
  }
  const parent = document.nodes[parentId];
  const targetIndex = parent.children.indexOf(targetId);
  const id = createId();
  const node = makeNode(id, "", now());
  const children = [...parent.children];
  children.splice(targetIndex + 1, 0, id);
  return {
    document: {
      ...document,
      nodes: {
        ...document.nodes,
        [id]: node,
        [parentId]: { ...parent, children, updatedAt: node.createdAt }
      }
    },
    nodeId: id
  };
}

export function splitNode(
  document: OutlineDocument,
  nodeId: NodeId,
  offset: number,
  createId: IdGenerator,
  now: Clock = Date.now
): { document: OutlineDocument; nodeId: NodeId } {
  const node = document.nodes[nodeId];
  if (!node || nodeId === document.rootId) {
    return { document, nodeId };
  }
  const safeOffset = Math.max(0, Math.min(offset, node.text.length));
  const before = node.text.slice(0, safeOffset);
  const after = node.text.slice(safeOffset);
  const timestamp = now();
  const updated = replaceNode(document, {
    ...node,
    text: before,
    updatedAt: timestamp
  });
  const result = createNodeAfter(updated, nodeId, createId, () => timestamp);
  return {
    document: replaceNode(result.document, {
      ...result.document.nodes[result.nodeId],
      text: after,
      updatedAt: timestamp
    }),
    nodeId: result.nodeId
  };
}

export function indentNode(document: OutlineDocument, nodeId: NodeId, now: Clock = Date.now): OutlineDocument {
  if (nodeId === document.rootId) {
    return document;
  }
  const parentId = findParentId(document, nodeId);
  if (!parentId) {
    return document;
  }
  const parent = document.nodes[parentId];
  const index = parent.children.indexOf(nodeId);
  if (index <= 0) {
    return document;
  }
  const previousSiblingId = parent.children[index - 1];
  const previousSibling = document.nodes[previousSiblingId];
  const timestamp = now();
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [parentId]: {
        ...parent,
        children: parent.children.filter((id) => id !== nodeId),
        updatedAt: timestamp
      },
      [previousSiblingId]: {
        ...previousSibling,
        children: [...previousSibling.children, nodeId],
        collapsed: false,
        updatedAt: timestamp
      }
    }
  };
}

export function outdentNode(document: OutlineDocument, nodeId: NodeId, now: Clock = Date.now): OutlineDocument {
  if (nodeId === document.rootId) {
    return document;
  }
  const parentId = findParentId(document, nodeId);
  if (!parentId || parentId === document.rootId) {
    return document;
  }
  const grandParentId = findParentId(document, parentId);
  if (!grandParentId) {
    return document;
  }
  const parent = document.nodes[parentId];
  const grandParent = document.nodes[grandParentId];
  const timestamp = now();
  const parentChildIndex = parent.children.indexOf(nodeId);
  const grandParentIndex = grandParent.children.indexOf(parentId);
  const parentChildren = parent.children.filter((id) => id !== nodeId);
  const grandParentChildren = [...grandParent.children];
  grandParentChildren.splice(grandParentIndex + 1, 0, nodeId);
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [parentId]: {
        ...parent,
        children: parentChildren,
        updatedAt: timestamp
      },
      [grandParentId]: {
        ...grandParent,
        children: grandParentChildren,
        updatedAt: timestamp
      },
      [nodeId]: {
        ...document.nodes[nodeId],
        updatedAt: parentChildIndex >= 0 ? timestamp : document.nodes[nodeId].updatedAt
      }
    }
  };
}

export function moveNodeUp(
  document: OutlineDocument,
  nodeId: NodeId,
  _zoomNodeId: NodeId = document.rootId,
  now: Clock = Date.now
): OutlineDocument {
  if (nodeId === document.rootId || !document.nodes[nodeId]) {
    return document;
  }
  const parentId = findParentId(document, nodeId);
  if (!parentId) {
    return document;
  }
  const parent = document.nodes[parentId];
  const index = parent.children.indexOf(nodeId);
  if (index < 0) {
    return document;
  }
  const timestamp = now();
  if (index === 0) {
    return moveFirstChildUp(document, nodeId, parentId, parent, timestamp);
  }
  const children = [...parent.children];
  [children[index - 1], children[index]] = [children[index], children[index - 1]];
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [parentId]: { ...parent, children, updatedAt: timestamp }
    }
  };
}

export function moveNodeDown(
  document: OutlineDocument,
  nodeId: NodeId,
  _zoomNodeId: NodeId = document.rootId,
  now: Clock = Date.now
): OutlineDocument {
  if (nodeId === document.rootId || !document.nodes[nodeId]) {
    return document;
  }
  const parentId = findParentId(document, nodeId);
  if (!parentId) {
    return document;
  }
  const parent = document.nodes[parentId];
  const index = parent.children.indexOf(nodeId);
  if (index < 0) {
    return document;
  }
  const timestamp = now();
  if (index === parent.children.length - 1) {
    return moveLastChildDown(document, nodeId, parentId, parent, timestamp);
  }
  const children = [...parent.children];
  [children[index], children[index + 1]] = [children[index + 1], children[index]];
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [parentId]: { ...parent, children, updatedAt: timestamp }
    }
  };
}

export function toggleCollapse(document: OutlineDocument, nodeId: NodeId, now: Clock = Date.now): OutlineDocument {
  const node = document.nodes[nodeId];
  if (!node || node.children.length === 0) {
    return document;
  }
  return replaceNode(document, {
    ...node,
    collapsed: !node.collapsed,
    updatedAt: now()
  });
}

export function revealNode(document: OutlineDocument, nodeId: NodeId, now: Clock = Date.now): OutlineDocument {
  if (!document.nodes[nodeId]) {
    return document;
  }
  let next = document;
  for (const ancestorId of getAncestorIds(document, nodeId)) {
    const node = next.nodes[ancestorId];
    if (!node || ancestorId === document.rootId || !node.collapsed) {
      continue;
    }
    next = replaceNode(next, {
      ...node,
      collapsed: false,
      updatedAt: now()
    });
  }
  return next;
}

export function removeEmptyNodeOrPromoteChildren(
  document: OutlineDocument,
  nodeId: NodeId,
  now: Clock = Date.now
): { document: OutlineDocument; selectedNodeId?: NodeId } {
  const node = document.nodes[nodeId];
  const parentId = findParentId(document, nodeId);
  if (!node || !parentId || nodeId === document.rootId || node.text.length > 0) {
    return { document, selectedNodeId: nodeId };
  }
  const parent = document.nodes[parentId];
  const index = parent.children.indexOf(nodeId);
  const timestamp = now();
  const promotedChildren = node.children;
  const nextChildren = [...parent.children.slice(0, index), ...promotedChildren, ...parent.children.slice(index + 1)];
  const nextNodes = { ...document.nodes };
  delete nextNodes[nodeId];
  nextNodes[parentId] = {
    ...parent,
    children: nextChildren,
    updatedAt: timestamp
  };
  const fallback = promotedChildren[0] ?? nextChildren[Math.max(0, index - 1)] ?? parentId;
  return {
    document: {
      ...document,
      nodes: nextNodes
    },
    selectedNodeId: fallback === document.rootId ? undefined : fallback
  };
}

export function zoomInto(view: ViewState, document: OutlineDocument, nodeId: NodeId): ViewState {
  if (!document.nodes[nodeId]) {
    return view;
  }
  return {
    zoomNodeId: nodeId,
    selectedNodeId: document.nodes[nodeId].children[0]
  };
}

export function zoomToAncestor(view: ViewState, document: OutlineDocument, nodeId: NodeId): ViewState {
  if (!getAncestorIds(document, view.zoomNodeId).includes(nodeId) && nodeId !== view.zoomNodeId) {
    return view;
  }
  return {
    zoomNodeId: nodeId,
    selectedNodeId: document.nodes[nodeId]?.children[0]
  };
}

export function findParentId(document: OutlineDocument, childId: NodeId): NodeId | undefined {
  for (const node of Object.values(document.nodes)) {
    if (node.children.includes(childId)) {
      return node.id;
    }
  }
  return undefined;
}

export function getAncestorIds(document: OutlineDocument, nodeId: NodeId): NodeId[] {
  const ancestors: NodeId[] = [];
  let current = nodeId;
  while (current !== document.rootId) {
    const parentId = findParentId(document, current);
    if (!parentId) {
      break;
    }
    ancestors.unshift(parentId);
    current = parentId;
  }
  return ancestors;
}

function makeNode(id: NodeId, text: string, timestamp: number): OutlineNode {
  return {
    id,
    text,
    children: [],
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function removeTagsFromText(text: string): string {
  const tags = extractTagRanges(text);
  if (tags.length === 0) {
    return text;
  }
  let result = "";
  let cursor = 0;
  for (const tag of tags) {
    result += text.slice(cursor, tag.start);
    cursor = tag.end;
  }
  result += text.slice(cursor);
  return result.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n");
}

function extractTagRanges(text: string): Array<{ source: string; start: number; end: number }> {
  const tags: Array<{ source: string; start: number; end: number }> = [];
  const pattern = /(^|[\s([{])([#@])([A-Za-z0-9가-힣_-]+)/gu;
  for (const match of text.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const marker = match[2];
    const value = match[3];
    const start = (match.index ?? 0) + prefix.length;
    tags.push({
      source: `${marker}${value}`,
      start,
      end: start + marker.length + value.length
    });
  }
  return tags;
}

function moveFirstChildUp(
  document: OutlineDocument,
  nodeId: NodeId,
  parentId: NodeId,
  parent: OutlineNode,
  timestamp: number
): OutlineDocument {
  if (parentId === document.rootId) {
    return document;
  }
  const grandParentId = findParentId(document, parentId);
  if (!grandParentId) {
    return document;
  }
  const grandParent = document.nodes[grandParentId];
  const parentIndex = grandParent.children.indexOf(parentId);
  const parentChildren = parent.children.slice(1);
  if (parentIndex > 0) {
    const previousParentSiblingId = grandParent.children[parentIndex - 1];
    const previousParentSibling = document.nodes[previousParentSiblingId];
    return replaceParentAndSibling(document, parentId, parent, parentChildren, previousParentSiblingId, {
      ...previousParentSibling,
      children: [...previousParentSibling.children, nodeId],
      collapsed: false,
      updatedAt: timestamp
    }, timestamp);
  }
  return moveChildBesideParent(document, nodeId, parentId, parent, parentChildren, grandParentId, parentIndex, timestamp);
}

function moveLastChildDown(
  document: OutlineDocument,
  nodeId: NodeId,
  parentId: NodeId,
  parent: OutlineNode,
  timestamp: number
): OutlineDocument {
  if (parentId === document.rootId) {
    return document;
  }
  const grandParentId = findParentId(document, parentId);
  if (!grandParentId) {
    return document;
  }
  const grandParent = document.nodes[grandParentId];
  const parentIndex = grandParent.children.indexOf(parentId);
  const parentChildren = parent.children.slice(0, -1);
  if (parentIndex < grandParent.children.length - 1) {
    const nextParentSiblingId = grandParent.children[parentIndex + 1];
    const nextParentSibling = document.nodes[nextParentSiblingId];
    return replaceParentAndSibling(document, parentId, parent, parentChildren, nextParentSiblingId, {
      ...nextParentSibling,
      children: [nodeId, ...nextParentSibling.children],
      collapsed: false,
      updatedAt: timestamp
    }, timestamp);
  }
  return moveChildBesideParent(document, nodeId, parentId, parent, parentChildren, grandParentId, parentIndex + 1, timestamp);
}

function replaceParentAndSibling(
  document: OutlineDocument,
  parentId: NodeId,
  parent: OutlineNode,
  parentChildren: NodeId[],
  siblingId: NodeId,
  sibling: OutlineNode,
  timestamp: number
): OutlineDocument {
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [parentId]: { ...parent, children: parentChildren, updatedAt: timestamp },
      [siblingId]: sibling
    }
  };
}

function moveChildBesideParent(
  document: OutlineDocument,
  nodeId: NodeId,
  parentId: NodeId,
  parent: OutlineNode,
  parentChildren: NodeId[],
  grandParentId: NodeId,
  insertIndex: number,
  timestamp: number
): OutlineDocument {
  const grandParent = document.nodes[grandParentId];
  const grandParentChildren = [...grandParent.children];
  grandParentChildren.splice(insertIndex, 0, nodeId);
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [parentId]: { ...parent, children: parentChildren, updatedAt: timestamp },
      [grandParentId]: { ...grandParent, children: grandParentChildren, updatedAt: timestamp }
    }
  };
}

function replaceNode(document: OutlineDocument, node: OutlineNode): OutlineDocument {
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [node.id]: node
    }
  };
}
