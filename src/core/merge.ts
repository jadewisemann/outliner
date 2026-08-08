import { observe, wins } from "./clock";
import { rebuildChildren } from "./tree";
import type { Doc, Id, Node, Stamp, SyncPayload } from "./types";

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
 */
export function mergeWorkspace(local: SyncPayload, remote: SyncPayload): SyncPayload {
  observeStamps(remote);

  // A device signing in for the first time adopts what is already there rather
  // than contributing its untouched starter document.
  if (isUntouched(local) && Object.keys(remote.docs).length > 0) return remote;

  const graves = mergeGraves(local.graves, remote.graves);
  const docs: Record<Id, Doc> = {};

  for (const id of union(local.docs, remote.docs)) {
    const mine = local.docs[id];
    const theirs = remote.docs[id];
    const doc = mine && theirs ? mergeDoc(mine, theirs) : mine ?? theirs;
    if (buried(graves[id], [doc.titleEdited, doc.moved, ...lastTouched(doc)])) continue;
    docs[id] = doc;
  }

  // A workspace with no documents left is not a state the app can show.
  if (Object.keys(docs).length === 0) {
    const fallback = Object.values(local.docs)[0] ?? Object.values(remote.docs)[0];
    if (fallback) {
      docs[fallback.id] = fallback;
      delete graves[fallback.id];
    }
  }
  return { docs, graves };
}

/** True for a workspace nobody has typed into yet. */
function isUntouched(payload: SyncPayload): boolean {
  const docs = Object.values(payload.docs);
  if (docs.length !== 1 || Object.keys(payload.graves).length > 0) return false;
  const [doc] = docs;
  return (
    Object.keys(doc.graves).length === 0 &&
    Object.values(doc.nodes).every((node) => node.text === "" && node.note === "")
  );
}

function mergeDoc(mine: Doc, theirs: Doc): Doc {
  const title = wins(mine.titleEdited, theirs.titleEdited) ? mine : theirs;
  const position = wins(mine.moved, theirs.moved) ? mine : theirs;
  const graves = mergeGraves(mine.graves, theirs.graves);
  const nodes: Record<Id, Node> = {};

  for (const id of union(mine.nodes, theirs.nodes)) {
    const a = mine.nodes[id];
    const b = theirs.nodes[id];
    const node = a && b ? mergeNode(a, b) : { ...(a ?? b), children: [] };
    if (buried(graves[id], [node.edited, node.moved])) continue;
    nodes[id] = node;
  }

  // Anything that outlived its gravestone is no longer dead.
  for (const id of Object.keys(graves)) if (nodes[id]) delete graves[id];

  return rebuildChildren(
    repair({
      id: mine.id,
      rootId: mine.rootId,
      title: title.title,
      titleEdited: title.titleEdited,
      sort: position.sort,
      moved: position.moved,
      nodes,
      graves
    })
  );
}

function mergeNode(a: Node, b: Node): Node {
  const content = wins(a.edited, b.edited) ? a : b;
  const position = wins(a.moved, b.moved) ? a : b;
  return {
    id: a.id,
    text: content.text,
    note: content.note,
    collapsed: content.collapsed,
    done: content.done,
    heading: content.heading,
    edited: content.edited,
    parent: position.parent,
    sort: position.sort,
    moved: position.moved,
    children: []
  };
}

/**
 * Makes a merged node set structurally valid again: every node reachable from
 * the root, no orphans, no cycles. Two devices can each move a row under the
 * other's row; the result would otherwise be a detached ring.
 */
function repair(doc: Doc): Doc {
  const nodes = { ...doc.nodes };
  if (!nodes[doc.rootId]) return doc;
  nodes[doc.rootId] = { ...nodes[doc.rootId], parent: null };

  for (const id of Object.keys(nodes)) {
    if (id === doc.rootId) continue;

    let cursor = nodes[id].parent;
    const seen = new Set<Id>([id]);
    while (cursor && nodes[cursor] && cursor !== doc.rootId && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = nodes[cursor].parent;
    }
    // Reached the root: this node is fine. Anything else is an orphan or a loop.
    if (cursor === doc.rootId) continue;
    nodes[id] = { ...nodes[id], parent: doc.rootId };
  }
  return { ...doc, nodes };
}

/* ------------------------------------------------------------------ */

function mergeGraves(mine: Record<Id, Stamp>, theirs: Record<Id, Stamp>): Record<Id, Stamp> {
  const graves = { ...mine };
  for (const [id, grave] of Object.entries(theirs)) {
    if (!graves[id] || wins(grave, graves[id])) graves[id] = grave;
  }
  return graves;
}

/** A gravestone holds unless something touched the item after it was buried. */
function buried(grave: Stamp | undefined, touches: Stamp[]): boolean {
  return grave !== undefined && !touches.some((touch) => touch.at > grave.at);
}

function lastTouched(doc: Doc): Stamp[] {
  let newest: Stamp = doc.titleEdited;
  for (const node of Object.values(doc.nodes)) {
    if (node.edited.at > newest.at) newest = node.edited;
    if (node.moved.at > newest.at) newest = node.moved;
  }
  return [newest];
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
  }
}

/** Drops gravestones older than `maxAgeMs` so they do not accumulate forever. */
export function pruneGraves(payload: SyncPayload, now: number, maxAgeMs = 30 * 24 * 60 * 60 * 1000): SyncPayload {
  const keep = (graves: Record<Id, Stamp>) =>
    Object.fromEntries(Object.entries(graves).filter(([, grave]) => now - grave.at < maxAgeMs));

  return {
    graves: keep(payload.graves),
    docs: Object.fromEntries(
      Object.entries(payload.docs).map(([id, doc]) => [id, { ...doc, graves: keep(doc.graves) }])
    )
  };
}
