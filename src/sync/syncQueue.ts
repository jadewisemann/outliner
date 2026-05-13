import type { RemoteUpdate } from "./syncTypes";

export type SyncQueueState = {
  pending: RemoteUpdate[];
  appliedIds: string[];
};

export function createSyncQueueState(): SyncQueueState {
  return { pending: [], appliedIds: [] };
}

export function enqueueUpdate(state: SyncQueueState, update: RemoteUpdate): SyncQueueState {
  if (state.pending.some((item) => item.id === update.id)) {
    return state;
  }
  return {
    ...state,
    pending: [...state.pending, update].sort((a, b) => a.seq - b.seq)
  };
}

export function markUpdateApplied(state: SyncQueueState, updateId: string): SyncQueueState {
  if (state.appliedIds.includes(updateId)) {
    return state;
  }
  return {
    pending: state.pending.filter((item) => item.id !== updateId),
    appliedIds: [...state.appliedIds, updateId]
  };
}

export function hasAppliedUpdate(state: SyncQueueState, updateId: string): boolean {
  return state.appliedIds.includes(updateId);
}
