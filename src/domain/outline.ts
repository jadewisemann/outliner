import type {
  Clock,
  IdGenerator,
  NodeId,
  OutlineDocument,
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

function replaceNode(document: OutlineDocument, node: OutlineNode): OutlineDocument {
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [node.id]: node
    }
  };
}
