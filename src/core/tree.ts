import { keyBetween, keysAfter } from "./order";
import { makeNode, stamp, type Doc, type Id, type Node, type Row, type Stamp } from "./types";

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

export function get(doc: Doc, id: Id): Node | undefined {
  return doc.nodes[id];
}

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
  const walk = (current: Id) => {
    out.push(current);
    for (const child of doc.nodes[current]?.children ?? []) walk(child);
  };
  walk(id);
  return out;
}

/** Flattened rows under `zoomId`, skipping children of collapsed nodes. */
export function visibleRows(doc: Doc, zoomId: Id): Row[] {
  const rows: Row[] = [];
  const walk = (parentId: Id, depth: number) => {
    const parent = doc.nodes[parentId];
    if (!parent) return;
    parent.children.forEach((id, index) => {
      const node = doc.nodes[id];
      if (!node) return;
      rows.push({ id, node, depth, index, parentId });
      if (!node.collapsed) walk(id, depth + 1);
    });
  };
  walk(zoomId, 0);
  return rows;
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
  const after = at < siblings.length ? nodes[siblings[at]]?.sort ?? null : null;

  nodes[id] = { ...node, parent: parentId, sort: keyBetween(before, after), moved: stamp() };
  setChildren(nodes, parentId, siblings.toSpliced(at, 0, id));
}

/** Moves an existing node to `index` under `parentId`. */
function move(nodes: Nodes, id: Id, parentId: Id, index: number): void {
  const from = detach(nodes, id);
  const shift = from.parentId === parentId && from.index !== -1 && from.index < index ? 1 : 0;
  place(nodes, parentId, id, index - shift);
}

/** Adds a brand new node under `parentId` at `index`. */
function insert(nodes: Nodes, parentId: Id, node: Node, index: number): void {
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
  for (const node of Object.values(doc.nodes)) {
    const children = (buckets.get(node.id) ?? [])
      .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.id < b.id ? -1 : 1))
      .map((child) => child.id);
    nodes[node.id] = { ...node, children };
  }
  return withNodes(doc, nodes);
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

function moveVerticallyInto(nodes: Nodes, id: Id, direction: -1 | 1): void {
  const parentId = nodes[id]?.parent;
  if (!parentId) return;
  const siblings = nodes[parentId].children;
  const target = siblings.indexOf(id) + direction;
  if (target < 0 || target >= siblings.length) return;
  // +1 when moving down because the target index is measured after removal.
  move(nodes, id, parentId, direction === 1 ? target + 1 : target);
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
  nodes[previous.id] = { ...merged, text: merged.text + node.text, note: merged.note || node.note, edited: stamp() };
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

/** Swaps `id` with the sibling above/below, carrying its subtree. */
export function moveVertically(doc: Doc, id: Id, direction: -1 | 1): Edit {
  const parentId = doc.nodes[id]?.parent;
  if (!parentId) return { doc };
  const siblings = doc.nodes[parentId].children;
  const index = siblings.indexOf(id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return { doc };
  const nodes = draft(doc);
  moveVerticallyInto(nodes, id, direction);
  return { doc: withNodes(doc, nodes), focusId: id };
}

/** Deletes `id` and everything under it. Focus lands on the neighbour above, else below. */
export function removeNode(doc: Doc, zoomId: Id, id: Id): Edit {
  const rows = visibleRows(doc, zoomId);
  const neighbour = rowBefore(rows, id) ?? rowAfter(rows, id);
  const doomed = subtree(doc, id);
  if (doomed.includes(zoomId)) return { doc };

  const nodes = draft(doc);
  const graves = { ...doc.graves };
  removeInto(nodes, graves, id);
  return {
    doc: { ...doc, nodes, graves },
    focusId: neighbour?.id,
    caret: neighbour ? nodes[neighbour.id]?.text.length : 0
  };
}

/** Moves `id` (with subtree) to position `index` under `newParentId`. Used by drag & drop. */
export function reparent(doc: Doc, id: Id, newParentId: Id, index: number): Edit {
  if (id === newParentId || subtree(doc, id).includes(newParentId)) return { doc };
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
  const children = doc.nodes[parentId]?.children ?? [];
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
  // Moving down starts from the bottom so rows do not step over each other.
  return bulk(doc, topLevel(doc, zoomId, ids), direction === 1, (nodes, id) => moveVerticallyInto(nodes, id, direction));
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
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim() !== "");
  const target = doc.nodes[afterId];
  const parentId = target?.parent;
  if (lines.length === 0 || !parentId) return { doc };

  const nodes = draft(doc);
  const stack: { depth: number; id: Id }[] = [];
  let index = doc.nodes[parentId].children.indexOf(afterId) + 1;
  let lastId = afterId;

  for (const line of lines) {
    const indentWidth = (line.match(/^[\t ]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
    const depth = indentWidth >> 1;
    const fresh = makeNode(parseOutlineLine(line.trim()));

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
export function toOutlineText(doc: Doc, ids: Id[], bullet = ""): string {
  const lines: string[] = [];
  const walk = (id: Id, depth: number) => {
    const node = doc.nodes[id];
    if (!node) return;
    lines.push(`${"  ".repeat(depth)}${bullet}${node.text}`);
    if (node.note) {
      for (const line of node.note.split("\n")) lines.push(`${"  ".repeat(depth + 1)}${line}`);
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const id of ids) walk(id, 0);
  return lines.join("\n");
}

/**
 * Reads one line of markdown-ish outline text: an optional bullet, then an
 * optional `[ ]`/`[x]` checkbox, then up to three leading `#` for a heading.
 */
export function parseOutlineLine(line: string): Partial<Node> {
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
