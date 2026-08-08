import { observe, wins } from "../shared/clock";
import { rebuildChildren } from "../outline/tree";
import type { Doc, Id, Node, Stamp, SyncPayload } from "../types";

/**
 * Merging two versions of the same workspace.
 *
 * There is no general-purpose CRDT here. An outline needs exactly three things
 * to merge without losing a device's offline work:
 *
 *  1. Every node carries `parent` + `sort`, so two devices can insert or move
 *     rows independently and both results survive.
 *  2. Content and position are stamped separately, so editing a row on one
 *     device and moving it on another keeps both changes.
 *  3. Deletes leave a gravestone, so an older device cannot resurrect a row —
 *     while an edit made *after* the delete does bring it back.
 *
 * Concurrent edits to the same field of the same row still resolve to one
 * winner. For a single person across their own devices that is the right
 * trade: the alternative costs an order of magnitude more machinery.
 *
 * The merge preserves object identity wherever nothing actually changed, so
 * `store` can tell a no-op sync from a real one and React can skip the render.
 */

/** Gravestones older than this are forgotten; see `pruneGraves`. */
export const GRAVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type MergeOptions = {
  now?: number;
  /**
   * Set only on a device's very first sync with an endpoint. Content alone
   * cannot identify a fresh device — a user who undid their way back to an
   * empty document looks identical, and adopting the remote there would throw
   * the undo away.
   */
  adoptRemote?: boolean;
};

export function mergeWorkspace(local: SyncPayload, remote: SyncPayload, options: MergeOptions = {}): SyncPayload {
  const now = options.now ?? Date.now();
  observeStamps(remote);

  // A device signing in for the first time adopts what is already there rather
  // than contributing its untouched starter document.
  if (options.adoptRemote && isUntouched(local) && Object.keys(remote.docs).length > 0) {
    return normalise(remote, now);
  }

  const graves = mergeGraves(local.graves, remote.graves);
  const docs: Record<Id, Doc> = {};

  for (const id of union(local.docs, remote.docs)) {
    const mine = local.docs[id];
    const theirs = remote.docs[id];
    const merged = mine && theirs ? mergeDoc(mine, theirs) : settle(mine ?? theirs);
    if (buried(graves[id], newestStamp(merged))) continue;
    docs[id] = merged;
  }

  // A workspace with no documents left is not a state the app can show. The
  // choice has to be identical on every device or they would each keep a
  // different survivor and overwrite each other forever.
  if (Object.keys(docs).length === 0) {
    const candidates = union(local.docs, remote.docs)
      .map((id) => local.docs[id] ?? remote.docs[id])
      .sort((a, b) => newestStamp(b).at - newestStamp(a).at || (a.id < b.id ? -1 : 1));
    if (candidates[0]) docs[candidates[0].id] = settle(candidates[0]);
  }

  // A document that survived is not dead, whatever its gravestone says —
  // otherwise a later unrelated edit could make it fall back below the
  // gravestone and vanish for good.
  for (const id of Object.keys(docs)) delete graves[id];

  return pruneGraves({ docs, graves }, now);
}

function mergeDoc(mine: Doc, theirs: Doc): Doc {
  // Ties go to the local side. On an exact tie both sides hold the same edit
  // anyway, and preferring local keeps object identity for a no-op merge.
  const title = wins(theirs.titleEdited, mine.titleEdited) ? theirs : mine;
  const position = wins(theirs.moved, mine.moved) ? theirs : mine;
  const graves = mergeGraves(mine.graves, theirs.graves);
  const nodes: Record<Id, Node> = {};

  for (const id of union(mine.nodes, theirs.nodes)) {
    const a = mine.nodes[id];
    const b = theirs.nodes[id];
    const node = a && b ? mergeNode(a, b) : a ?? b;
    if (buried(graves[id], node.edited, node.moved)) continue;
    nodes[id] = node;
  }

  // Anything that outlived its gravestone is no longer dead.
  for (const id of Object.keys(graves)) if (nodes[id]) delete graves[id];

  const merged = settle({
    id: mine.id,
    rootId: mine.rootId,
    title: title.title,
    kind: title.kind,
    query: title.query,
    bookmarked: title.bookmarked,
    deleted: title.deleted,
    titleEdited: title.titleEdited,
    sort: position.sort,
    parent: position.parent,
    moved: position.moved,
    nodes,
    graves
  });
  return same(mine, merged) ? mine : merged;
}

