import { keyBetween, keysAfter } from "../shared/order";
import { makeNode, stamp, type Doc, type Id, type Node, type Row, type Stamp } from "../types";

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

export function parentOf(doc: Doc, id: Id): Id | null {
  return doc.nodes[id]?.parent ?? null;
}

/** Root-first chain of ancestors, excluding `id` itself. */
export function ancestors(doc: Doc, id: Id): Id[] {
  const chain: Id[] = [];
  let cursor = parentOf(doc, id);
  while (cursor && !chain.includes(cursor)) {
    chain.unshift(cursor);
    cursor = parentOf(doc, cursor);
  }
  return chain;
}

/** `id` and every descendant, in document order. */
export function subtree(doc: Doc, id: Id): Id[] {
  const out: Id[] = [];
  const seen = new Set<Id>();
  const walk = (current: Id) => {
    if (seen.has(current)) return;
    seen.add(current);
    out.push(current);
    for (const child of doc.nodes[current]?.children ?? []) walk(child);
  };
  walk(id);
  return out;
}

export type RowFilter = {
  /** Rows that fail this, and have no matching descendant, are hidden. */
  match?: (node: Node) => boolean;
  hideCompleted?: boolean;
};

/**
 * Flattened rows under `zoomId`, skipping children of collapsed nodes.
 *
 * With a `match` the outline becomes a filtered view of itself: matching rows
 * and the ancestors that place them, still editable where they sit. Collapse
 * is ignored while filtering — a result hidden inside a folded parent is a
 * result the reader was told about and cannot see.
 */
export function visibleRows(doc: Doc, zoomId: Id, filter: RowFilter = {}): Row[] {
  const rows: Row[] = [];
  const keep = filter.match ? keepSet(doc, zoomId, filter.match) : null;
  // This runs during render, so a cycle in corrupt data must degrade to a
  // truncated outline rather than an infinite loop and a blank screen.
  const seen = new Set<Id>();
  const walk = (parentId: Id, depth: number) => {
    const parent = doc.nodes[parentId];
    if (!parent || seen.has(parentId)) return;
    seen.add(parentId);
    const { checklist, numbered } = parent;
    parent.children.forEach((id, index) => {
      const node = doc.nodes[id];
      if (!node || seen.has(id)) return;
      // Hiding what is done hides its subtree too: a finished item's children
      // are part of the finished item.
      if (filter.hideCompleted && node.done) return;
      if (keep && !keep.has(id)) return;
      // A row inherits its checkbox and its number from the list it is in, but
      // a row that is already ticked keeps its box whatever the list says —
      // otherwise turning a checklist off would silently hide the ticks.
      rows.push({ id, node, depth, index, parentId, checklist: checklist || node.done, numbered });
      if (!node.collapsed || keep) walk(id, depth + 1);
    });
  };
  walk(zoomId, 0);
  return rows;
}

/** Matching nodes, plus every ancestor that places them under the zoom root. */
function keepSet(doc: Doc, zoomId: Id, match: (node: Node) => boolean): Set<Id> {
  const keep = new Set<Id>();
  for (const id of subtree(doc, zoomId)) {
    const node = doc.nodes[id];
    if (id === zoomId || !node || !match(node)) continue;
    keep.add(id);
    for (const ancestor of ancestors(doc, id)) {
      if (ancestor !== zoomId) keep.add(ancestor);
    }
  }
  return keep;
}

export function rowBefore(rows: Row[], id: Id): Row | null {
  const at = rows.findIndex((row) => row.id === id);
  return at > 0 ? rows[at - 1] : null;
}

export function rowAfter(rows: Row[], id: Id): Row | null {
  const at = rows.findIndex((row) => row.id === id);
  return at >= 0 && at < rows.length - 1 ? rows[at + 1] : null;
}

/* ------------------------------------------------------------------ */
/* writing primitives                                                  */
/* ------------------------------------------------------------------ */

type Nodes = Record<Id, Node>;

function withNodes(doc: Doc, nodes: Nodes): Doc {
  return { ...doc, nodes };
}

/** Copy-on-write update of a node's content, stamping it for merges. */
export function patchNode(doc: Doc, id: Id, patch: Partial<Node>): Doc {
  const node = doc.nodes[id];
  if (!node) return doc;
  return withNodes(doc, { ...doc.nodes, [id]: { ...node, ...patch, edited: stamp() } });
}

