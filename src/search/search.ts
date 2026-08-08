import { extractTags } from "../outline/inline";
import { ancestors } from "../outline/tree";
import { parseQuery } from "./query";
import { docList, type Doc, type Id, type Workspace } from "../types";

export type Hit = {
  docId: Id;
  docTitle: string;
  nodeId: Id;
  text: string;
  note: string;
  /** Ancestor texts, root-first, for the "where is this" line under a result. */
  trail: string[];
};

/**
 * Every row in the workspace that the query accepts, active document first.
 *
 * The query language itself lives in `query.ts`, because the in-document
 * filter has to understand exactly the same one — a query that meant two
 * different things in two places would be worse than no operators at all.
 */
export function search(workspace: Workspace, query: string, limit = 200): Hit[] {
  const accepts = parseQuery(query);
  if (!accepts) return [];

  const hits: Hit[] = [];
  const ids = docList(workspace).map((doc) => doc.id);
  const order = [workspace.activeDocId, ...ids.filter((id) => id !== workspace.activeDocId)];

  for (const docId of order) {
    const doc = workspace.docs[docId];
    if (!doc || doc.kind === "folder") continue;
    for (const node of Object.values(doc.nodes)) {
      if (node.id === doc.rootId) continue;
      const trail = trailOf(doc, node.id);
      if (!accepts({ node, trail })) continue;
      hits.push({ docId, docTitle: doc.title, nodeId: node.id, text: node.text, note: node.note, trail });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

function trailOf(doc: Doc, id: Id): string[] {
  return ancestors(doc, id)
    .filter((ancestor) => ancestor !== doc.rootId)
    .map((ancestor) => doc.nodes[ancestor]?.text ?? "")
    .filter(Boolean);
}

/** Every distinct tag in the workspace, with usage counts, most used first. */
export function allTags(workspace: Workspace): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const doc of Object.values(workspace.docs)) {
    for (const node of Object.values(doc.nodes)) {
      for (const tag of extractTags(node.text)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
