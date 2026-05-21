export type NodeId = string;

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
  rootId: NodeId;
  nodes: Record<NodeId, OutlineNode>;
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
  document: OutlineDocument;
  view: ViewState;
};