/**
 * The primitives below mutate a *draft*: a shallow copy of `doc.nodes` that the
 * caller owns and nobody else can see yet. Individual nodes are still replaced
 * rather than modified, so React's identity checks keep working.
 *
 * This matters for bulk work. Copying the whole node map inside every step
 * would make pasting a 10,000-line outline quadratic; one copy per operation
 * keeps it linear.
 */
function draft(doc: Doc): Nodes {
  return { ...doc.nodes };
}

function setChildren(nodes: Nodes, parentId: Id, children: Id[]): void {
  const parent = nodes[parentId];
  if (parent) nodes[parentId] = { ...parent, children };
}

/** Removes `id` from its parent's child list, leaving the node itself alone. */
function detach(nodes: Nodes, id: Id): { parentId: Id | null; index: number } {
  const parentId = nodes[id]?.parent ?? null;
  const parent = parentId ? nodes[parentId] : null;
  if (!parentId || !parent) return { parentId: null, index: -1 };
  const index = parent.children.indexOf(id);
  if (index !== -1) setChildren(nodes, parentId, parent.children.toSpliced(index, 1));
  return { parentId, index };
}

/**
 * Puts `id` under `parentId` at `index`, deriving the sort key from the
 * neighbours it lands between. This is the only place position is assigned, so
 * `children` order and `sort` order can never drift apart.
 */
function place(nodes: Nodes, parentId: Id, id: Id, index: number): void {
  const parent = nodes[parentId];
  const node = nodes[id];
  if (!parent || !node) return;

  const siblings = parent.children;
  const at = Math.max(0, Math.min(index, siblings.length));
  const before = at > 0 ? nodes[siblings[at - 1]]?.sort ?? null : null;
  let after = at < siblings.length ? nodes[siblings[at]]?.sort ?? null : null;
  // `rebuildChildren` normalises ties, but a key pair that is somehow still
  // out of order must not throw in the middle of a keystroke.
  if (before !== null && after !== null && before >= after) after = null;

  nodes[id] = { ...node, parent: parentId, sort: keyBetween(before, after), moved: stamp() };
  setChildren(nodes, parentId, siblings.toSpliced(at, 0, id));
}

/** Moves an existing node to `index` under `parentId`. */
function move(nodes: Nodes, id: Id, parentId: Id, index: number): void {
  if (!nodes[id] || !nodes[parentId]) return;
  const from = detach(nodes, id);
  const shift = from.parentId === parentId && from.index !== -1 && from.index < index ? 1 : 0;
  place(nodes, parentId, id, index - shift);
}

/** Adds a brand new node under `parentId` at `index`. */
function insert(nodes: Nodes, parentId: Id, node: Node, index: number): void {
  if (!nodes[parentId]) return;
  nodes[node.id] = node;
  place(nodes, parentId, node.id, index);
}

/**
 * Fills in `parent`/`sort` from existing `children` lists — the inverse of
 * `rebuildChildren`, for trees built by an importer or an older schema.
 */
export function linkChildren(doc: Doc): Doc {
  const nodes = draft(doc);
  if (!nodes[doc.rootId]) return doc;
  nodes[doc.rootId] = { ...nodes[doc.rootId], parent: null };

  const walk = (id: Id) => {
    const children = nodes[id].children.filter((child) => nodes[child]);
    const sorts = keysAfter(null, children.length);
    nodes[id] = { ...nodes[id], children };
    children.forEach((child, index) => {
      nodes[child] = { ...nodes[child], parent: id, sort: sorts[index] };
      walk(child);
    });
  };
  walk(doc.rootId);
  return withNodes(doc, nodes);
}

