import type { OutlineDocument, OutlineNode, OutlineSnapshot, ViewState } from "../domain/outlineTypes";
import { toActiveOutlineSnapshot } from "../domain/workspace";
import {
  applyUpdate,
  encodeState,
  encodeStateVector,
  getYjsSnapshot,
  mergeIntoNewWorkspace,
  setYjsSnapshot,
  type YjsWorkspace
} from "./yjsAdapter";
import { createSyncQueueState, enqueueUpdate, hasAppliedUpdate, markUpdateApplied, type SyncQueueState } from "./syncQueue";
import type { RemoteStore, RemoteUpdate, SyncStatus } from "./syncTypes";

export const DEFAULT_REMOTE_UPDATE_BYTE_BUDGET = 256 * 1024;

export type RemoteSyncState = {
  status: SyncStatus;
  queue: SyncQueueState;
  lastUpdateId?: string;
};

export type PushLocalUpdateOptions = {
  maxUpdateBytes?: number;
};

export function createRemoteSyncState(): RemoteSyncState {
  return {
    status: "local-only",
    queue: createSyncQueueState()
  };
}

export async function pullRemoteUpdates(
  store: RemoteStore,
  workspace: YjsWorkspace,
  state: RemoteSyncState
): Promise<RemoteSyncState> {
  const snapshot = await store.readSnapshot();
  if (snapshot) {
    applyRemoteUpdate(workspace, snapshot);
  }
  let next = { ...state, status: "syncing" as SyncStatus };
  const updates = await store.listUpdates(state.lastUpdateId);
  for (const update of updates) {
    if (!hasAppliedUpdate(next.queue, update.id)) {
      applyRemoteUpdate(workspace, update.update);
      next = {
        ...next,
        queue: markUpdateApplied(next.queue, update.id),
        lastUpdateId: update.id
      };
    }
  }
  return { ...next, status: "synced" };
}

export async function pushLocalUpdate(
  store: RemoteStore,
  update: RemoteUpdate,
  state: RemoteSyncState,
  options: PushLocalUpdateOptions = {}
): Promise<RemoteSyncState> {
  const queued = { ...state, queue: enqueueUpdate(state.queue, update), status: "syncing" as SyncStatus };
  const maxUpdateBytes = options.maxUpdateBytes ?? DEFAULT_REMOTE_UPDATE_BYTE_BUDGET;
  if (update.update.byteLength > maxUpdateBytes) {
    return { ...queued, status: "error" };
  }
  try {
    await store.appendUpdate(update);
    return {
      ...queued,
      queue: markUpdateApplied(queued.queue, update.id),
      lastUpdateId: update.id,
      status: "synced"
    };
  } catch {
    return { ...queued, status: "offline" };
  }
}

export async function flushQueuedUpdates(store: RemoteStore, state: RemoteSyncState): Promise<RemoteSyncState> {
  let next = { ...state, status: "syncing" as SyncStatus };
  for (const update of state.queue.pending) {
    try {
      await store.appendUpdate(update);
      next = {
        ...next,
        queue: markUpdateApplied(next.queue, update.id),
        lastUpdateId: update.id
      };
    } catch {
      return { ...next, status: "offline" };
    }
  }
  return { ...next, status: "synced" };
}

export async function compactRemoteSnapshot(
  store: RemoteStore,
  workspace: YjsWorkspace,
  state?: RemoteSyncState
): Promise<void> {
  await store.writeSnapshot(encodeState(workspace), encodeStateVector(workspace), {
    compactThrough: state?.lastUpdateId
  });
}

export function subscribeRemoteUpdates(
  store: RemoteStore,
  workspace: YjsWorkspace,
  getState: () => RemoteSyncState,
  setState: (state: RemoteSyncState) => void
): () => void {
  const startCursor = getState().lastUpdateId;
  return store.subscribe((update) => {
    const state = getState();
    if (hasAppliedUpdate(state.queue, update.id)) {
      return;
    }
    applyRemoteUpdate(workspace, update.update);
    setState({
      ...state,
      queue: markUpdateApplied(state.queue, update.id),
      lastUpdateId: update.id,
      status: "synced"
    });
  }, { after: startCursor });
}

export function applyRemoteUpdate(workspace: YjsWorkspace, update: Uint8Array): void {
  const localSnapshot = getYjsSnapshot(workspace);
  const incomingWorkspace = mergeIntoNewWorkspace(update);
  const incomingSnapshot = getYjsSnapshot(incomingWorkspace);
  applyUpdate(workspace, update);
  if (localSnapshot && incomingSnapshot) {
    setYjsSnapshot(workspace, mergeOutlineSnapshots(toActiveOutlineSnapshot(localSnapshot), toActiveOutlineSnapshot(incomingSnapshot)));
  }
}

function mergeOutlineSnapshots(local: OutlineSnapshot, incoming: OutlineSnapshot): OutlineSnapshot {
  return {
    document: mergeOutlineDocuments(local.document, incoming.document),
    view: mergeViewState(local.view, incoming.view)
  };
}

function mergeOutlineDocuments(local: OutlineDocument, incoming: OutlineDocument): OutlineDocument {
  const nodeIds = new Set([...Object.keys(local.nodes), ...Object.keys(incoming.nodes)]);
  const nodes: Record<string, OutlineNode> = {};
  for (const nodeId of nodeIds) {
    const localNode = local.nodes[nodeId];
    const incomingNode = incoming.nodes[nodeId];
    if (localNode && incomingNode) {
      nodes[nodeId] = {
        ...localNode,
        ...incomingNode,
        children: mergeOrderedIds(localNode.children, incomingNode.children),
        updatedAt: Math.max(localNode.updatedAt, incomingNode.updatedAt)
      };
    } else {
      nodes[nodeId] = localNode ?? incomingNode;
    }
  }
  const rootId = incoming.nodes[incoming.rootId] ? incoming.rootId : local.rootId;
  return { rootId, nodes };
}

function mergeViewState(local: ViewState, incoming: ViewState): ViewState {
  return {
    ...incoming,
    zoomNodeId: local.zoomNodeId,
    selectedNodeId: local.selectedNodeId,
    selectionAnchorNodeId: local.selectionAnchorNodeId,
    selectionFocusNodeId: local.selectionFocusNodeId
  };
}

function mergeOrderedIds(localIds: string[], incomingIds: string[]): string[] {
  return [...localIds, ...incomingIds.filter((id) => !localIds.includes(id))];
}
