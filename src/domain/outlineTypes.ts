export type NodeId = string;
export type DocumentId = string;

export type OutlineNode = {
  id: NodeId;
  text: string;
  children: NodeId[];
  collapsed: boolean;
  links?: OutlineLink[];
  note?: string;
  noteVisible?: boolean;
  heading?: 1 | 2 | 3;
  color?: string;
  numbered?: boolean;
  tags?: string[];
  completed?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type OutlineNodeMetadata = Pick<OutlineNode, "note" | "noteVisible" | "heading" | "color" | "tags" | "completed">;

export type OutlineLink = {
  source: string;
  targetNodeId: NodeId;
  label: string;
};

export type OutlineDocument = {
  id?: DocumentId;
  title?: string;
  slug?: string;
  rootId: NodeId;
  nodes: Record<NodeId, OutlineNode>;
  createdAt?: number;
  updatedAt?: number;
};

export type ViewState = {
  zoomNodeId: NodeId;
  selectedNodeId?: NodeId;
  selectionAnchorNodeId?: NodeId;
  selectionFocusNodeId?: NodeId;
  cursors?: OutlineCursor[];
};

export type OutlineCursor = {
  nodeId: NodeId;
  offset: number;
};

export type IdGenerator = () => NodeId;
export type Clock = () => number;

export type VisibleNode = {
  id: NodeId;
  node: OutlineNode;
  depth: number;
};

export type OutlineSnapshot = {
  schemaVersion?: 1;
  document: OutlineDocument;
  view: ViewState;
};

export type WorkspaceSnapshot = {
  schemaVersion: 2;
  workspace: {
    id: string;
    title?: string;
    documentOrder: DocumentId[];
    activeDocumentId: DocumentId;
    documents: Record<DocumentId, OutlineDocument>;
    view: WorkspaceViewState;
    createdAt: number;
    updatedAt: number;
  };
};

export type WorkspaceViewState = {
  activeDocumentId: DocumentId;
  perDocument: Record<DocumentId, ViewState>;
  recentTargets?: LinkTarget[];
};

export type LinkTarget =
  | { kind: "document"; documentId: DocumentId }
  | { kind: "node"; documentId: DocumentId; nodeId: NodeId };

export type StoredSnapshot = OutlineSnapshot | WorkspaceSnapshot;
