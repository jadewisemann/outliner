import type { NodeId, OutlineNode, OutlineSnapshot, ViewState } from "../domain/outlineTypes";

export type OutlineSnapshotPatch = {
  rootChildren?: NodeId[];
  upsertedNodes: Record<NodeId, OutlineNode>;
  deletedNodeIds: NodeId[];
  view?: ViewState;
};

export function createSnapshotPatch(previous: OutlineSnapshot, next: OutlineSnapshot): OutlineSnapshotPatch {
  const upsertedNodes: Record<NodeId, OutlineNode> = {};
  const deletedNodeIds: NodeId[] = [];

  for (const [nodeId, node] of Object.entries(next.document.nodes)) {
    if (!nodesEqual(previous.document.nodes[nodeId], node)) {
      upsertedNodes[nodeId] = node;
    }
  }
  for (const nodeId of Object.keys(previous.document.nodes)) {
    if (!next.document.nodes[nodeId]) {
      deletedNodeIds.push(nodeId);
    }
  }

  return {
    ...(arraysEqual(previous.document.nodes[previous.document.rootId]?.children, next.document.nodes[next.document.rootId]?.children)
      ? {}
      : { rootChildren: [...next.document.nodes[next.document.rootId].children] }),
    upsertedNodes,
    deletedNodeIds,
    ...(viewEqual(previous.view, next.view) ? {} : { view: next.view })
  };
}

export function applySnapshotPatch(snapshot: OutlineSnapshot, patch: OutlineSnapshotPatch): OutlineSnapshot {
  const nodes: OutlineSnapshot["document"]["nodes"] = { ...snapshot.document.nodes };
  for (const nodeId of patch.deletedNodeIds) {
    delete nodes[nodeId];
  }
  for (const [nodeId, node] of Object.entries(patch.upsertedNodes)) {
    nodes[nodeId] = node;
  }
  if (patch.rootChildren) {
    const root = nodes[snapshot.document.rootId];
    nodes[snapshot.document.rootId] = { ...root, children: [...patch.rootChildren] };
  }
  return {
    document: {
      rootId: snapshot.document.rootId,
      nodes
    },
    view: patch.view ?? snapshot.view
  };
}

export function isEmptySnapshotPatch(patch: OutlineSnapshotPatch): boolean {
  return !patch.rootChildren && Object.keys(patch.upsertedNodes).length === 0 && patch.deletedNodeIds.length === 0 && !patch.view;
}

export function estimateEncodedPatchBytes(patch: OutlineSnapshotPatch): number {
  return new TextEncoder().encode(JSON.stringify(patch)).byteLength;
}

function nodesEqual(left: OutlineNode | undefined, right: OutlineNode): boolean {
  return !!left && JSON.stringify(left) === JSON.stringify(right);
}

function viewEqual(left: ViewState, right: ViewState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function arraysEqual(left: NodeId[] | undefined, right: NodeId[] | undefined): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}
