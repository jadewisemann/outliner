import type { NodeId, OutlineDocument, VisibleNode } from "./outlineTypes";
import { findParentId } from "./outline";

export function getVisibleNodes(document: OutlineDocument, zoomNodeId: NodeId = document.rootId): VisibleNode[] {
  const zoomNode = document.nodes[zoomNodeId];
  if (!zoomNode) {
    return [];
  }
  const visible: VisibleNode[] = [];
  const stack = zoomNode.children
    .slice()
    .reverse()
    .map((nodeId) => ({ nodeId, depth: 0 }));
  while (stack.length > 0) {
    const { nodeId, depth } = stack.pop()!;
    const node = document.nodes[nodeId];
    if (!node) {
      continue;
    }
    visible.push({ id: nodeId, node, depth });
    if (node.collapsed) {
      continue;
    }
    pushChildren(stack, node.children, depth + 1);
  }
  return visible;
}

function pushChildren(stack: Array<{ nodeId: NodeId; depth: number }>, children: NodeId[], depth: number): void {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    stack.push({ nodeId: children[index], depth });
  }
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