/** Rebuilds every `children` list from `parent`/`sort`. Used after a merge. */
export function rebuildChildren(doc: Doc): Doc {
  const buckets = new Map<Id, Node[]>();
  for (const node of Object.values(doc.nodes)) {
    if (!node.parent) continue;
    const bucket = buckets.get(node.parent);
    if (bucket) bucket.push(node);
    else buckets.set(node.parent, [node]);
  }

  const nodes: Nodes = {};
  const rekeyed = new Map<Id, string>();

  for (const node of Object.values(doc.nodes)) {
    const bucket = (buckets.get(node.id) ?? []).sort(bySort);

    // Two devices inserting at the same slot derive the same key from the same
    // neighbours, so a merge can produce ties. Left alone they would make
    // `keyBetween` reject its own bounds on the next edit at that spot. The
    // repair is deterministic, so every device lands on the same keys.
    let previous: string | null = null;
    for (const child of bucket) {
      const sort: string = previous !== null && child.sort <= previous ? keyBetween(previous, null) : child.sort;
      if (sort !== child.sort) rekeyed.set(child.id, sort);
      previous = sort;
    }
    const children = bucket.map((child) => child.id);
    // Reusing the object when the order is unchanged is what lets a no-op
    // merge come back reference-identical, so React can skip the render.
    nodes[node.id] = sameOrder(node.children, children) ? node : { ...node, children };
  }
  for (const [id, sort] of rekeyed) nodes[id] = { ...nodes[id], sort };
  return rekeyed.size === 0 && Object.values(nodes).every((node) => node === doc.nodes[node.id])
    ? doc
    : withNodes(doc, nodes);
}

