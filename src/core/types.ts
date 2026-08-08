export type Id = string;

export type Node = {
  id: Id;
  text: string;
  children: Id[];
  /** Sub-text shown under the row. Empty string means "no note". */
  note: string;
  collapsed: boolean;
  done: boolean;
  heading: 0 | 1 | 2 | 3;
};

export type Doc = {
  id: Id;
  title: string;
  rootId: Id;
  nodes: Record<Id, Node>;
  updatedAt: number;
};

/** Per-document UI state. Persisted so a reload lands where you left off. */
export type DocView = {
  zoomId: Id;
  focusId: Id | null;
};

export type Workspace = {
  version: 3;
  docs: Record<Id, Doc>;
  docOrder: Id[];
  activeDocId: Id;
  views: Record<Id, DocView>;
};

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

export function makeNode(patch: Partial<Node> = {}): Node {
  return {
    id: patch.id ?? newId(),
    text: patch.text ?? "",
    children: patch.children ?? [],
    note: patch.note ?? "",
    collapsed: patch.collapsed ?? false,
    done: patch.done ?? false,
    heading: patch.heading ?? 0
  };
}

export function makeDoc(title = "Untitled", patch: Partial<Doc> = {}): Doc {
  const root = makeNode();
  const first = makeNode();
  root.children = [first.id];
  return {
    id: patch.id ?? newId(),
    title,
    rootId: root.id,
    nodes: { [root.id]: root, [first.id]: first },
    updatedAt: Date.now()
  };
}

export function makeWorkspace(): Workspace {
  const doc = makeDoc("Inbox");
  return {
    version: 3,
    docs: { [doc.id]: doc },
    docOrder: [doc.id],
    activeDocId: doc.id,
    views: { [doc.id]: { zoomId: doc.rootId, focusId: doc.nodes[doc.rootId].children[0] } }
  };
}
