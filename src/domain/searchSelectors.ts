import { getBreadcrumbPath } from "./outlineSelectors";
import type { NodeId, OutlineDocument } from "./outlineTypes";

export type SearchResult = {
  nodeId: NodeId;
  text: string;
  source: "text" | "note";
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
      const textMatch = findTextMatch(node.text, normalizedQuery, query.trim().length);
      if (textMatch) {
        return {
          nodeId,
          text: node.text,
          source: "text",
          depth,
          breadcrumbIds: getBreadcrumbPath(document, nodeId),
          ...textMatch
        } satisfies SearchResult;
      }
      const noteMatch = node.note ? findTextMatch(node.note, normalizedQuery, query.trim().length) : undefined;
      if (!noteMatch) {
        return undefined;
      }
      return {
        nodeId,
        text: node.note ?? "",
        source: "note",
        depth,
        breadcrumbIds: getBreadcrumbPath(document, nodeId),
        ...noteMatch
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
    .map((item): SearchResult | undefined => {
      const { nodeId, depth } = item;
      const node = document.nodes[nodeId];
      const token = extractTags(node.text).find((item) => item.value.toLocaleLowerCase() === normalizedTag);
      if (!token) {
        return undefined;
      }
      return {
        nodeId,
        text: node.text,
        source: "text",
        depth,
        breadcrumbIds: getBreadcrumbPath(document, nodeId),
        matchStart: token.start,
        matchEnd: token.end,
        matchText: token.source
      } satisfies SearchResult;
    })
    .filter((result): result is SearchResult => Boolean(result));
}

function findTextMatch(
  source: string,
  normalizedQuery: string,
  queryLength: number
): Pick<SearchResult, "matchStart" | "matchEnd" | "matchText"> | undefined {
  const index = source.toLocaleLowerCase().indexOf(normalizedQuery);
  if (index < 0) {
    return undefined;
  }
  return {
    matchStart: index,
    matchEnd: index + queryLength,
    matchText: source.slice(index, index + queryLength)
  };
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
