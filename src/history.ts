import { stamp, type Doc, type Id, type Node, type Workspace } from "./types";

const LIMIT = 200;
const COALESCE_MS = 700;

/**
 * Undo for a workspace that also syncs.
 *
 * Restoring an old snapshot verbatim is not enough once another device is
 * involved: the remote still holds the newer stamps, so the next merge would
 * simply put the undone edit back. Undo therefore re-stamps whatever it
 * changes — it is a new edit that happens to restore old content, and it wins
 * the next merge like any other.
 *
 * A merge that brings in remote work invalidates the stack entirely (see
 * `clear`), because replaying a snapshot from before it would delete rows this
 * device never authored.
 */
export function createHistory() {
  let past: Workspace[] = [];
  let future: Workspace[] = [];
  let last: { key: string; at: number } | null = null;

  return {
    record(previous: Workspace, coalesceKey?: string) {
      const now = Date.now();
      const coalesces = coalesceKey !== undefined && last?.key === coalesceKey && now - last.at < COALESCE_MS;
      if (!coalesces) past = [...past.slice(-(LIMIT - 1)), previous];
      last = coalesceKey ? { key: coalesceKey, at: now } : null;
      future = [];
    },

    undo(current: Workspace): Workspace | null {
      const previous = past.pop();
      if (!previous) return null;
      future = [...future, current];
      last = null;
      return restamp(previous, current);
    },

    redo(current: Workspace): Workspace | null {
      const next = future.pop();
      if (!next) return null;
      past = [...past, current];
      last = null;
      return restamp(next, current);
    },

    /** Called when a merge changed the document under us. */
    clear() {
      past = [];
      future = [];
      last = null;
    },

    /** Only the coalescing window, so the next keystroke starts a new step. */
    breakRun() {
      last = null;
    }
  };
}

/* ------------------------------------------------------------------ */

/** Rewrites `target` so every difference from `current` reads as a fresh edit. */
function restamp(target: Workspace, current: Workspace): Workspace {
  const docs: Record<Id, Doc> = {};
  const graves = { ...target.graves };

  for (const [id, doc] of Object.entries(target.docs)) {
    const live = current.docs[id];
    docs[id] = live ? restampDoc(doc, live) : { ...doc, titleEdited: stamp(), moved: stamp() };
  }
  // Documents the undone edit created have to be buried, not merely dropped.
  for (const id of Object.keys(current.docs)) if (!docs[id]) graves[id] = stamp();

  return { ...target, docs, graves };
}

function restampDoc(target: Doc, live: Doc): Doc {
  const nodes: Record<Id, Node> = {};
  const graves = { ...target.graves };
  let touched = false;

  for (const [id, node] of Object.entries(target.nodes)) {
    const now = live.nodes[id];
    if (!now) {
      nodes[id] = { ...node, edited: stamp(), moved: stamp() };
      touched = true;
      continue;
    }
    const content =
      node.text !== now.text ||
      node.note !== now.note ||
      node.done !== now.done ||
      node.heading !== now.heading ||
      node.collapsed !== now.collapsed;
    const position = node.parent !== now.parent || node.sort !== now.sort;
    if (!content && !position) {
      nodes[id] = now;
      continue;
    }
    nodes[id] = { ...node, edited: content ? stamp() : now.edited, moved: position ? stamp() : now.moved };
    touched = true;
  }

  for (const id of Object.keys(live.nodes)) {
    if (!nodes[id]) {
      graves[id] = stamp();
      touched = true;
    }
  }

  const renamed = target.title !== live.title;
  if (!touched && !renamed) return live;
  return { ...target, nodes, graves, titleEdited: renamed ? stamp() : live.titleEdited };
}
