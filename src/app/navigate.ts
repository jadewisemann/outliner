import { reveal } from "../outline/tree";
import { findNode } from "../search/links";
import type { Store } from "../store";
import { docList } from "../types";

/** `[[Title]]` opens the matching document, creating it when missing. */
export function openDocByTitle(store: Store, title: string) {
  const match = docList(store.workspace).find((doc) => doc.title.toLowerCase() === title.toLowerCase());
  if (match) store.docs.select(match.id);
  else store.docs.create(title);
}

/**
 * `((id))` and backlinks both land the caret on a row wherever it lives.
 *
 * The order is load-bearing: `select` switches the active document at once
 * (`live.current`, not the next render), so the `edit` right after it reveals
 * the row in the document just opened rather than in the one being left.
 */
export function jumpToNode(store: Store, id: string) {
  const found = findNode(store.workspace, id);
  if (!found) return;
  store.docs.select(found.docId, { zoomId: store.workspace.docs[found.docId].rootId });
  store.edit((doc) => reveal(doc, id), { transient: true });
  store.requestFocus(id);
}
