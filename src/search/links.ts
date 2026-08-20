import { docList, type Id, type Workspace } from "../types";

/**
 * Links between rows, and the reverse index that makes backlinks possible.
 *
 * A document link is written `[[Title]]` and resolved by title, because a
 * title is what a person types. An *item* link is written `((id))` and
 * resolved by id, because an item has no name.
 *
 * That difference has a consequence worth wanting: an item link has no label
 * of its own, so it is rendered from the target's current text. Rewording the
 * target rewords every link to it, and a link can never quietly disagree with
 * the row it points at.
 */

export const ITEM_LINK = /\(\(([\w-]{1,64})\)\)/g;
const DOC_LINK = /\[\[([^\]\n]+)\]\]/g;

export type Placed = { docId: Id; docTitle: string; nodeId: Id; text: string };

export function itemLinksIn(text: string): Id[] {
  return [...text.matchAll(ITEM_LINK)].map((match) => match[1]);
}

/** Where a node id lives, or null when nothing has that id any more. */
export function findNode(workspace: Workspace, id: Id): Placed | null {
  for (const doc of Object.values(workspace.docs)) {
    const node = doc.nodes[id];
    if (node && node.id !== doc.rootId) {
      return { docId: doc.id, docTitle: doc.title, nodeId: id, text: node.text };
    }
  }
  return null;
}

/**
 * Every row that links to a given target, keyed by node id for item links and
 * by document id for `[[Title]]`. One pass serves both — walking the whole
 * workspace twice for two link kinds would be the same walk.
 */
export function backlinks(workspace: Workspace): Map<string, Placed[]> {
  const byTitle = new Map<string, Id>();
  for (const doc of docList(workspace)) {
    if (doc.kind === "doc") byTitle.set(doc.title.toLowerCase(), doc.id);
  }

  const index = new Map<string, Placed[]>();
  const add = (key: string, source: Placed) => {
    const bucket = index.get(key);
    if (bucket) bucket.push(source);
    else index.set(key, [source]);
  };

  for (const doc of Object.values(workspace.docs)) {
    for (const node of Object.values(doc.nodes)) {
      if (node.id === doc.rootId) continue;
      const source: Placed = { docId: doc.id, docTitle: doc.title, nodeId: node.id, text: node.text };
      const haystack = `${node.text}\n${node.note}`;

      for (const id of itemLinksIn(haystack)) {
        // A row linking to itself is not a backlink, it is a typo.
        if (id !== node.id) add(id, source);
      }
      for (const match of haystack.matchAll(DOC_LINK)) {
        const docId = byTitle.get(match[1].toLowerCase());
        if (docId && docId !== doc.id) add(docId, source);
      }
    }
  }
  return index;
}

/** The text a `((id))` shows: the target's own, flattened to one line. */
export function labelOf(workspace: Workspace, id: Id): string | null {
  const found = findNode(workspace, id);
  if (!found) return null;
  const line = found.text.replace(/\s+/g, " ").trim();
  return line === "" ? "(빈 항목)" : line;
}
