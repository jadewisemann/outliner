import type { Id, Workspace } from "@/entities/outline";

/**
 * The bookmarked documents and rows, in document order. Walks every node of
 * every document, so a caller on the typing path runs it on a deferred
 * workspace (the sidebar does, as it does for tags).
 */
export function bookmarks(workspace: Workspace): { docId: Id; nodeId: Id | null; label: string }[] {
  const out: { docId: Id; nodeId: Id | null; label: string }[] = [];
  for (const doc of Object.values(workspace.docs)) {
    if (doc.bookmarked) out.push({ docId: doc.id, nodeId: null, label: doc.title });
    for (const node of Object.values(doc.nodes)) {
      if (node.bookmarked && node.id !== doc.rootId) out.push({ docId: doc.id, nodeId: node.id, label: node.text });
    }
  }
  return out;
}
