// Workspace-level document operations: pure functions from the workspace to
// the next one, which the `docs` facade in `store.ts` runs through
// `editWorkspace`.
//
// A branch that changes nothing returns `current` itself. The store skips an
// edit whose result is the same object, and React skips the render (DESIGN.md
// principle 4). Stamps are taken inside the operation, so a change is dated
// when it is applied.
//
// What needs more than the workspace stays in the store: sort keys minted from
// `live.current`, moving the caret, remembering recent documents.
import { keyBetween } from "@/shared/lib/order";
import { appendChild, cutSubtree, graftSubtree, patchNode } from "./tree";
import { docChildren, makeView, realDocs, stamp, type Doc, type Id, type Workspace } from "./types";

/**
 * Whether filing `id` into `parent` would put it inside itself: `parent` is
 * `id`, or sits somewhere under it.
 *
 * The walk up from `parent` remembers where it has been, because the chain can
 * already loop. Each document's position merges on its own, last writer wins,
 * so two devices filing A into B and B into A at the same time leave A in B
 * and B in A; a backup import can arrive that way too, since validation checks
 * documents one at a time. An unguarded walk never ends there. A loop that
 * does not pass through `id` cannot put `id` inside itself, so the move stays
 * allowed.
 */
export function nestsInto(workspace: Workspace, id: Id, parent: Id | null): boolean {
  const seen = new Set<Id>();
  for (let cursor = parent; cursor && !seen.has(cursor); cursor = workspace.docs[cursor]?.parent ?? null) {
    if (cursor === id) return true;
    seen.add(cursor);
  }
  return false;
}

/** Adds `doc` and opens it, with a fresh view. */
export function attach(current: Workspace, doc: Doc): Workspace {
  return {
    ...current,
    docs: { ...current.docs, [doc.id]: doc },
    activeDocId: doc.id,
    views: { ...current.views, [doc.id]: makeView(doc) }
  };
}

/**
 * Marks where a quick capture lands, or clears the mark.
 *
 * Only one document is the inbox, so setting it unmarks the others in the
 * same edit — otherwise two marks would sit here waiting for `inboxDoc`
 * to break a tie that this device could have avoided making. Folders and
 * saved searches cannot hold an outline, so they cannot hold a capture.
 */
export function setInbox(current: Workspace, id: Id | null): Workspace {
  if (id !== null && current.docs[id]?.kind !== "doc") return current;
  const now = stamp();
  const docs = { ...current.docs };
  let changed = false;
  for (const doc of Object.values(current.docs)) {
    const wanted = doc.id === id;
    if (doc.inbox === wanted) continue;
    docs[doc.id] = { ...doc, inbox: wanted, titleEdited: now };
    changed = true;
  }
  return changed ? { ...current, docs } : current;
}

/**
 * Appends `text` as the last row of `target` and opens that document.
 *
 * The workspace's copy of `target` is used when it has one; otherwise
 * `target` is new and is added with it. `appendChild` writes into the empty
 * first row of a document just made rather than adding a second one.
 */
export function capture(current: Workspace, target: Doc, text: string): Workspace {
  const doc = current.docs[target.id] ?? target;
  const added = appendChild(doc, doc.rootId);
  if (!added.focusId) return current;
  const next = patchNode(added.doc, added.focusId, { text });
  return {
    ...current,
    docs: { ...current.docs, [next.id]: next },
    activeDocId: next.id,
    views: current.views[next.id] ? current.views : { ...current.views, [next.id]: makeView(next) }
  };
}

export function toggleBookmark(current: Workspace, id: Id): Workspace {
  return current.docs[id]
    ? {
        ...current,
        docs: {
          ...current.docs,
          [id]: { ...current.docs[id], bookmarked: !current.docs[id].bookmarked, titleEdited: stamp() }
        }
      }
    : current;
}

/** Files a document (or folder) into `parent`, or back to the top level. */
export function moveInto(current: Workspace, id: Id, parent: Id | null): Workspace {
  const doc = current.docs[id];
  // A folder cannot be filed into itself or into its own descendant.
  if (!doc || nestsInto(current, id, parent)) return current;
  return { ...current, docs: { ...current.docs, [id]: { ...doc, parent, moved: stamp() } } };
}

export function rename(current: Workspace, id: Id, title: string): Workspace {
  return current.docs[id]
    ? { ...current, docs: { ...current.docs, [id]: { ...current.docs[id], title, titleEdited: stamp() } } }
    : current;
}

