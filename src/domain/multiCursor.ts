import { getVisibleNodes } from "./outlineSelectors";
import type { Clock, NodeId, OutlineCursor, OutlineDocument } from "./outlineTypes";

export type CursorTextEdit =
  | { type: "insert"; text: string }
  | { type: "backspace" }
  | { type: "delete" };

export function addCursorAbove(
  document: OutlineDocument,
  zoomNodeId: NodeId,
  cursors: OutlineCursor[] | undefined,
  primary: OutlineCursor
): OutlineCursor[] {
  return addCursorByDirection(document, zoomNodeId, cursors, primary, "above");
}

export function addCursorBelow(
  document: OutlineDocument,
  zoomNodeId: NodeId,
  cursors: OutlineCursor[] | undefined,
  primary: OutlineCursor
): OutlineCursor[] {
  return addCursorByDirection(document, zoomNodeId, cursors, primary, "below");
}

export function clearCursors(): undefined {
  return undefined;
}

export function applyTextToCursors(
  document: OutlineDocument,
  zoomNodeId: NodeId,
  cursors: OutlineCursor[] | undefined,
  edit: CursorTextEdit,
  now: Clock = Date.now
): { document: OutlineDocument; cursors: OutlineCursor[] } {
  const normalized = normalizeCursors(document, cursors ?? []);
  if (normalized.length === 0) {
    return { document, cursors: [] };
  }
  const visibleOrder = new Map(getVisibleNodes(document, zoomNodeId).map((item, index) => [item.id, index]));
  const sorted = [...normalized].sort((left, right) => {
    const rowDelta = (visibleOrder.get(right.nodeId) ?? -1) - (visibleOrder.get(left.nodeId) ?? -1);
    return rowDelta === 0 ? right.offset - left.offset : rowDelta;
  });
  const timestamp = now();
  const nextOffsets = new Map<string, number>();
  const nodes = { ...document.nodes };

  for (const cursor of sorted) {
    const node = nodes[cursor.nodeId];
    if (!node || cursor.nodeId === document.rootId) {
      continue;
    }
    const offset = clampOffset(cursor.offset, node.text);
    let text = node.text;
    let nextOffset = offset;
    if (edit.type === "insert") {
      text = `${text.slice(0, offset)}${edit.text}${text.slice(offset)}`;
      nextOffset = offset + edit.text.length;
    } else if (edit.type === "backspace" && offset > 0) {
      text = `${text.slice(0, offset - 1)}${text.slice(offset)}`;
      nextOffset = offset - 1;
    } else if (edit.type === "delete" && offset < text.length) {
      text = `${text.slice(0, offset)}${text.slice(offset + 1)}`;
    }
    nodes[cursor.nodeId] = {
      ...node,
      text,
      updatedAt: timestamp
    };
    nextOffsets.set(cursorKey(cursor), nextOffset);
  }

  return {
    document: { ...document, nodes },
    cursors: normalized.map((cursor) => ({
      nodeId: cursor.nodeId,
      offset: nextOffsets.get(cursorKey(cursor)) ?? cursor.offset
    }))
  };
}

function addCursorByDirection(
  document: OutlineDocument,
  zoomNodeId: NodeId,
  cursors: OutlineCursor[] | undefined,
  primary: OutlineCursor,
  direction: "above" | "below"
): OutlineCursor[] {
  const visible = getVisibleNodes(document, zoomNodeId);
  const index = visible.findIndex((item) => item.id === primary.nodeId);
  const target = direction === "above" ? visible[index - 1] : visible[index + 1];
  const base = normalizeCursors(document, cursors?.length ? cursors : [primary]);
  if (!target) {
    return base;
  }
  return normalizeCursors(document, [
    ...base,
    {
      nodeId: target.id,
      offset: clampOffset(primary.offset, target.node.text)
    }
  ]);
}

function normalizeCursors(document: OutlineDocument, cursors: OutlineCursor[]): OutlineCursor[] {
  const seen = new Set<string>();
  const normalized: OutlineCursor[] = [];
  for (const cursor of cursors) {
    const node = document.nodes[cursor.nodeId];
    if (!node || cursor.nodeId === document.rootId) {
      continue;
    }
    const next = {
      nodeId: cursor.nodeId,
      offset: clampOffset(cursor.offset, node.text)
    };
    const key = cursorKey(next);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(next);
    }
  }
  return normalized;
}

function clampOffset(offset: number, text: string): number {
  return Math.max(0, Math.min(offset, text.length));
}

function cursorKey(cursor: OutlineCursor): string {
  return `${cursor.nodeId}:${cursor.offset}`;
}
