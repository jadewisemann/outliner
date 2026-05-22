import type { NodeId, OutlineNode, OutlineSnapshot, StoredSnapshot, ViewState } from "../domain/outlineTypes";
import { isWorkspaceSnapshot, toActiveOutlineSnapshot } from "../domain/workspace";

export type OutlineSnapshotPatch = {
  rootChildren?: NodeId[];
  upsertedNodes: Record<NodeId, OutlineNode>;
  deletedNodeIds: NodeId[];
  view?: ViewState;
};

export function createSnapshotPatch(previous: OutlineSnapshot, next: OutlineSnapshot): OutlineSnapshotPatch {
  return {
    ...createRootChildrenPatch(previous, next),
    upsertedNodes: collectUpsertedNodes(previous, next),
    deletedNodeIds: collectDeletedNodeIds(previous, next),
    ...(viewEqual(previous.view, next.view) ? {} : { view: next.view })
  };
}

function collectUpsertedNodes(previous: OutlineSnapshot, next: OutlineSnapshot): Record<NodeId, OutlineNode> {
  const upsertedNodes: Record<NodeId, OutlineNode> = {};
  for (const [nodeId, node] of Object.entries(next.document.nodes)) {
    if (!nodesEqual(previous.document.nodes[nodeId], node)) {
      upsertedNodes[nodeId] = node;
    }
  }
  return upsertedNodes;
}

function collectDeletedNodeIds(previous: OutlineSnapshot, next: OutlineSnapshot): NodeId[] {
  const deletedNodeIds: NodeId[] = [];
  for (const nodeId of Object.keys(previous.document.nodes)) {
    if (!next.document.nodes[nodeId]) {
      deletedNodeIds.push(nodeId);
    }
  }
  return deletedNodeIds;
}

function createRootChildrenPatch(
  previous: OutlineSnapshot,
  next: OutlineSnapshot
): Pick<OutlineSnapshotPatch, "rootChildren"> {
  const previousChildren = previous.document.nodes[previous.document.rootId]?.children;
  const nextChildren = next.document.nodes[next.document.rootId].children;
  return arraysEqual(previousChildren, nextChildren) ? {} : { rootChildren: [...nextChildren] };
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
      ...snapshot.document,
      rootId: snapshot.document.rootId,
      nodes
    },
    view: patch.view ?? snapshot.view
  };
}

export function applySnapshotPatchToStored(snapshot: StoredSnapshot, patch: OutlineSnapshotPatch): StoredSnapshot {
  const patched = applySnapshotPatch(toActiveOutlineSnapshot(snapshot), patch);
  if (!isWorkspaceSnapshot(snapshot)) {
    return patched;
  }
  const activeDocumentId = snapshot.workspace.activeDocumentId;
  return {
    ...snapshot,
    workspace: {
      ...snapshot.workspace,
      documents: {
        ...snapshot.workspace.documents,
        [activeDocumentId]: patched.document
      },
      view: {
        ...snapshot.workspace.view,
        activeDocumentId,
        perDocument: {
          ...snapshot.workspace.view.perDocument,
          [activeDocumentId]: patched.view
        }
      },
      updatedAt: patched.document.updatedAt ?? snapshot.workspace.updatedAt
    }
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