/** Into the trash, where it stays restorable until the window runs out. */
export function remove(current: Workspace, id: Id): Workspace {
  const doomed = current.docs[id];
  if (!doomed || doomed.deleted) return current;
  // The app always has to have a document open, so the last live one
  // cannot go. Folders and saved searches do not count towards that.
  const survivors = realDocs(current).filter((doc) => doc.id !== id);
  if (doomed.kind === "doc" && survivors.length === 0) return current;
  const now = stamp();
  return {
    ...current,
    docs: { ...current.docs, [id]: { ...doomed, deleted: now, titleEdited: now } },
    activeDocId: current.activeDocId === id ? survivors[0].id : current.activeDocId
  };
}

export function restore(current: Workspace, id: Id): Workspace {
  const doc = current.docs[id];
  if (!doc?.deleted) return current;
  const now = stamp();
  return { ...current, docs: { ...current.docs, [id]: { ...doc, deleted: null, titleEdited: now } } };
}

/** The one delete that cannot be undone; the file leaves the remote too. */
export function purge(current: Workspace, id: Id): Workspace {
  const remaining = { ...current.docs };
  delete remaining[id];
  const views = { ...current.views };
  delete views[id];
  return { ...current, docs: remaining, graves: { ...current.graves, [id]: stamp() }, views };
}

/**
 * Puts a past version of a document back.
 *
 * Every node is re-stamped, for the same reason undo re-stamps rather
 * than restoring a snapshot: an old stamp loses the next merge, and the
 * restore would be quietly undone by the first sync. Gravestones for the
 * rows coming back are dropped, or they would bury them again.
 */
export function restoreVersion(current: Workspace, past: Doc): Workspace {
  const live = current.docs[past.id];
  if (!live) return current;
  const now = stamp();
  const nodes: Record<Id, Doc["nodes"][string]> = {};
  for (const [id, node] of Object.entries(past.nodes)) nodes[id] = { ...node, edited: now, moved: now };

  const graves = { ...live.graves };
  for (const id of Object.keys(nodes)) delete graves[id];
  // Rows the live document has that the past one did not are gone as
  // of this restore, and need stones so other devices agree.
  for (const id of Object.keys(live.nodes)) if (!nodes[id]) graves[id] = now;

  return {
    ...current,
    docs: {
      ...current.docs,
      [past.id]: { ...live, rootId: past.rootId, nodes, graves, titleEdited: now, title: past.title }
    }
  };
}

/**
 * Opens a document, keeping its view unless a zoom or focus is asked for.
 * Folders, saved searches and trashed documents cannot be opened.
 */
export function select(current: Workspace, id: Id, options: { zoomId?: Id; focusId?: Id } = {}): Workspace {
  const target = current.docs[id];
  if (!target || target.kind !== "doc" || target.deleted) return current;
  const existing = current.views[id] ?? makeView(target);
  return {
    ...current,
    activeDocId: id,
    views: {
      ...current.views,
      [id]: { ...existing, zoomId: options.zoomId ?? existing.zoomId, focusId: options.focusId ?? existing.focusId }
    }
  };
}

/** Drops `id` at `toIndex` among the children of `parent`. */
export function reorder(current: Workspace, id: Id, parent: Id | null, toIndex: number): Workspace {
  const doc = current.docs[id];
  // The same guard as `moveInto`: a folder cannot end up inside itself.
  if (!doc || nestsInto(current, id, parent)) return current;
  const ordered = docChildren(current, parent).filter((entry) => entry.id !== id);
  const at = Math.max(0, Math.min(toIndex, ordered.length));
  const before = ordered[at - 1]?.sort ?? null;
  const after = ordered[at]?.sort ?? null;
  const sort = keyBetween(before, before !== null && after !== null && before >= after ? null : after);
  return { ...current, docs: { ...current.docs, [id]: { ...doc, parent, sort, moved: stamp() } } };
}

/**
 * Moves a row and everything under it from the active document into another
 * one, ids and all.
 *
 * Both documents change in one edit. The GitHub backend stores them as two
 * files, so a device that pulls between the two writes sees the row in both
 * places. It converges on the next round — the merge does not care about
 * order — and `remote/github.ts` pushes the document that did the burying
 * first, which makes that window as small as it can be. The REST and folder
 * backends write the whole workspace as one file, so they have no such window.
 */
export function moveToDoc(current: Workspace, nodeId: Id, targetDocId: Id): Workspace {
  const source = current.docs[current.activeDocId];
  const target = current.docs[targetDocId];
  if (!source || !target || target.kind === "folder" || source.id === target.id) return current;

  const cut = cutSubtree(source, nodeId);
  if (!cut) return current;
  const grafted = graftSubtree(target, target.rootId, cut.taken);
  return { ...current, docs: { ...current.docs, [source.id]: cut.doc, [target.id]: grafted.doc } };
}
