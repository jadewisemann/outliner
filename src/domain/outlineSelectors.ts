import type { NodeId, OutlineDocument, VisibleNode } from "./outlineTypes";
import { findParentId } from "./outline";

export function getVisibleNodes(document: OutlineDocument, zoomNodeId: NodeId = document.rootId): VisibleNode[] {
  const zoomNode = document.nodes[zoomNodeId];
  if (!zoomNode) {
    return [];
  }
  const visible: VisibleNode[] = [];
  const visit = (nodeId: NodeId, depth: number) => {
    const node = document.nodes[nodeId];
    if (!node) {
      return;
    }
    visible.push({ id: nodeId, node, depth });
    if (node.collapsed) {
      return;
    }
    for (const childId of node.children) {
      visit(childId, depth + 1);
    }
  };
  for (const childId of zoomNode.children) {
    visit(childId, 0);
  }
  return visible;
}

export function getBreadcrumbPath(document: OutlineDocument, nodeId: NodeId): NodeId[] {
  if (!document.nodes[nodeId]) {
    return [document.rootId];
  }
  const path: NodeId[] = [nodeId];
  let current = nodeId;
  while (current !== document.rootId) {
    const parentId = findParentId(document, current);
    if (!parentId) {
      break;
    }
    path.unshift(parentId);
    current = parentId;
  }
  return path;
}

export function getNodeDepth(document: OutlineDocument, nodeId: NodeId): number {
  return Math.max(0, getBreadcrumbPath(document, nodeId).length - 2);
}

export function getPreviousVisibleNode(document: OutlineDocument, viewRootId: NodeId, nodeId: NodeId): NodeId | undefined {
  const visible = getVisibleNodes(document, viewRootId);
  const index = visible.findIndex((item) => item.id === nodeId);
  return index > 0 ? visible[index - 1].id : undefined;
}

export function getNextVisibleNode(document: OutlineDocument, viewRootId: NodeId, nodeId: NodeId): NodeId | undefined {
  const visible = getVisibleNodes(document, viewRootId);
  const index = visible.findIndex((item) => item.id === nodeId);
  return index >= 0 && index < visible.length - 1 ? visible[index + 1].id : undefined;
}
