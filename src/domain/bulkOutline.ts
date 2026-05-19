import { findParentId } from "./outline";
import { getVisibleNodes } from "./outlineSelectors";
import type { Clock, IdGenerator, NodeId, OutlineDocument, OutlineNode } from "./outlineTypes";

export type PastedOutlineDraft = {
  text: string;
  depth: number;
};

type DraftStackItem = { id: NodeId; depth: number };

export function parseIndentedText(text: string): PastedOutlineDraft[] {
  const rawDrafts = text
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*)(.*)$/);
      const indentation = match?.[1] ?? "";
      const depth = getIndentDepth(indentation);
      return {
        text: `${getIndentRemainder(indentation, depth)}${match?.[2] ?? ""}`.trimEnd(),
        depth
      };
    })
    .filter((draft) => draft.text.length > 0);

  const baseDepth = rawDrafts[0]?.depth ?? 0;
  return rawDrafts.map((draft) => ({
    text: draft.text,
    depth: Math.max(0, draft.depth - baseDepth)
  }));
}

export function insertNodesFromText(
  document: OutlineDocument,
  targetNodeId: NodeId,
  offset: number,
  text: string,
  createId: IdGenerator,
  now: Clock = Date.now
): { document: OutlineDocument; selectedNodeId?: NodeId } {
  const target = document.nodes[targetNodeId];
  const parentId = findParentId(document, targetNodeId);
  const drafts = parseIndentedText(text);
  if (!target || !parentId || targetNodeId === document.rootId || drafts.length === 0) {
    return { document, selectedNodeId: targetNodeId };
  }

  const safeOffset = Math.max(0, Math.min(offset, target.text.length));
  const prefix = target.text.slice(0, safeOffset);
  const suffix = target.text.slice(safeOffset);
  const timestamp = now();
  const nextNodes: Record<NodeId, OutlineNode> = {
    ...document.nodes,
    [targetNodeId]: {
      ...target,
      text: `${prefix}${drafts[0].text}`,
      children: [...target.children],
      updatedAt: timestamp
    }
  };

  const rootsToInsert: NodeId[] = [];
  const stack: Array<{ id: NodeId; depth: number }> = [{ id: targetNodeId, depth: 0 }];
  let lastCreatedId = targetNodeId;

  for (const draft of drafts.slice(1)) {
    const id = createId();
    lastCreatedId = id;
    const isLast = draft === drafts[drafts.length - 1];
    appendDraftNode(nextNodes, rootsToInsert, stack, draft, id, getPastedSuffix(isLast, suffix), timestamp);
  }

  if (drafts.length === 1) {
    nextNodes[targetNodeId] = {
      ...nextNodes[targetNodeId],
      text: `${prefix}${drafts[0].text}${suffix}`,
      updatedAt: timestamp
    };
  }

  if (rootsToInsert.length > 0) {
    const parent = nextNodes[parentId];
    const index = parent.children.indexOf(targetNodeId);
    nextNodes[parentId] = {
      ...parent,
      children: [...parent.children.slice(0, index + 1), ...rootsToInsert, ...parent.children.slice(index + 1)],
      updatedAt: timestamp
    };
  }

  return {
    document: {
      ...document,
      nodes: nextNodes
    },
    selectedNodeId: lastCreatedId
  };
}

function getPastedSuffix(isLast: boolean, suffix: string): string {
  return isLast ? suffix : "";
}

function appendDraftNode(
  nodes: Record<NodeId, OutlineNode>,
  rootsToInsert: NodeId[],
  stack: DraftStackItem[],
  draft: PastedOutlineDraft,
  id: NodeId,
  suffix: string,
  timestamp: number
): void {
  nodes[id] = makePastedNode(id, `${draft.text}${suffix}`, timestamp);
  trimDraftStack(stack, draft.depth);
  const parent = stack[stack.length - 1];
  if (parent && draft.depth > 0) {
    nodes[parent.id] = {
      ...nodes[parent.id],
      children: [...nodes[parent.id].children, id],
      updatedAt: timestamp
    };
  } else {
    rootsToInsert.push(id);
  }
  stack.push({ id, depth: draft.depth });
}

