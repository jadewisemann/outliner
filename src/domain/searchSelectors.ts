import { getBreadcrumbPath } from "./outlineSelectors";
import type { NodeId, OutlineDocument } from "./outlineTypes";

export type SearchResult = {
  nodeId: NodeId;
  text: string;
  depth: number;
  breadcrumbIds: NodeId[];
  matchStart: number;
  matchEnd: number;
  matchText: string;
};

export type TagToken = {
  source: string;
  value: string;
  kind: "hash" | "at";
  start: number;
  end: number;
};

export type LinkCandidate = {
  nodeId: NodeId;
  label: string;
  breadcrumbIds: NodeId[];
};

export type Backlink = {
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
  label: string;
  source: string;
  broken: boolean;
};

export type CircularSourceIndexEntry = {
  nodeId: NodeId;
  circularReferences: number;
};

export function searchOutline(
  document: OutlineDocument,
  query: string,
  options: { zoomNodeId?: NodeId } = {}
): SearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const zoomNodeId = options.zoomNodeId ?? document.rootId;
  return collectSubtree(document, zoomNodeId)
    .map(({ nodeId, depth }) => {
      const node = document.nodes[nodeId];
      const index = node.text.toLocaleLowerCase().indexOf(normalizedQuery);
      if (index < 0) {
        return undefined;
      }
      return {
        nodeId,
        text: node.text,
        depth,
        breadcrumbIds: getBreadcrumbPath(document, nodeId),
        matchStart: index,
        matchEnd: index + query.trim().length,
        matchText: node.text.slice(index, index + query.trim().length)
      } satisfies SearchResult;
    })
    .filter((result): result is SearchResult => Boolean(result));
}

export function extractTags(text: string): TagToken[] {
  const tags: TagToken[] = [];
  const pattern = /(^|[\s([{])([#@])([A-Za-z0-9가-힣_-]+)/gu;
  for (const match of text.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const marker = match[2];
    const value = match[3];
    const start = (match.index ?? 0) + prefix.length;
    tags.push({
      source: `${marker}${value}`,
      value,
      kind: marker === "#" ? "hash" : "at",
      start,
      end: start + marker.length + value.length
    });
  }
  return tags;
}

export function findNodesByTag(document: OutlineDocument, zoomNodeId: NodeId, tag: string): SearchResult[] {
  const normalizedTag = tag.replace(/^[#@]/, "").toLocaleLowerCase();
  if (!normalizedTag) {
    return [];
  }
  return collectSubtree(document, zoomNodeId)
    .map(({ nodeId, depth }) => {
      const node = document.nodes[nodeId];
      const token = extractTags(node.text).find((item) => item.value.toLocaleLowerCase() === normalizedTag);
      if (!token) {
        return undefined;
      }
      return {
        nodeId,
        text: node.text,
        depth,
        breadcrumbIds: getBreadcrumbPath(document, nodeId),
        matchStart: token.start,
        matchEnd: token.end,
        matchText: token.source
      } satisfies SearchResult;
    })
    .filter((result): result is SearchResult => Boolean(result));
}

export function findLinkCandidates(
  document: OutlineDocument,
  zoomNodeId: NodeId,
  query: string,
  limit = 8
): LinkCandidate[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return collectSubtree(document, zoomNodeId)
    .map(({ nodeId }) => document.nodes[nodeId])
    .filter((node) => node.text.trim().length > 0)
    .filter((node) => !normalizedQuery || node.text.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, limit)
    .map((node) => ({
      nodeId: node.id,
      label: node.text,
      breadcrumbIds: getBreadcrumbPath(document, node.id)
    }));
}

export function getBacklinks(document: OutlineDocument, targetNodeId: NodeId): Backlink[] {
  return Object.values(document.nodes).flatMap((node) =>
    (node.links ?? [])
      .filter((link) => link.targetNodeId === targetNodeId)
      .map((link) => ({
        sourceNodeId: node.id,
        targetNodeId: link.targetNodeId,
        label: link.label,
        source: link.source,
        broken: !document.nodes[link.targetNodeId]
      }))
  );
}

export function getBrokenLinks(document: OutlineDocument): Backlink[] {
  return Object.values(document.nodes).flatMap((node) =>
    (node.links ?? [])
      .filter((link) => !document.nodes[link.targetNodeId])
      .map((link) => ({
        sourceNodeId: node.id,
        targetNodeId: link.targetNodeId,
        label: link.label,
        source: link.source,
        broken: true
      }))
  );
}

export function getCircularSourceIndex(
  document: OutlineDocument,
  options: { minimumCircularReferences?: number } = {}
): CircularSourceIndexEntry[] {
  const minimumCircularReferences = Math.max(1, options.minimumCircularReferences ?? 1);
  return Object.values(document.nodes)
    .map((node) => {
      const circularReferences = (node.links ?? []).filter(
        (link) =>
          document.nodes[link.targetNodeId] &&
          (link.targetNodeId === node.id || hasLinkPath(document, link.targetNodeId, node.id, new Set([node.id])))
      ).length;
      return { nodeId: node.id, circularReferences };
    })
    .filter((entry) => entry.circularReferences >= minimumCircularReferences);
}

function collectSubtree(document: OutlineDocument, zoomNodeId: NodeId): Array<{ nodeId: NodeId; depth: number }> {
  const zoomNode = document.nodes[zoomNodeId];
  if (!zoomNode) {
    return [];
  }
  const nodes: Array<{ nodeId: NodeId; depth: number }> = [];
  const stack = zoomNode.children
    .slice()
    .reverse()
    .map((nodeId) => ({ nodeId, depth: 0 }));
  while (stack.length > 0) {
    const item = stack.pop()!;
    const node = document.nodes[item.nodeId];
    if (!node) {
      continue;
    }
    nodes.push(item);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ nodeId: node.children[index], depth: item.depth + 1 });
    }
  }
  return nodes;
}

function hasLinkPath(
  document: OutlineDocument,
  fromNodeId: NodeId,
  targetNodeId: NodeId,
  visited: Set<NodeId>
): boolean {
  if (fromNodeId === targetNodeId) {
    return true;
  }
  if (visited.has(fromNodeId)) {
    return false;
  }
  visited.add(fromNodeId);
  const node = document.nodes[fromNodeId];
  if (!node) {
    return false;
  }
  return (node.links ?? []).some((link) => hasLinkPath(document, link.targetNodeId, targetNodeId, new Set(visited)));
}
