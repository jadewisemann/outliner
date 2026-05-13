export type NodeId = string;

export type OutlineNode = {
  id: NodeId;
  text: string;
  children: NodeId[];
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
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
