import { applyUpdate, encodeState, encodeStateVector, type YjsWorkspace } from "./yjsAdapter";
import { createSyncQueueState, enqueueUpdate, hasAppliedUpdate, markUpdateApplied, type SyncQueueState } from "./syncQueue";
import type { RemoteStore, RemoteUpdate, SyncStatus } from "./syncTypes";

export type RemoteSyncState = {
  status: SyncStatus;
  queue: SyncQueueState;
  lastUpdateId?: string;
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
    applyUpdate(workspace, snapshot);
  }
  let next = { ...state, status: "syncing" as SyncStatus };
  const updates = await store.listUpdates(state.lastUpdateId);
  for (const update of updates) {
    if (!hasAppliedUpdate(next.queue, update.id)) {
      applyUpdate(workspace, update.update);
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
  state: RemoteSyncState
): Promise<RemoteSyncState> {
  const queued = { ...state, queue: enqueueUpdate(state.queue, update), status: "syncing" as SyncStatus };
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

export async function compactRemoteSnapshot(store: RemoteStore, workspace: YjsWorkspace): Promise<void> {
  await store.writeSnapshot(encodeState(workspace), encodeStateVector(workspace));
}
