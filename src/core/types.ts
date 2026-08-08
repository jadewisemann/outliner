import { deviceId, tick } from "./clock";
import { keyBetween } from "./order";

export type Id = string;

/**
 * A stamp records who last changed something and when, so two devices editing
 * offline can be merged without asking the user.
 */
export type Stamp = { at: number; by: string };

export type Node = {
  id: Id;
  text: string;
  /** Sub-text shown under the row. Empty string means "no note". */
  note: string;
  collapsed: boolean;
  done: boolean;
  heading: 0 | 1 | 2 | 3;

  parent: Id | null;
  /** Fractional index among siblings — the merge-safe form of "position". */
  sort: string;
  /**
   * Sibling ids in `sort` order. A cache of what `parent`/`sort` already say,
   * kept because reading an outline is far more common than merging one.
   * `rebuildChildren` restores it from scratch after a merge.
   */
  children: Id[];

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
  /** Position among documents in the sidebar. */
  sort: string;
  titleEdited: Stamp;
  moved: Stamp;
};

/** Per-document UI state. Local to this device — never synced. */
export type DocView = {
  zoomId: Id;
  focusId: Id | null;
};

export type Workspace = {
  version: 4;
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
    parent: patch.parent ?? null,
    sort: patch.sort ?? keyBetween(null, null),
    children: patch.children ?? [],
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
    titleEdited: now,
    moved: now
  };
}

export function makeWorkspace(): Workspace {
  const doc = makeDoc("Inbox");
  return {
    version: 4,
    docs: { [doc.id]: doc },
    graves: {},
    activeDocId: doc.id,
    views: { [doc.id]: { zoomId: doc.rootId, focusId: doc.nodes[doc.rootId].children[0] } }
  };
}

/**
 * Documents in sidebar order. Two devices can mint the same `sort` for a
 * document created at the same position, so the id breaks the tie — otherwise
 * the sidebar would be ordered differently on each machine.
 */
export function docList(workspace: Workspace): Doc[] {
  return Object.values(workspace.docs).sort((a, b) =>
    a.sort !== b.sort ? (a.sort < b.sort ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
}