function makePastedNode(id: NodeId, text: string, timestamp: number): OutlineNode {
  return {
    id,
    text,
    children: [],
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function trimDraftStack(stack: DraftStackItem[], depth: number): void {
  while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
    stack.pop();
  }
}

export function selectVisibleRange(
  document: OutlineDocument,
  zoomNodeId: NodeId,
  anchorNodeId: NodeId,
  focusNodeId: NodeId
): NodeId[] {
  const visibleIds = getVisibleNodes(document, zoomNodeId).map((item) => item.id);
  const anchorIndex = visibleIds.indexOf(anchorNodeId);
  const focusIndex = visibleIds.indexOf(focusNodeId);
  if (anchorIndex < 0 || focusIndex < 0) {
    return [];
  }
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  return visibleIds.slice(start, end + 1);
}

export function normalizeTopLevelSelection(document: OutlineDocument, nodeIds: NodeId[]): NodeId[] {
  const selected = new Set(nodeIds.filter((id) => id !== document.rootId && document.nodes[id]));
  return nodeIds.filter((id, index) => {
    if (!selected.has(id) || nodeIds.indexOf(id) !== index) {
      return false;
    }
    let parentId = findParentId(document, id);
    while (parentId) {
      if (selected.has(parentId)) {
        return false;
      }
      if (parentId === document.rootId) {
        return true;
      }
      parentId = findParentId(document, parentId);
    }
    return true;
  });
}

export function bulkIndentNodes(document: OutlineDocument, nodeIds: NodeId[], now: Clock = Date.now): OutlineDocument {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  const selectedSet = new Set(selected);
  const timestamp = now();
  let next = document;

  for (const group of groupByParent(next, selected)) {
    const parent = next.nodes[group.parentId];
    const firstIndex = parent.children.findIndex((id) => group.ids.includes(id));
    const newParentId = findPreviousUnselectedSibling(parent.children, firstIndex, selectedSet);
    if (!newParentId) {
      continue;
    }
    const moving = parent.children.filter((id) => group.ids.includes(id));
    const newParent = next.nodes[newParentId];
    next = {
      ...next,
      nodes: {
        ...next.nodes,
        [group.parentId]: {
          ...parent,
          children: parent.children.filter((id) => !group.ids.includes(id)),
          updatedAt: timestamp
        },
        [newParentId]: {
          ...newParent,
          children: [...newParent.children, ...moving],
          collapsed: false,
          updatedAt: timestamp
        }
      }
    };
  }
  return next;
}

export function bulkOutdentNodes(document: OutlineDocument, nodeIds: NodeId[], now: Clock = Date.now): OutlineDocument {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  const timestamp = now();
  let next = document;

  for (const group of groupByParent(next, selected)) {
    if (group.parentId === next.rootId) {
      continue;
    }
    const parent = next.nodes[group.parentId];
    const grandParentId = findParentId(next, group.parentId);
    if (!grandParentId) {
      continue;
    }
    const grandParent = next.nodes[grandParentId];
    const parentIndex = grandParent.children.indexOf(group.parentId);
    const moving = parent.children.filter((id) => group.ids.includes(id));
    const grandChildren = [...grandParent.children];
    grandChildren.splice(parentIndex + 1, 0, ...moving);
    next = {
      ...next,
      nodes: {
        ...next.nodes,
        [group.parentId]: {
          ...parent,
          children: parent.children.filter((id) => !group.ids.includes(id)),
          updatedAt: timestamp
        },
        [grandParentId]: {
          ...grandParent,
          children: grandChildren,
          updatedAt: timestamp
        }
      }
    };
  }
  return next;
}

export function bulkMoveNodesUp(
  document: OutlineDocument,
  nodeIds: NodeId[],
  _zoomNodeId: NodeId = document.rootId,
  now: Clock = Date.now
): OutlineDocument {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  if (selected.length === 0) {
    return document;
  }
  return moveSelectedSiblingBlocks(document, selected, "up", now);
}

export function bulkMoveNodesDown(
  document: OutlineDocument,
  nodeIds: NodeId[],
  _zoomNodeId: NodeId = document.rootId,
  now: Clock = Date.now
): OutlineDocument {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  if (selected.length === 0) {
    return document;
  }
  return moveSelectedSiblingBlocks(document, selected, "down", now);
}

export function bulkDeleteNodes(
  document: OutlineDocument,
  nodeIds: NodeId[],
  now: Clock = Date.now
): { document: OutlineDocument; selectedNodeId?: NodeId } {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  if (selected.length === 0) {
    return { document };
  }
  const deleting = collectDeletedSubtreeIds(document, selected);
  const timestamp = now();
  const nextNodes = { ...document.nodes };
  for (const id of deleting) {
    delete nextNodes[id];
  }
  for (const node of Object.values(nextNodes)) {
    const nextChildren = node.children.filter((id) => !deleting.has(id));
    if (nextChildren.length !== node.children.length) {
      nextNodes[node.id] = { ...node, children: nextChildren, updatedAt: timestamp };
    }
  }
  const nextDocument = { ...document, nodes: nextNodes };
  const visibleIds = getVisibleNodes(document).map((item) => item.id);
  const firstDeletedIndex = Math.min(...selected.map((id) => visibleIds.indexOf(id)).filter((index) => index >= 0));
  const nextVisibleIds = getVisibleNodes(nextDocument).map((item) => item.id);
  const selectedNodeId = nextVisibleIds[firstDeletedIndex] ?? nextVisibleIds[firstDeletedIndex - 1];
  return { document: nextDocument, selectedNodeId };
}

function collectDeletedSubtreeIds(document: OutlineDocument, selected: NodeId[]): Set<NodeId> {
  const deleting = new Set<NodeId>();
  for (const id of selected) {
    collectSubtreeIds(document, id, deleting);
  }
  return deleting;
}

export function bulkToggleCollapse(
  document: OutlineDocument,
  nodeIds: NodeId[],
  collapsed: boolean,
  now: Clock = Date.now
): OutlineDocument {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  const timestamp = now();
  let nodes = document.nodes;
  for (const id of selected) {
    const node = nodes[id];
    if (!node || node.children.length === 0) {
      continue;
    }
    nodes = {
      ...nodes,
      [id]: {
        ...node,
        collapsed,
        updatedAt: timestamp
      }
    };
  }
  return { ...document, nodes };
}

export function serializeNodesForClipboard(document: OutlineDocument, nodeIds: NodeId[]): string {
  const selected = normalizeTopLevelSelection(document, nodeIds);
  const lines: string[] = [];
  for (const id of selected) {
    serializeSubtree(document, id, 0, lines);
  }
  return lines.join("\n");
}

function getIndentDepth(indentation: string): number {
  let tabs = 0;
  let spaces = 0;
  for (const char of indentation) {
    if (char === "\t") {
      tabs += 1;
    } else if (char === " ") {
      spaces += 1;
    }
  }
  return tabs + Math.floor(spaces / 2);
}

function getIndentRemainder(indentation: string, depth: number): string {
  let remainingDepth = depth;
  let index = 0;
  while (index < indentation.length && remainingDepth > 0) {
    if (indentation[index] === "\t") {
      remainingDepth -= 1;
      index += 1;
      continue;
    }
    if (indentation.slice(index, index + 2) === "  ") {
      remainingDepth -= 1;
      index += 2;
      continue;
    }
    break;
  }
  return indentation.slice(index);
}

function groupByParent(document: OutlineDocument, nodeIds: NodeId[]): Array<{ parentId: NodeId; ids: NodeId[] }> {
  const groups: Array<{ parentId: NodeId; ids: NodeId[] }> = [];
  for (const id of nodeIds) {
    const parentId = findParentId(document, id);
    if (!parentId) {
      continue;
    }
    const group = groups.find((item) => item.parentId === parentId);
    if (group) {
      group.ids.push(id);
    } else {
      groups.push({ parentId, ids: [id] });
    }
  }
  return groups;
}

function findPreviousUnselectedSibling(children: NodeId[], firstIndex: number, selected: Set<NodeId>): NodeId | undefined {
  for (let index = firstIndex - 1; index >= 0; index -= 1) {
    if (!selected.has(children[index])) {
      return children[index];
    }
  }
  return undefined;
}

function collectSubtreeIds(document: OutlineDocument, nodeId: NodeId, ids: Set<NodeId>): void {
  const node = document.nodes[nodeId];
  if (!node) {
    return;
  }
  ids.add(nodeId);
  for (const childId of node.children) {
    collectSubtreeIds(document, childId, ids);
  }
}

function moveSelectedSiblingBlocks(
  document: OutlineDocument,
  nodeIds: NodeId[],
  direction: "up" | "down",
  now: Clock
): OutlineDocument {
  const timestamp = now();
  let nodes = document.nodes;
  for (const group of groupByParent(document, nodeIds)) {
    nodes = moveSiblingGroup({ ...document, nodes }, nodes, group, direction, timestamp);
  }
  return { ...document, nodes };
}

function moveSiblingGroup(
  document: OutlineDocument,
  nodes: OutlineDocument["nodes"],
  group: { parentId: NodeId; ids: NodeId[] },
  direction: "up" | "down",
  timestamp: number
): OutlineDocument["nodes"] {
  const parent = nodes[group.parentId];
  const selected = new Set(group.ids);
  const moving = parent.children.filter((id) => selected.has(id));
  if (moving.length === 0) {
    return nodes;
  }
  const swapId = findSwapSibling(parent.children, selected, direction);
  if (swapId) {
    return moveWithinParent(nodes, group.parentId, parent, selected, moving, swapId, direction, timestamp);
  }
  if (group.parentId === document.rootId) {
    return nodes;
  }
  const grandParentId = findParentId(document, group.parentId);
  return grandParentId
    ? moveAcrossParent(nodes, group.parentId, parent, selected, moving, grandParentId, direction, timestamp)
    : nodes;
}

function findSwapSibling(
  children: NodeId[],
  selected: Set<NodeId>,
  direction: "up" | "down"
): NodeId | undefined {
  const firstIndex = children.findIndex((id) => selected.has(id));
  const lastIndex = findLastIndex(children, (id) => selected.has(id));
  return direction === "up"
    ? findSiblingBefore(children, firstIndex, selected)
    : findSiblingAfter(children, lastIndex, selected);
}

function moveWithinParent(
  nodes: OutlineDocument["nodes"],
  parentId: NodeId,
  parent: OutlineNode,
  selected: Set<NodeId>,
  moving: NodeId[],
  swapId: NodeId,
  direction: "up" | "down",
  timestamp: number
): OutlineDocument["nodes"] {
  const withoutMoving = parent.children.filter((id) => !selected.has(id));
  const swapIndex = withoutMoving.indexOf(swapId);
  const insertIndex = direction === "up" ? swapIndex : swapIndex + 1;
  const nextChildren = [...withoutMoving];
  nextChildren.splice(insertIndex, 0, ...moving);
  return {
    ...nodes,
    [parentId]: {
      ...parent,
      children: nextChildren,
      updatedAt: timestamp
    }
  };
}

function moveAcrossParent(
  nodes: OutlineDocument["nodes"],
  parentId: NodeId,
  parent: OutlineNode,
  selected: Set<NodeId>,
  moving: NodeId[],
  grandParentId: NodeId,
  direction: "up" | "down",
  timestamp: number
): OutlineDocument["nodes"] {
  const grandParent = nodes[grandParentId];
  const parentIndex = grandParent.children.indexOf(parentId);
  const parentChildren = parent.children.filter((id) => !selected.has(id));
  if (direction === "up" && parentIndex > 0) {
    const previousParentSiblingId = grandParent.children[parentIndex - 1];
    const previousParentSibling = nodes[previousParentSiblingId];
    return replaceParentAndSibling(nodes, parentId, parent, parentChildren, previousParentSiblingId, {
      ...previousParentSibling,
      children: [...previousParentSibling.children, ...moving],
      collapsed: false,
      updatedAt: timestamp
    }, timestamp);
  }
  if (direction === "down" && parentIndex < grandParent.children.length - 1) {
    const nextParentSiblingId = grandParent.children[parentIndex + 1];
    const nextParentSibling = nodes[nextParentSiblingId];
    return replaceParentAndSibling(nodes, parentId, parent, parentChildren, nextParentSiblingId, {
      ...nextParentSibling,
      children: [...moving, ...nextParentSibling.children],
      collapsed: false,
      updatedAt: timestamp
    }, timestamp);
  }
  return moveBesideParent(nodes, parentId, parent, parentChildren, grandParentId, direction, parentIndex, moving, timestamp);
}

function replaceParentAndSibling(
  nodes: OutlineDocument["nodes"],
  parentId: NodeId,
  parent: OutlineNode,
  parentChildren: NodeId[],
  siblingId: NodeId,
  sibling: OutlineNode,
  timestamp: number
): OutlineDocument["nodes"] {
  return {
    ...nodes,
    [parentId]: { ...parent, children: parentChildren, updatedAt: timestamp },
    [siblingId]: sibling
  };
}

function moveBesideParent(
  nodes: OutlineDocument["nodes"],
  parentId: NodeId,
  parent: OutlineNode,
  parentChildren: NodeId[],
  grandParentId: NodeId,
  direction: "up" | "down",
  parentIndex: number,
  moving: NodeId[],
  timestamp: number
): OutlineDocument["nodes"] {
  const grandParent = nodes[grandParentId];
  const grandParentChildren = [...grandParent.children];
  grandParentChildren.splice(direction === "up" ? parentIndex : parentIndex + 1, 0, ...moving);
  return {
    ...nodes,
    [parentId]: { ...parent, children: parentChildren, updatedAt: timestamp },
    [grandParentId]: { ...grandParent, children: grandParentChildren, updatedAt: timestamp }
  };
}

function findSiblingBefore(children: NodeId[], startIndex: number, selected: Set<NodeId>): NodeId | undefined {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (!selected.has(children[index])) {
      return children[index];
    }
  }
  return undefined;
}

function findSiblingAfter(children: NodeId[], startIndex: number, selected: Set<NodeId>): NodeId | undefined {
  for (let index = startIndex + 1; index < children.length; index += 1) {
    if (!selected.has(children[index])) {
      return children[index];
    }
  }
  return undefined;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

function serializeSubtree(document: OutlineDocument, nodeId: NodeId, depth: number, lines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node) {
    return;
  }
  lines.push(`${"  ".repeat(depth)}${node.text}`);
  for (const childId of node.children) {
    serializeSubtree(document, childId, depth + 1, lines);
  }
}
