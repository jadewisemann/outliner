import { makeNode, type Doc, type Id, type Node, type Row } from "./types";

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

export function get(doc: Doc, id: Id): Node | undefined {
  return doc.nodes[id];
}

export function parentOf(doc: Doc, id: Id): Id | null {
  for (const node of Object.values(doc.nodes)) {
    if (node.children.includes(id)) return node.id;
  }
  return null;
}

/** Root-first chain of ancestors, excluding `id` itself. */
export function ancestors(doc: Doc, id: Id): Id[] {
  const chain: Id[] = [];
  let cursor = parentOf(doc, id);
  while (cursor) {
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
/* writing helpers                                                     */
/* ------------------------------------------------------------------ */

function withNodes(doc: Doc, nodes: Record<Id, Node>): Doc {
  return { ...doc, nodes, updatedAt: Date.now() };
}

/** Copy-on-write update of a single node. */
export function patchNode(doc: Doc, id: Id, patch: Partial<Node>): Doc {
  const node = doc.nodes[id];
  if (!node) return doc;
  return withNodes(doc, { ...doc.nodes, [id]: { ...node, ...patch } });
}

function setChildren(nodes: Record<Id, Node>, parentId: Id, children: Id[]): Record<Id, Node> {
  const parent = nodes[parentId];
  if (!parent) return nodes;
  return { ...nodes, [parentId]: { ...parent, children } };
}

/** Removes `id` from its parent's child list. Does not delete the node itself. */
function detach(nodes: Record<Id, Node>, doc: Doc, id: Id): { nodes: Record<Id, Node>; parentId: Id | null; index: number } {
  for (const node of Object.values(nodes)) {
    const index = node.children.indexOf(id);
    if (index === -1) continue;
    const children = node.children.slice();
    children.splice(index, 1);
    return { nodes: setChildren(nodes, node.id, children), parentId: node.id, index };
  }
  return { nodes, parentId: null, index: -1 };
}

function insertChild(nodes: Record<Id, Node>, parentId: Id, index: number, ids: Id[]): Record<Id, Node> {
  const parent = nodes[parentId];
  if (!parent) return nodes;
  const children = parent.children.slice();
  children.splice(index, 0, ...ids);
  return setChildren(nodes, parentId, children);
}

/* ------------------------------------------------------------------ */
/* structural edits                                                    */
/* ------------------------------------------------------------------ */

export type Edit = { doc: Doc; focusId?: Id; caret?: number };

/** Inserts a fresh sibling directly after `id` (or as its first child when expanded with children). */
export function insertAfter(doc: Doc, id: Id, text = ""): Edit {
  const node = doc.nodes[id];
  if (!node) return { doc };
  const fresh = makeNode({ text });
  let nodes = { ...doc.nodes, [fresh.id]: fresh };

  // A node with visible children gets the new row as its first child, matching
  // where the eye expects the next line to land.
  if (node.children.length > 0 && !node.collapsed) {
    nodes = insertChild(nodes, id, 0, [fresh.id]);
  } else {
    const parentId = parentOf(doc, id);
    if (!parentId) return { doc };
    const index = doc.nodes[parentId].children.indexOf(id);
    nodes = insertChild(nodes, parentId, index + 1, [fresh.id]);
  }
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
}

/** Splits `id` at `offset`: the tail becomes a new row that keeps the children. */
export function splitAt(doc: Doc, id: Id, offset: number): Edit {
  const node = doc.nodes[id];
  if (!node) return { doc };
  const head = node.text.slice(0, offset);
  const tail = node.text.slice(offset);

  // Splitting at the very end is just "new empty row after this one".
  if (tail === "") return insertAfter(patchNode(doc, id, { text: head }), id, "");

  const fresh = makeNode({ text: tail, children: node.children, note: "" });
  let nodes: Record<Id, Node> = {
    ...doc.nodes,
    [id]: { ...node, text: head, children: [] },
    [fresh.id]: fresh
  };
  const parentId = parentOf(doc, id);
  if (!parentId) return { doc };
  const index = doc.nodes[parentId].children.indexOf(id);
  nodes = insertChild(nodes, parentId, index + 1, [fresh.id]);
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
}

/** Backspace at offset 0: joins this row into the one visually above it. */
export function mergeIntoPrevious(doc: Doc, zoomId: Id, id: Id): Edit {
  const rows = visibleRows(doc, zoomId);
  const previous = rowBefore(rows, id);
  const node = doc.nodes[id];
  if (!previous || !node) return { doc };

  const caret = previous.node.text.length;
  const parentId = parentOf(doc, id);
  if (!parentId) return { doc };
  const index = doc.nodes[parentId].children.indexOf(id);

  let nodes: Record<Id, Node> = { ...doc.nodes };
  nodes = setChildren(nodes, parentId, doc.nodes[parentId].children.filter((child) => child !== id));

  if (node.children.length > 0) {
    // First child merging into its own parent: the orphans stay where they were.
    // Otherwise they belong under the row we just merged into.
    if (previous.id === parentId) {
      nodes = insertChild(nodes, parentId, index, node.children);
    } else {
      nodes = insertChild(nodes, previous.id, nodes[previous.id].children.length, node.children);
      nodes = { ...nodes, [previous.id]: { ...nodes[previous.id], collapsed: false } };
    }
  }

  const merged = nodes[previous.id];
  nodes = {
    ...nodes,
    [previous.id]: {
      ...merged,
      text: merged.text + node.text,
      note: merged.note || node.note
    }
  };
  delete nodes[id];
  return { doc: withNodes(doc, nodes), focusId: previous.id, caret };
}

/** Makes `id` the last child of its previous sibling. */
export function indent(doc: Doc, id: Id): Edit {
  const parentId = parentOf(doc, id);
  if (!parentId) return { doc };
  const siblings = doc.nodes[parentId].children;
  const index = siblings.indexOf(id);
  if (index <= 0) return { doc };
  const newParentId = siblings[index - 1];

  let nodes = detach({ ...doc.nodes }, doc, id).nodes;
  nodes = insertChild(nodes, newParentId, nodes[newParentId].children.length, [id]);
  nodes = { ...nodes, [newParentId]: { ...nodes[newParentId], collapsed: false } };
  return { doc: withNodes(doc, nodes), focusId: id };
}

/** Makes `id` the next sibling of its parent. No-op at the zoom root's top level. */
export function outdent(doc: Doc, id: Id, zoomId: Id): Edit {
  const parentId = parentOf(doc, id);
  if (!parentId || parentId === zoomId) return { doc };
  const grandparentId = parentOf(doc, parentId);
  if (!grandparentId) return { doc };

  const detached = detach({ ...doc.nodes }, doc, id);
  const at = detached.nodes[grandparentId].children.indexOf(parentId);
  const nodes = insertChild(detached.nodes, grandparentId, at + 1, [id]);
  return { doc: withNodes(doc, nodes), focusId: id };
}

/** Swaps `id` with the sibling above/below, carrying its subtree. */
export function moveVertically(doc: Doc, id: Id, direction: -1 | 1): Edit {
  const parentId = parentOf(doc, id);
  if (!parentId) return { doc };
  const children = doc.nodes[parentId].children.slice();
  const index = children.indexOf(id);
  const target = index + direction;
  if (target < 0 || target >= children.length) return { doc };
  [children[index], children[target]] = [children[target], children[index]];
  return { doc: withNodes(doc, setChildren({ ...doc.nodes }, parentId, children)), focusId: id };
}

/** Deletes `id` and everything under it. Focus lands on the neighbour above, else below. */
export function removeNode(doc: Doc, zoomId: Id, id: Id): Edit {
  const rows = visibleRows(doc, zoomId);
  const neighbour = rowBefore(rows, id) ?? rowAfter(rows, id);
  const doomed = new Set(subtree(doc, id));
  const nodes: Record<Id, Node> = {};
  for (const [key, node] of Object.entries(doc.nodes)) {
    if (doomed.has(key)) continue;
    nodes[key] = doomed.size > 0 ? { ...node, children: node.children.filter((child) => !doomed.has(child)) } : node;
  }
  if (!nodes[zoomId]) return { doc };
  return { doc: withNodes(doc, nodes), focusId: neighbour?.id, caret: neighbour ? nodes[neighbour.id]?.text.length : 0 };
}

/** Moves `id` (with subtree) to position `index` under `newParentId`. Used by drag & drop. */
export function reparent(doc: Doc, id: Id, newParentId: Id, index: number): Edit {
  if (id === newParentId || subtree(doc, id).includes(newParentId)) return { doc };
  const from = detach({ ...doc.nodes }, doc, id);
  let at = index;
  if (from.parentId === newParentId && from.index < index) at -= 1;
  const bounded = Math.max(0, Math.min(at, from.nodes[newParentId]?.children.length ?? 0));
  let nodes = insertChild(from.nodes, newParentId, bounded, [id]);
  if (nodes[newParentId]?.collapsed) nodes = { ...nodes, [newParentId]: { ...nodes[newParentId], collapsed: false } };
  return { doc: withNodes(doc, nodes), focusId: id };
}

/* ------------------------------------------------------------------ */
/* zoom                                                                */
/* ------------------------------------------------------------------ */

/** Expands every ancestor so `id` is reachable from `zoomId`. */
export function reveal(doc: Doc, id: Id): Doc {
  let nodes = doc.nodes;
  for (const ancestor of ancestors(doc, id)) {
    if (nodes[ancestor]?.collapsed) nodes = { ...nodes, [ancestor]: { ...nodes[ancestor], collapsed: false } };
  }
  return nodes === doc.nodes ? doc : { ...doc, nodes };
}

/** Adds an empty row at the end of `parentId`, or focuses the trailing empty one. */
export function appendChild(doc: Doc, parentId: Id): Edit {
  const children = doc.nodes[parentId]?.children ?? [];
  const last = children[children.length - 1];
  if (last && doc.nodes[last].text === "" && doc.nodes[last].children.length === 0) {
    return { doc, focusId: last, caret: 0 };
  }
  const fresh = makeNode();
  const nodes = setChildren({ ...doc.nodes, [fresh.id]: fresh }, parentId, [...children, fresh.id]);
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
}

/** A zoomed node always needs at least one child to type into. */
export function ensureEditable(doc: Doc, zoomId: Id): Edit {
  const zoom = doc.nodes[zoomId];
  if (!zoom || zoom.children.length > 0) return { doc };
  const fresh = makeNode();
  const nodes = setChildren({ ...doc.nodes, [fresh.id]: fresh }, zoomId, [fresh.id]);
  return { doc: withNodes(doc, nodes), focusId: fresh.id, caret: 0 };
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

/** Runs a single-row operation over a selection, in the order that keeps it stable. */
function bulk(doc: Doc, ids: Id[], reverse: boolean, step: (doc: Doc, id: Id) => Edit): Edit {
  const ordered = reverse ? [...ids].reverse() : ids;
  let current = doc;
  for (const id of ordered) current = step(current, id).doc;
  return { doc: current };
}

export function bulkIndent(doc: Doc, zoomId: Id, ids: Id[]): Edit {
  return bulk(doc, topLevel(doc, zoomId, ids), false, (current, id) => indent(current, id));
}

export function bulkOutdent(doc: Doc, zoomId: Id, ids: Id[]): Edit {
  return bulk(doc, topLevel(doc, zoomId, ids), true, (current, id) => outdent(current, id, zoomId));
}

export function bulkMove(doc: Doc, zoomId: Id, ids: Id[], direction: -1 | 1): Edit {
  // Moving down starts from the bottom so rows do not step over each other.
  return bulk(doc, topLevel(doc, zoomId, ids), direction === 1, (current, id) => moveVertically(current, id, direction));
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

  let current = doc;
  for (const id of [...ordered].reverse()) current = removeNode(current, zoomId, id).doc;

  const focusId = survivor && current.nodes[survivor.id] ? survivor.id : visibleRows(current, zoomId)[0]?.id;
  return { doc: current, focusId, caret: focusId ? current.nodes[focusId]?.text.length : 0 };
}

export function bulkSetCollapsed(doc: Doc, ids: Id[], collapsed: boolean): Edit {
  let nodes = doc.nodes;
  for (const id of ids) {
    const node = nodes[id];
    if (node && node.children.length > 0 && node.collapsed !== collapsed) {
      nodes = { ...nodes, [id]: { ...node, collapsed } };
    }
  }
  return { doc: nodes === doc.nodes ? doc : { ...doc, nodes, updatedAt: Date.now() } };
}

/** Collapses or expands every descendant of `fromId`. */
export function setCollapsedDeep(doc: Doc, fromId: Id, collapsed: boolean): Edit {
  return bulkSetCollapsed(doc, subtree(doc, fromId).filter((id) => id !== fromId), collapsed);
}

/* ------------------------------------------------------------------ */
/* bulk / clipboard                                ------------------- */
/* ------------------------------------------------------------------ */

/**
 * Inserts indented plain text as a subtree after `afterId`.
 * Two spaces or one tab per level; blank lines are dropped.
 */
export function insertOutlineText(doc: Doc, afterId: Id, text: string): Edit {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return { doc };

  const parentId = parentOf(doc, afterId);
  if (!parentId) return { doc };

  const nodes: Record<Id, Node> = { ...doc.nodes };
  const roots: Id[] = [];
  const stack: { depth: number; id: Id }[] = [];
  let lastId = afterId;

  for (const line of lines) {
    const indentWidth = line.match(/^[\t ]*/)?.[0] ?? "";
    const depth = indentWidth.replace(/\t/g, "  ").length >> 1;
    const fresh = makeNode(parseOutlineLine(line.trim()));
    nodes[fresh.id] = fresh;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const owner = stack[stack.length - 1];
    if (owner) {
      nodes[owner.id] = { ...nodes[owner.id], children: [...nodes[owner.id].children, fresh.id] };
    } else {
      roots.push(fresh.id);
    }
    stack.push({ depth, id: fresh.id });
    lastId = fresh.id;
  }

  const index = nodes[parentId].children.indexOf(afterId);
  const target = doc.nodes[afterId].text === "" ? index : index + 1;
  let next = insertChild(nodes, parentId, target, roots);
  // Typing into an empty row and pasting replaces it rather than leaving a blank.
  if (doc.nodes[afterId].text === "") {
    next = setChildren(next, parentId, next[parentId].children.filter((child) => child !== afterId));
    delete next[afterId];
  }
  return { doc: withNodes(doc, next), focusId: lastId, caret: nodes[lastId].text.length };
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
