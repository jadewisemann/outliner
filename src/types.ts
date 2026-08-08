import { deviceId, tick } from "./shared/clock";
import { keyBetween } from "./shared/order";

export type Id = string;

/**
 * A stamp records who last changed something and when, so two devices editing
 * offline can be merged without asking the user.
 */
export type Stamp = { at: number; by: string };

/** 0 is "no label"; the rest are the six label colours. */
export type Color = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Node = {
  id: Id;
  text: string;
  /** Sub-text shown under the row. Empty string means "no note". */
  note: string;
  collapsed: boolean;
  done: boolean;
  heading: 0 | 1 | 2 | 3;
  /** Renders the row as a quotation. Unlike the two below, this one is the row's own. */
  quote: boolean;
  /** Shows a checkbox on this node's *children*. A list is a checklist, not a row. */
  checklist: boolean;
  /** Numbers this node's *children*, for the same reason. */
  numbered: boolean;
  color: Color;
  /** Pinned to the sidebar, reachable from the palette. */
  bookmarked: boolean;

  parent: Id | null;
  /** Fractional index among siblings — the merge-safe form of "position". */
  sort: string;
  /**
   * Sibling ids in `sort` order. A cache of what `parent`/`sort` already say,
   * kept because reading an outline is far more common than merging one.
   * `rebuildChildren` restores it from scratch after a merge.
   */
  children: Id[];

  /**
   * When this node first existed. Unlike the other two this only ever moves
   * backwards in a merge — a node cannot have been created twice, so the
   * earlier of two claims is the true one.
   */
  created: Stamp;
  /** Last change to the text, note, or flags. */
  edited: Stamp;
  /** Last change to `parent` or `sort`. */
  moved: Stamp;
};

export type Doc = {
  id: Id;
  title: string;
  rootId: Id;
  nodes: Record<Id, Node>;
  /** Deleted node ids, kept so a delete is not undone by an older device. */
  graves: Record<Id, Stamp>;
  /** Position among siblings in the sidebar. */
  sort: string;
  /**
   * Containing folder, or null at the top level. A folder is just a document
   * with `kind: "folder"` — same record, same file, same merge rules, so the
   * sidebar tree costs no new machinery.
   */
  parent: Id | null;
  kind: "doc" | "folder";
  bookmarked: boolean;
  /** Covers `title`, `kind` and `bookmarked` — everything but position. */
  titleEdited: Stamp;
  /** Covers `sort` and `parent`. */
  moved: Stamp;
};

/** Per-document UI state. Local to this device — never synced. */
export type DocView = {
  zoomId: Id;
  focusId: Id | null;
  hideCompleted: boolean;
  hideNotes: boolean;
  /** Live filter query. Rows that do not match, and have no matching
   *  descendant, are hidden — the outline stays editable in place. */
  filter: string;
};

export type Workspace = {
  version: 6;
  docs: Record<Id, Doc>;
  graves: Record<Id, Stamp>;
  activeDocId: Id;
  views: Record<Id, DocView>;
};

/** The part of a workspace that travels between devices. */
export type SyncPayload = Pick<Workspace, "docs" | "graves">;

export type Row = {
  id: Id;
  node: Node;
  depth: number;
  /** Index among the parent's children, used for numbered lists and sibling math. */
  index: number;
  parentId: Id;
  /** Read off the parent, since a checkbox and a number are a list's decision. */
  checklist: boolean;
  numbered: boolean;
};

export const newId = (): Id =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);

export function stamp(): Stamp {
  return { at: tick(), by: deviceId() };
}

export function makeNode(patch: Partial<Node> = {}): Node {
  const now = stamp();
  return {
    id: patch.id ?? newId(),
    text: patch.text ?? "",
    note: patch.note ?? "",
    collapsed: patch.collapsed ?? false,
    done: patch.done ?? false,
    heading: patch.heading ?? 0,
    quote: patch.quote ?? false,
    checklist: patch.checklist ?? false,
    numbered: patch.numbered ?? false,
    color: patch.color ?? 0,
    bookmarked: patch.bookmarked ?? false,
    parent: patch.parent ?? null,
    sort: patch.sort ?? keyBetween(null, null),
    children: patch.children ?? [],
    created: patch.created ?? now,
    edited: patch.edited ?? now,
    moved: patch.moved ?? now
  };
}

export function makeDoc(title = "Untitled", patch: Partial<Doc> = {}): Doc {
  const root = makeNode();
  const first = makeNode({ parent: root.id });
  root.children = [first.id];
  const now = stamp();
  return {
    id: patch.id ?? newId(),
    title,
    rootId: root.id,
    nodes: { [root.id]: root, [first.id]: first },
    graves: {},
    sort: patch.sort ?? keyBetween(null, null),
    parent: patch.parent ?? null,
    kind: patch.kind ?? "doc",
    bookmarked: patch.bookmarked ?? false,
    titleEdited: now,
    moved: now
  };
}

/** A folder holds no outline of its own, but is otherwise an ordinary document. */
export function makeFolder(title = "New folder", patch: Partial<Doc> = {}): Doc {
  return { ...makeDoc(title, patch), kind: "folder" };
}

export function makeView(doc: Doc, patch: Partial<DocView> = {}): DocView {
  return {
    zoomId: doc.rootId,
    focusId: doc.nodes[doc.rootId]?.children[0] ?? null,
    hideCompleted: false,
    hideNotes: false,
    filter: "",
    ...patch
  };
}

export function makeWorkspace(): Workspace {
  const doc = makeDoc("Inbox");
  return {
    version: 6,
    docs: { [doc.id]: doc },
    graves: {},
    activeDocId: doc.id,
    views: { [doc.id]: makeView(doc) }
  };
}

/**
 * Every document in one flat, stable order. Two devices can mint the same
 * `sort` for a document created at the same position, so the id breaks the
 * tie — otherwise the order would differ on each machine.
 */
export function docList(workspace: Workspace): Doc[] {
  return Object.values(workspace.docs).sort(byPosition);
}

function byPosition(a: Doc, b: Doc): number {
  if (a.sort !== b.sort) return a.sort < b.sort ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The documents and folders directly inside `parent`, in order. */
export function docChildren(workspace: Workspace, parent: Id | null): Doc[] {
  return Object.values(workspace.docs)
    .filter((doc) => folderOf(workspace, doc) === parent)
    .sort(byPosition);
}

/**
 * A document's containing folder, or null. A `parent` that points at a missing
 * document, at a non-folder, or into a cycle reads as "top level" — the
 * sidebar has to render something, and a lost document must not be invisible.
 */
function folderOf(workspace: Workspace, doc: Doc): Id | null {
  const seen = new Set<Id>([doc.id]);
  let cursor = doc.parent;
  while (cursor) {
    const owner = workspace.docs[cursor];
    if (!owner || owner.kind !== "folder") return null;
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    cursor = owner.parent;
  }
  return doc.parent && workspace.docs[doc.parent]?.kind === "folder" ? doc.parent : null;
}

/** The sidebar, flattened depth-first: what you see, top to bottom. */
export function docTree(workspace: Workspace, openFolders: (id: Id) => boolean = () => true): { doc: Doc; depth: number }[] {
  const out: { doc: Doc; depth: number }[] = [];
  const walk = (parent: Id | null, depth: number) => {
    for (const doc of docChildren(workspace, parent)) {
      out.push({ doc, depth });
      if (doc.kind === "folder" && openFolders(doc.id)) walk(doc.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
