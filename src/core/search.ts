import { extractTags } from "./inline";
import { ancestors } from "./tree";
import { docList, type Doc, type Id, type Workspace } from "./types";

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
 * Matches every whitespace-separated term (AND). A term starting with `#`
 * only matches tags; anything else matches text or note, case-insensitively.
 */
export function search(workspace: Workspace, query: string, limit = 200): Hit[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: Hit[] = [];
  const ids = docList(workspace).map((doc) => doc.id);
  const order = [workspace.activeDocId, ...ids.filter((id) => id !== workspace.activeDocId)];

  for (const docId of order) {
    const doc = workspace.docs[docId];
    if (!doc) continue;
    for (const node of Object.values(doc.nodes)) {
      if (node.id === doc.rootId) continue;
      if (!matches(node.text, node.note, terms)) continue;
      hits.push({
        docId,
        docTitle: doc.title,
        nodeId: node.id,
        text: node.text,
        note: node.note,
        trail: trailOf(doc, node.id)
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

function matches(text: string, note: string, terms: string[]): boolean {
  const haystack = `${text}\n${note}`.toLowerCase();
  const tags = extractTags(text).map((tag) => tag.toLowerCase());
  return terms.every((term) =>
    term.startsWith("#") ? tags.some((tag) => tag === term || tag.startsWith(`${term}/`)) : haystack.includes(term)
  );
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