function sameOrder(a: Id[], b: Id[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Position order for siblings; the id keeps ties stable across devices. */
function bySort(a: { sort: string; id: Id }, b: { sort: string; id: Id }): number {
  if (a.sort !== b.sort) return a.sort < b.sort ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* single-row steps, shared by the one-shot and bulk versions           */
/* ------------------------------------------------------------------ */

function indentInto(nodes: Nodes, id: Id): void {
  const parentId = nodes[id]?.parent;
  if (!parentId) return;
  const siblings = nodes[parentId].children;
  const index = siblings.indexOf(id);
  if (index <= 0) return;

  const newParentId = siblings[index - 1];
  move(nodes, id, newParentId, nodes[newParentId].children.length);
  nodes[newParentId] = { ...nodes[newParentId], collapsed: false };
}

function outdentInto(nodes: Nodes, id: Id, zoomId: Id): void {
  const parentId = nodes[id]?.parent;
  if (!parentId || parentId === zoomId) return;
  const grandparentId = nodes[parentId].parent;
  if (!grandparentId) return;
  move(nodes, id, grandparentId, nodes[grandparentId].children.indexOf(parentId) + 1);
}

/** A place to insert at, expressed so that the row currently there is pushed down. */
type Slot = { parentId: Id; index: number };

/** The deepest row drawn under `id`, which is the row just above whatever follows it. */
function lastDrawn(nodes: Nodes, id: Id): Id {
  let cursor = id;
  const seen = new Set<Id>();
  while (!seen.has(cursor)) {
    seen.add(cursor);
    const node = nodes[cursor];
    if (!node || node.collapsed || node.children.length === 0) return cursor;
    cursor = node.children[node.children.length - 1];
  }
  return cursor;
}

/** The row drawn immediately above `id`, or null when `id` is the first row of the zoom. */
function rowAbove(nodes: Nodes, zoomId: Id, id: Id): Id | null {
  const parentId = nodes[id]?.parent;
  if (!parentId) return null;
  const index = nodes[parentId].children.indexOf(id);
  if (index > 0) return lastDrawn(nodes, nodes[parentId].children[index - 1]);
  return parentId === zoomId ? null : parentId;
}

/** The row drawn immediately below everything `id` contains, or null at the end of the zoom. */
function rowAfterSubtree(nodes: Nodes, zoomId: Id, id: Id): Id | null {
  let cursor: Id | null = id;
  const seen = new Set<Id>();
  while (cursor && cursor !== zoomId && !seen.has(cursor)) {
    seen.add(cursor);
    const parentId: Id | null = nodes[cursor].parent;
    const siblings = parentId ? nodes[parentId]?.children : null;
    if (!parentId || !siblings) return null;
    const index = siblings.indexOf(cursor);
    if (index !== -1 && index + 1 < siblings.length) return siblings[index + 1];
    cursor = parentId;
  }
  return null;
}

/** The slot `id` occupies, so that inserting there lands directly above it. */
function slotOf(nodes: Nodes, id: Id): Slot | null {
  const parentId = nodes[id]?.parent;
  if (!parentId) return null;
  return { parentId, index: nodes[parentId].children.indexOf(id) };
}

/**
 * Where `id` lands when it steps one drawn row up or down.
 *
 * Vertical movement follows the outline as it is drawn rather than the sibling
 * list, so a row that steps past a parent boundary takes the level of whatever
 * it lands beside: stepping down in front of an expanded row means becoming its
 * first child, and stepping up out of a first child means landing above the
 * parent. One press is always one row, which is what makes the key usable for
 * carrying an item across the document instead of only within one list.
 *
 * Null means the step would leave the zoom, which is the only wall left.
 */
function stepSlot(nodes: Nodes, zoomId: Id, id: Id, direction: -1 | 1): Slot | null {
  if (!nodes[id]) return null;
  if (direction === -1) {
    const above = rowAbove(nodes, zoomId, id);
    return above ? slotOf(nodes, above) : null;
  }

  // Landing below `passed` means taking the slot of the row drawn below it; the
  // row's own children come first, and with nothing below it the end of its list.
  const passed = rowAfterSubtree(nodes, zoomId, id);
  if (!passed) return null;
  const node = nodes[passed];
  if (!node.collapsed && node.children.length > 0) return slotOf(nodes, node.children[0]);
  const below = rowAfterSubtree(nodes, zoomId, passed);
  if (below) return slotOf(nodes, below);
  const slot = slotOf(nodes, passed);
  return slot && { parentId: slot.parentId, index: slot.index + 1 };
}

function moveVerticallyInto(nodes: Nodes, zoomId: Id, id: Id, direction: -1 | 1): void {
  const slot = stepSlot(nodes, zoomId, id, direction);
  if (slot) move(nodes, id, slot.parentId, slot.index);
}

function removeInto(nodes: Nodes, graves: Record<Id, Stamp>, id: Id): void {
  const doomed: Id[] = [];
  const walk = (current: Id) => {
    doomed.push(current);
    for (const child of nodes[current]?.children ?? []) walk(child);
  };
  walk(id);

  detach(nodes, id);
  const now = stamp();
  for (const dead of doomed) {
    delete nodes[dead];
    graves[dead] = now;
  }
}

/* ------------------------------------------------------------------ */
/* structural edits                                                    */
/* ------------------------------------------------------------------ */

export type Edit = { doc: Doc; focusId?: Id; caret?: number };

/** Inserts a fresh sibling directly after `id`, or as its first child when expanded. */
export function insertAfter(doc: Doc, id: Id, text = ""): Edit {
  const node = doc.nodes[id];
  if (!node) return { doc };
  const fresh = makeNode({ text });
  const nodes = draft(doc);

  // A node with visible children gets the new row as its first child, matching
  // where the eye expects the next line to land.
  if (node.children.length > 0 && !node.collapsed) {
    insert(nodes, id, fresh, 0);
  } else {
    const parentId = node.parent;
    if (!parentId) return { doc };
    insert(nodes, parentId, fresh, doc.nodes[parentId].children.indexOf(id) + 1);
  }
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
}

/** Splits `id` at `offset`: the tail becomes a new row that keeps the children. */
export function splitAt(doc: Doc, id: Id, offset: number): Edit {
  const node = doc.nodes[id];
  if (!node) return { doc };
  const tail = node.text.slice(offset);
  if (tail === "") return insertAfter(patchNode(doc, id, { text: node.text.slice(0, offset) }), id, "");

  const parentId = node.parent;
  if (!parentId) return { doc };

  // At offset 0 the whole line moves to the tail. Reusing the original id for
  // the tail would leave the original id holding an empty row, so a merge
  // could resolve another device's text back into the blank one.
  if (offset <= 0) {
    const nodes = draft(doc);
    insert(nodes, parentId, makeNode(), doc.nodes[parentId].children.indexOf(id));
    return { doc: withNodes(doc, nodes), focusId: id, caret: 0 };
  }

  const fresh = makeNode({ text: tail });

  // Hand the children over before placing, so both lists stay consistent.
  const nodes = draft(doc);
  nodes[id] = { ...node, text: node.text.slice(0, offset), children: [], edited: stamp() };
  nodes[fresh.id] = { ...fresh, children: node.children };
  for (const child of node.children) nodes[child] = { ...nodes[child], parent: fresh.id, moved: stamp() };

  place(nodes, parentId, fresh.id, doc.nodes[parentId].children.indexOf(id) + 1);
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
}

/** Backspace at offset 0: joins this row into the one visually above it. */
export function mergeIntoPrevious(doc: Doc, zoomId: Id, id: Id): Edit {
  const rows = visibleRows(doc, zoomId);
  const previous = rowBefore(rows, id);
  const node = doc.nodes[id];
  const parentId = node?.parent;
  if (!previous || !node || !parentId) return { doc };

  const caret = previous.node.text.length;
  const index = doc.nodes[parentId].children.indexOf(id);
  const nodes = draft(doc);
  detach(nodes, id);

  // First child merging into its own parent leaves the orphans where they were;
  // otherwise they belong under the row that absorbed the text.
  const [newParent, newIndex] =
    previous.id === parentId ? [parentId, index] : [previous.id, nodes[previous.id].children.length];
  node.children.forEach((child, offset) => place(nodes, newParent, child, newIndex + offset));
  if (previous.id !== parentId) nodes[previous.id] = { ...nodes[previous.id], collapsed: false };

  const merged = nodes[previous.id];
  const note = [merged.note, node.note].filter(Boolean).join("\n");
  nodes[previous.id] = { ...merged, text: merged.text + node.text, note, edited: stamp() };
  delete nodes[id];
  return { doc: { ...doc, nodes, graves: { ...doc.graves, [id]: stamp() } }, focusId: previous.id, caret };
}

/** Makes `id` the last child of its previous sibling. */
export function indent(doc: Doc, id: Id): Edit {
  const parentId = doc.nodes[id]?.parent;
  if (!parentId) return { doc };
  const siblings = doc.nodes[parentId].children;
  const index = siblings.indexOf(id);
  if (index <= 0) return { doc };

  const nodes = draft(doc);
  indentInto(nodes, id);
  return { doc: withNodes(doc, nodes), focusId: id };
}

/** Makes `id` the next sibling of its parent. No-op at the zoom root's top level. */
export function outdent(doc: Doc, id: Id, zoomId: Id): Edit {
  const parentId = doc.nodes[id]?.parent;
  if (!parentId || parentId === zoomId) return { doc };
  const grandparentId = doc.nodes[parentId].parent;
  if (!grandparentId) return { doc };

  const nodes = draft(doc);
  outdentInto(nodes, id, zoomId);
  return { doc: withNodes(doc, nodes), focusId: id };
}

/**
 * Steps `id` one drawn row up or down, carrying its subtree and taking the
 * level of the place it lands. No-op at the first and last row of the zoom.
 */
export function moveVertically(doc: Doc, id: Id, direction: -1 | 1, zoomId: Id): Edit {
  if (!stepSlot(doc.nodes, zoomId, id, direction)) return { doc };
  const nodes = draft(doc);
  moveVerticallyInto(nodes, zoomId, id, direction);
  return { doc: withNodes(doc, nodes), focusId: id };
}

/**
 * Copies a row and everything under it, directly below the original.
 *
 * The copies are new nodes with new ids and fresh stamps — a duplicate is a
 * thing that has just come into existence, not a second claim on the original.
 * A bookmark is not copied for the same reason: it points at one row.
 */
export function duplicate(doc: Doc, id: Id): Edit {
  const node = doc.nodes[id];
  const parentId = node?.parent;
  if (!node || !parentId) return { doc };

  const nodes = draft(doc);
  const copy = (sourceId: Id, ownerId: Id, index: number): Id => {
    const source = doc.nodes[sourceId];
    const fresh = makeNode({
      text: source.text,
      note: source.note,
      collapsed: source.collapsed,
      done: source.done,
      heading: source.heading,
      checklist: source.checklist,
      numbered: source.numbered,
      color: source.color
    });
    insert(nodes, ownerId, fresh, index);
    source.children.forEach((child, at) => copy(child, fresh.id, at));
    return fresh.id;
  };

  const at = doc.nodes[parentId].children.indexOf(id) + 1;
  return { doc: withNodes(doc, nodes), focusId: copy(id, parentId, at), caret: node.text.length };
}

/* ------------------------------------------------------------------ */
/* across documents                                                     */
/* ------------------------------------------------------------------ */

/**
 * Lifts a row and its descendants out of a document, leaving gravestones.
 *
 * The nodes come back untouched so the caller can graft them elsewhere with
 * their ids intact — which is the whole point, since `((id))` links to any of
 * them have to keep working after the move.
 */
export function cutSubtree(doc: Doc, id: Id): { doc: Doc; taken: Node[] } | null {
  if (!doc.nodes[id] || id === doc.rootId) return null;
  const taken = subtree(doc, id).map((each) => doc.nodes[each]);

  const nodes = draft(doc);
  const graves = { ...doc.graves };
  removeInto(nodes, graves, id);
  return { doc: { ...doc, nodes, graves }, taken };
}

/**
 * Puts a lifted subtree at the end of `parentId`, keeping every id.
 *
 * Anything the destination had buried under those ids is forgiven: the rows
 * are demonstrably alive, and leaving the gravestone would make them vanish
 * again on the next merge.
 */
export function graftSubtree(doc: Doc, parentId: Id, taken: Node[]): Edit {
  const root = taken[0];
  if (!root || !doc.nodes[parentId]) return { doc };

  const now = stamp();
  const nodes = draft(doc);
  for (const node of taken) nodes[node.id] = { ...node, edited: now, moved: now };
  place(nodes, parentId, root.id, doc.nodes[parentId].children.length);

  const graves = { ...doc.graves };
  for (const node of taken) delete graves[node.id];
  return { doc: { ...doc, nodes, graves }, focusId: root.id };
}

/** Moves `id` (with subtree) to position `index` under `newParentId`. Used by drag & drop. */
export function reparent(doc: Doc, id: Id, newParentId: Id, index: number): Edit {
  if (id === newParentId || !doc.nodes[newParentId] || subtree(doc, id).includes(newParentId)) return { doc };
  const nodes = draft(doc);
  move(nodes, id, newParentId, index);
  if (nodes[newParentId]?.collapsed) nodes[newParentId] = { ...nodes[newParentId], collapsed: false };
  return { doc: withNodes(doc, nodes), focusId: id };
}

/* ------------------------------------------------------------------ */
/* zoom                                                                */
/* ------------------------------------------------------------------ */

/** Expands every ancestor so `id` is reachable from the document root. */
export function reveal(doc: Doc, id: Id): Doc {
  let nodes: Nodes | null = null;
  for (const ancestor of ancestors(doc, id)) {
    if (!doc.nodes[ancestor]?.collapsed) continue;
    nodes ??= draft(doc);
    nodes[ancestor] = { ...nodes[ancestor], collapsed: false };
  }
  return nodes ? withNodes(doc, nodes) : doc;
}

/** Adds an empty row at the end of `parentId`, or focuses the trailing empty one. */
export function appendChild(doc: Doc, parentId: Id): Edit {
  if (!doc.nodes[parentId]) return { doc };
  const children = doc.nodes[parentId].children;
  const last = children[children.length - 1];
  if (last && doc.nodes[last].text === "" && doc.nodes[last].children.length === 0) {
    return { doc, focusId: last, caret: 0 };
  }
  const fresh = makeNode();
  const nodes = draft(doc);
  insert(nodes, parentId, fresh, children.length);
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
}

/** A zoomed node always needs at least one child to type into. */
export function ensureEditable(doc: Doc, zoomId: Id): Edit {
  if (!doc.nodes[zoomId] || doc.nodes[zoomId].children.length > 0) return { doc };
  return appendChild(doc, zoomId);
}

/* ------------------------------------------------------------------ */
/* multi-row operations                                                */
/* ------------------------------------------------------------------ */

/**
 * Sorts `ids` into document order and drops any whose ancestor is also
 * selected — moving a parent already carries its children.
 */
export function topLevel(doc: Doc, zoomId: Id, ids: Id[]): Id[] {
  const selected = new Set(ids);
  return visibleRows(doc, zoomId)
    .map((row) => row.id)
    .filter((id) => selected.has(id) && !ancestors(doc, id).some((parent) => selected.has(parent)));
}

/** The row at `at` together with every row drawn under it. */
function subtreeRun(rows: Row[], at: number): Id[] {
  let end = at + 1;
  while (end < rows.length && rows[end].depth > rows[at].depth) end += 1;
  return rows.slice(at, end).map((row) => row.id);
}

/** Every row of the list that holds `at` at `depth`, the rows drawn under them included. */
function listRun(rows: Row[], at: number, depth: number): Id[] {
  let start = at;
  while (start > 0 && rows[start - 1].depth >= depth) start -= 1;
  let end = at + 1;
  while (end < rows.length && rows[end].depth >= depth) end += 1;
  return rows.slice(start, end).map((row) => row.id);
}

/**
 * One step up the selection ladder: the row alone, then the row with what hangs
 * under it, then the list it sits in, then the list that list sits in, and
 * finally everything drawn.
 *
 * A step that would not grow the selection is skipped, so a childless only
 * child does not cost three presses to climb out of. Returns `chosen` unchanged
 * once everything drawn is already held, which is what tells the caller to stop.
 */
export function widerScope(rows: Row[], chosen: Id[]): Id[] {
  const at = rows.findIndex((row) => row.id === chosen[0]);
  if (at === -1) return chosen;
  const grew = (candidate: Id[]) => {
    if (candidate.length <= chosen.length) return null;
    const inside = new Set(candidate);
    return chosen.every((id) => inside.has(id)) ? candidate : null;
  };

  const own = grew(subtreeRun(rows, at));
  if (own) return own;
  for (let depth = rows[at].depth; depth >= 0; depth -= 1) {
    const list = grew(listRun(rows, at, depth));
    if (list) return list;
  }
  return chosen;
}

/** Runs a single-row step over a whole selection against one shared draft. */
function bulk(doc: Doc, ids: Id[], reverse: boolean, step: (nodes: Nodes, id: Id) => void): Edit {
  if (ids.length === 0) return { doc };
  const nodes = draft(doc);
  for (const id of reverse ? [...ids].reverse() : ids) step(nodes, id);
  return { doc: withNodes(doc, nodes) };
}

export function bulkIndent(doc: Doc, zoomId: Id, ids: Id[]): Edit {
  return bulk(doc, topLevel(doc, zoomId, ids), false, indentInto);
}

export function bulkOutdent(doc: Doc, zoomId: Id, ids: Id[]): Edit {
  return bulk(doc, topLevel(doc, zoomId, ids), true, (nodes, id) => outdentInto(nodes, id, zoomId));
}

export function bulkMove(doc: Doc, zoomId: Id, ids: Id[], direction: -1 | 1): Edit {
  const ordered = topLevel(doc, zoomId, ids);
  // If any selected row is already at the wall the others would move through
  // it, quietly reordering the selection. Refuse the whole thing instead.
  if (ordered.some((id) => !stepSlot(doc.nodes, zoomId, id, direction))) return { doc };
  // Moving down starts from the bottom so rows do not step over each other.
  return bulk(doc, ordered, direction === 1, (nodes, id) => moveVerticallyInto(nodes, zoomId, id, direction));
}

export function bulkRemove(doc: Doc, zoomId: Id, ids: Id[]): Edit {
  const ordered = topLevel(doc, zoomId, ids);
  if (ordered.length === 0) return { doc };

  const rows = visibleRows(doc, zoomId);
  const doomed = new Set(ordered.flatMap((id) => subtree(doc, id)));
  const first = rows.findIndex((row) => row.id === ordered[0]);
  const survivor =
    [...rows.slice(0, first)].reverse().find((row) => !doomed.has(row.id)) ??
    rows.slice(first).find((row) => !doomed.has(row.id));

  const nodes = draft(doc);
  const graves = { ...doc.graves };
  for (const id of [...ordered].reverse()) removeInto(nodes, graves, id);
  const next: Doc = { ...doc, nodes, graves };

  const focusId = survivor && nodes[survivor.id] ? survivor.id : visibleRows(next, zoomId)[0]?.id;
  return { doc: next, focusId, caret: focusId ? nodes[focusId]?.text.length : 0 };
}

export function bulkSetCollapsed(doc: Doc, ids: Id[], collapsed: boolean): Edit {
  const now = stamp();
  let nodes: Nodes | null = null;
  for (const id of ids) {
    const node = (nodes ?? doc.nodes)[id];
    if (!node || node.children.length === 0 || node.collapsed === collapsed) continue;
    nodes ??= draft(doc);
    nodes[id] = { ...node, collapsed, edited: now };
  }
  return { doc: nodes ? withNodes(doc, nodes) : doc };
}

/**
 * One display patch across a whole selection, in a single draft.
 *
 * Structure is untouched — `parent`, `sort` and `children` are not in reach —
 * so this is for the display fields (colour, done, checklist) that a selection
 * gets given all at once.
 */
export function bulkPatch(doc: Doc, ids: Id[], patch: Partial<Node>): Edit {
  const now = stamp();
  let nodes: Nodes | null = null;
  for (const id of ids) {
    const node = (nodes ?? doc.nodes)[id];
    if (!node) continue;
    // Same-value writes are skipped so an unchanged selection stays the same
    // object, the way merge() and the render skip both expect (DESIGN 원칙 4).
    if ((Object.keys(patch) as (keyof Node)[]).every((field) => node[field] === patch[field])) continue;
    nodes ??= draft(doc);
    nodes[id] = { ...node, ...patch, edited: now };
  }
  return { doc: nodes ? withNodes(doc, nodes) : doc };
}

/** Collapses or expands every descendant of `fromId`. */
export function setCollapsedDeep(doc: Doc, fromId: Id, collapsed: boolean): Edit {
  return bulkSetCollapsed(doc, subtree(doc, fromId).filter((id) => id !== fromId), collapsed);
}

/* ------------------------------------------------------------------ */
/* plain-text in and out                                               */
/* ------------------------------------------------------------------ */

/**
 * Inserts indented plain text as a subtree after `afterId`.
 * Two spaces or one tab per level; blank lines are dropped.
 */
export function insertOutlineText(doc: Doc, afterId: Id, text: string): Edit {
  const lines = parseOutlineLines(text);
  const target = doc.nodes[afterId];
  const parentId = target?.parent;
  if (lines.length === 0 || !parentId) return { doc };

  const nodes = draft(doc);
  const stack: { depth: number; id: Id }[] = [];
  let index = doc.nodes[parentId].children.indexOf(afterId) + 1;
  let lastId = afterId;

  for (const { depth, patch } of lines) {
    const fresh = makeNode(patch);

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const owner = stack[stack.length - 1];
    if (owner) {
      insert(nodes, owner.id, fresh, nodes[owner.id].children.length);
    } else {
      insert(nodes, parentId, fresh, index);
      index += 1;
    }
    stack.push({ depth, id: fresh.id });
    lastId = fresh.id;
  }

  // Pasting into an empty row replaces it rather than leaving a blank behind.
  let graves = doc.graves;
  if (target.text === "" && target.children.length === 0) {
    detach(nodes, afterId);
    delete nodes[afterId];
    graves = { ...graves, [afterId]: stamp() };
  }
  return { doc: { ...doc, nodes, graves }, focusId: lastId, caret: nodes[lastId].text.length };
}

/** Serializes a subtree as indented plain text, for the clipboard and exports. */
export function toOutlineText(doc: Doc, ids: Id[]): string {
  const lines: string[] = [];
  const walk = (id: Id, depth: number) => {
    const node = doc.nodes[id];
    if (!node) return;
    lines.push(`${"  ".repeat(depth)}${node.text}`);
    if (node.note) {
      for (const line of node.note.split("\n")) lines.push(`${"  ".repeat(depth + 1)}${line}`);
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const id of ids) walk(id, 0);
  return lines.join("\n");
}

/**
 * Reads indented outline text into depths and node fields — the single
 * definition of the text format, shared by paste and by file import.
 *
 * Blank lines are dropped and depth is measured from the shallowest line, so a
 * nested block copied out of another editor keeps its structure.
 */
export function parseOutlineLines(text: string): { depth: number; patch: Partial<Node> }[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const indents = lines.map((line) => (line.match(/^[\t ]*/)?.[0] ?? "").replace(/\t/g, "  ").length);
  const base = Math.min(...indents);
  return lines.map((line, at) => ({ depth: (indents[at] - base) >> 1, patch: parseOutlineLine(line.trim()) }));
}

/**
 * Reads one line: an optional bullet, then an optional `[ ]`/`[x]` checkbox,
 * then up to three leading `#` for a heading.
 */
function parseOutlineLine(line: string): Partial<Node> {
  let text = line.replace(/^(?:[-*+]|\d+[.)])\s+/, "");
  let done = false;
  let heading: Node["heading"] = 0;

  const box = text.match(/^\[([ xX])\]\s+/);
  if (box) {
    done = box[1].toLowerCase() === "x";
    text = text.slice(box[0].length);
  }
  const hashes = text.match(/^(#{1,3})\s+/);
  if (hashes) {
    heading = hashes[1].length as Node["heading"];
    text = text.slice(hashes[0].length);
  }
  return { text, done, heading };
}
