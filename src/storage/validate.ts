import { MAX_SKEW_MS } from "../shared/clock";
import type { Doc, Id, Node, Stamp, SyncPayload, Workspace } from "../types";

/**
 * The trust boundary. Everything arriving from outside this browser tab — a
 * sync endpoint, an imported backup file — passes through here first.
 *
 * The rule is drop, never throw: anything malformed is discarded and the rest
 * is kept, so one bad row cannot take the workspace down. `merge.ts` and the
 * UI may then assume the shape they were written against.
 */

/** Keys that would reach `Object.prototype` if used as a record key. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function readPayload(value: unknown, now = Date.now()): SyncPayload | null {
  if (!isRecord(value)) return null;
  const docs = readDocs(value.docs, now);
  if (!docs) return null;
  return { docs, graves: readGraves(value.graves, now) };
}

/** A full workspace, as stored locally or found in a backup file. */
export function readWorkspace(value: unknown, now = Date.now()): Workspace | null {
  const payload = readPayload(value, now);
  if (!payload || Object.keys(payload.docs).length === 0) return null;

  const raw = value as Record<string, unknown>;
  const activeDocId =
    typeof raw.activeDocId === "string" && payload.docs[raw.activeDocId]
      ? raw.activeDocId
      : Object.keys(payload.docs)[0];

  const views: Workspace["views"] = {};
  if (isRecord(raw.views)) {
    for (const [id, view] of entries(raw.views)) {
      if (!payload.docs[id] || !isRecord(view)) continue;
      const zoomId = typeof view.zoomId === "string" ? view.zoomId : null;
      views[id] = {
        zoomId: zoomId && payload.docs[id].nodes[zoomId] ? zoomId : payload.docs[id].rootId,
        focusId: typeof view.focusId === "string" ? view.focusId : null,
        hideCompleted: view.hideCompleted === true,
        hideNotes: view.hideNotes === true,
        // A filter left over from a previous session would hide most of the
        // outline with no visible cause, so it does not survive a reload.
        filter: ""
      };
    }
  }
  return { version: 6, ...payload, activeDocId, views };
}

/**
 * A single document, as stored in its own file. The id comes from outside the
 * document — the file name — so it is passed in rather than read.
 */
export function readDoc(id: Id, value: unknown, now = Date.now()): Doc | null {
  if (id === "" || UNSAFE_KEYS.has(id) || !isRecord(value)) return null;
  const rootId = str(value.rootId);
  const nodes = readNodes(value.nodes, now);
  // Without a reachable root there is no document to show.
  if (!rootId || !nodes || !nodes[rootId]) return null;

  return {
    id,
    rootId,
    title: str(value.title) ?? "Untitled",
    nodes,
    graves: readGraves(value.graves, now),
    sort: str(value.sort) ?? "V",
    parent: str(value.parent) ?? null,
    kind: value.kind === "folder" || value.kind === "search" ? value.kind : "doc",
    query: str(value.query) ?? "",
    bookmarked: value.bookmarked === true,
    deleted: value.deleted === undefined || value.deleted === null ? null : readStamp(value.deleted, now),
    titleEdited: readStamp(value.titleEdited, now),
    moved: readStamp(value.moved, now)
  };
}

function readDocs(value: unknown, now: number): Record<Id, Doc> | null {
  if (!isRecord(value)) return null;
  const docs: Record<Id, Doc> = {};

  for (const [id, raw] of entries(value)) {
    const doc = readDoc(id, raw, now);
    if (doc) docs[id] = doc;
  }
  return docs;
}

function readNodes(value: unknown, now: number): Record<Id, Node> | null {
  if (!isRecord(value)) return null;
  const nodes: Record<Id, Node> = {};

  for (const [id, raw] of entries(value)) {
    if (!isRecord(raw)) continue;
    const heading = Number(raw.heading);
    const color = Number(raw.color);
    const edited = readStamp(raw.edited, now);
    nodes[id] = {
      id,
      text: str(raw.text) ?? "",
      note: str(raw.note) ?? "",
      collapsed: raw.collapsed === true,
      done: raw.done === true,
      heading: heading === 1 || heading === 2 || heading === 3 ? heading : 0,
      quote: raw.quote === true,
      checklist: raw.checklist === true,
      numbered: raw.numbered === true,
      color: Number.isInteger(color) && color >= 1 && color <= 6 ? (color as Node["color"]) : 0,
      bookmarked: raw.bookmarked === true,
      parent: str(raw.parent) ?? null,
      sort: str(raw.sort) ?? "V",
      children: Array.isArray(raw.children) ? raw.children.filter((child) => typeof child === "string") : [],
      // Data written before nodes carried a creation stamp gets the oldest
      // thing known about it rather than "now", or every old row would look
      // brand new to a `created:` search.
      created: raw.created === undefined ? edited : readStamp(raw.created, now),
      edited,
      moved: readStamp(raw.moved, now)
    };
  }

  // Drop links to nodes that did not survive validation.
  for (const node of Object.values(nodes)) {
    if (node.parent && !nodes[node.parent]) node.parent = null;
    node.children = node.children.filter((child) => nodes[child]);
  }
  return nodes;
}

export function readGraves(value: unknown, now = Date.now()): Record<Id, Stamp> {
  const graves: Record<Id, Stamp> = {};
  if (!isRecord(value)) return graves;
  for (const [id, raw] of entries(value)) graves[id] = readStamp(raw, now);
  return graves;
}

/**
 * A stamp far in the future would win every merge forever and, once observed,
 * would saturate this device's own clock — so it is pulled back to now.
 */
function readStamp(value: unknown, now: number): Stamp {
  const raw = isRecord(value) ? value : {};
  const at = Number(raw.at);
  const ceiling = now + MAX_SKEW_MS;
  return {
    at: Number.isFinite(at) ? Math.min(Math.max(at, 0), ceiling) : now,
    by: str(raw.by)?.slice(0, 64) ?? "unknown"
  };
}

/** Object entries minus any key that would land on the prototype chain. */
function entries(value: Record<string, unknown>): [string, unknown][] {
  return Object.entries(value).filter(([key]) => key !== "" && !UNSAFE_KEYS.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