function mergeNode(a: Node, b: Node): Node {
  const content = wins(b.edited, a.edited) ? b : a;
  const position = wins(b.moved, a.moved) ? b : a;
  // A node was created once. Whichever side remembers that happening earlier
  // is the one telling the truth, so this is a minimum rather than a race.
  const created = a.created.at <= b.created.at ? a.created : b.created;

  // Keeping the original object when one side wins outright is what lets an
  // unchanged document come back from a merge as the very same object.
  if (content === position && created === content.created) return content;
  return {
    ...content,
    parent: position.parent,
    sort: position.sort,
    moved: position.moved,
    created,
    children: content.children
  };
}

/** Makes a document structurally valid and its sibling order canonical. */
function settle(doc: Doc): Doc {
  return rebuildChildren(repair(doc));
}

function normalise(payload: SyncPayload, now: number): SyncPayload {
  const docs: Record<Id, Doc> = {};
  for (const [id, doc] of Object.entries(payload.docs)) docs[id] = settle(doc);
  return pruneGraves({ docs, graves: payload.graves }, now);
}

/**
 * Makes a merged node set structurally valid again: every node reachable from
 * the root, no orphans, no cycles. Two devices can each move a row under the
 * other's row; the result would otherwise be a detached ring.
 */
function repair(doc: Doc): Doc {
  if (!doc.nodes[doc.rootId]) return doc;
  let nodes = doc.nodes;
  const replace = (id: Id, node: Node) => {
    if (nodes === doc.nodes) nodes = { ...doc.nodes };
    nodes[id] = node;
  };
  if (nodes[doc.rootId].parent !== null) replace(doc.rootId, { ...nodes[doc.rootId], parent: null });

  // Sorted so both devices break the same cycle the same way.
  for (const id of Object.keys(doc.nodes).sort()) {
    if (id === doc.rootId) continue;

    let cursor = nodes[id].parent;
    const seen = new Set<Id>([id]);
    while (cursor && nodes[cursor] && cursor !== doc.rootId && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = nodes[cursor].parent;
    }
    // Reached the root: this node is fine. Anything else is an orphan or a loop.
    if (cursor === doc.rootId) continue;
    replace(id, { ...nodes[id], parent: doc.rootId });
  }
  return nodes === doc.nodes ? doc : { ...doc, nodes };
}

/** True when nobody has typed into this workspace yet. */
function isUntouched(payload: SyncPayload): boolean {
  const docs = Object.values(payload.docs);
  if (docs.length !== 1 || Object.keys(payload.graves).length > 0) return false;
  const [doc] = docs;
  return (
    doc.title === "Inbox" &&
    doc.kind === "doc" &&
    doc.deleted === null &&
    Object.keys(doc.graves).length === 0 &&
    Object.values(doc.nodes).every(
      (node) =>
        node.text === "" &&
        node.note === "" &&
        !node.done &&
        !node.collapsed &&
        node.heading === 0 &&
        node.color === 0 &&
        !node.quote &&
        !node.checklist &&
        !node.numbered &&
        !node.bookmarked
    )
  );
}

/* ------------------------------------------------------------------ */

function same(mine: Doc, merged: Doc): boolean {
  if (
    mine.title !== merged.title ||
    mine.sort !== merged.sort ||
    mine.parent !== merged.parent ||
    mine.kind !== merged.kind ||
    mine.query !== merged.query ||
    mine.bookmarked !== merged.bookmarked ||
    mine.deleted !== merged.deleted ||
    mine.titleEdited !== merged.titleEdited ||
    mine.moved !== merged.moved ||
    Object.keys(mine.nodes).length !== Object.keys(merged.nodes).length ||
    Object.keys(mine.graves).length !== Object.keys(merged.graves).length
  ) {
    return false;
  }
  for (const [id, node] of Object.entries(merged.nodes)) if (mine.nodes[id] !== node) return false;
  for (const id of Object.keys(merged.graves)) if (!mine.graves[id]) return false;
  return true;
}

function mergeGraves(mine: Record<Id, Stamp>, theirs: Record<Id, Stamp>): Record<Id, Stamp> {
  const graves = { ...mine };
  for (const [id, grave] of Object.entries(theirs)) {
    if (!graves[id] || wins(grave, graves[id])) graves[id] = grave;
  }
  return graves;
}

/** A gravestone holds unless something touched the item after it was buried. */
function buried(grave: Stamp | undefined, ...touches: Stamp[]): boolean {
  return grave !== undefined && !touches.some((touch) => wins(touch, grave));
}

/** The most recent stamp anywhere in a document, used against its gravestone. */
function newestStamp(doc: Doc): Stamp {
  let newest = wins(doc.titleEdited, doc.moved) ? doc.titleEdited : doc.moved;
  for (const node of Object.values(doc.nodes)) {
    if (wins(node.edited, newest)) newest = node.edited;
    if (wins(node.moved, newest)) newest = node.moved;
  }
  return newest;
}

function union(a: Record<Id, unknown>, b: Record<Id, unknown>): Id[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

function observeStamps(payload: SyncPayload): void {
  for (const grave of Object.values(payload.graves)) observe(grave.at);
  for (const doc of Object.values(payload.docs)) {
    observe(doc.titleEdited.at);
    observe(doc.moved.at);
    for (const grave of Object.values(doc.graves)) observe(grave.at);
    for (const node of Object.values(doc.nodes)) {
      observe(node.edited.at);
      observe(node.moved.at);
    }
    // `created` is deliberately not observed: it is the oldest stamp in the
    // payload, so it can only drag the logical clock backwards.
  }
}

/**
 * Forgets gravestones older than the window, so they cannot accumulate for the
 * life of the workspace. This runs on the merged result rather than only on
 * what gets uploaded — if one device forgot a gravestone and another still had
 * it, the two would disagree about that row forever. The cost is that a device
 * offline for longer than the window can bring a deleted row back.
 */
export function pruneGraves(payload: SyncPayload, now: number): SyncPayload {
  const keep = (graves: Record<Id, Stamp>) => {
    const stale = Object.keys(graves).some((id) => now - graves[id].at >= GRAVE_TTL_MS);
    if (!stale) return graves;
    return Object.fromEntries(Object.entries(graves).filter(([, grave]) => now - grave.at < GRAVE_TTL_MS));
  };

  const docs: Record<Id, Doc> = {};
  const graves = { ...payload.graves };
  for (const [id, doc] of Object.entries(payload.docs)) {
    // A document that has sat in the trash longer than the window becomes a
    // real delete, on the same schedule and by the same rule everywhere — so
    // no two devices disagree about whether it is still restorable.
    if (doc.deleted && now - doc.deleted.at >= GRAVE_TTL_MS) {
      // Stamped now, not when it was binned: a gravestone dated a month ago
      // would be forgotten by the very next line, and a device that still has
      // the file would then put the document back.
      graves[id] = { at: now, by: doc.deleted.by };
      continue;
    }
    const kept = keep(doc.graves);
    docs[id] = kept === doc.graves ? doc : { ...doc, graves: kept };
  }
  return { docs, graves: keep(graves) };
}

/** True when the merge adopted anything the local side did not already have. */
export function changedBy(local: SyncPayload, merged: SyncPayload): boolean {
  const ids = union(local.docs, merged.docs);
  return ids.some((id) => local.docs[id] !== merged.docs[id]);
}
