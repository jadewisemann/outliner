import {
  encodeState,
  encodeStateVector,
  getYjsSnapshot,
  mergeIntoNewWorkspace,
  setYjsSnapshot,
  type YjsWorkspace
} from "./yjsAdapter";
import type {
  RemoteSnapshotPatchRecord,
  RemoteSnapshotRecord,
  RemoteStoreV2,
  RemoteSyncV2State,
  SyncStatus
} from "./syncTypes";
import { estimateEncodedPatchBytes } from "./snapshotPatch";

export const DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET = 256 * 1024;

export function createRemoteSyncV2State(): RemoteSyncV2State {
  return {
    status: "local-only",
    version: 0,
    updatedAt: 0,
    hasPendingLocalChanges: false
  };
}

export function createRemoteSnapshotRecord(
  workspace: YjsWorkspace,
  clientId: string,
  version: number,
  updatedAt: number
): RemoteSnapshotRecord {
  return {
    version,
    clientId,
    updatedAt,
    state: encodeState(workspace),
    vector: encodeStateVector(workspace)
  };
}

export async function writeRemoteSnapshotV2(
  store: RemoteStoreV2,
  record: RemoteSnapshotRecord,
  maxSnapshotBytes = DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET
): Promise<SyncStatus> {
  if (record.state.byteLength > maxSnapshotBytes) {
    return "error";
  }
  try {
    const result = await store.writeLatestSnapshot(record);
    return result === "accepted" ? "synced" : "conflict";
  } catch {
    return "offline";
  }
}

export async function writeRemoteSnapshotPatchV2(
  store: RemoteStoreV2,
  record: RemoteSnapshotPatchRecord,
  maxPatchBytes = DEFAULT_REMOTE_SNAPSHOT_BYTE_BUDGET
): Promise<SyncStatus> {
  if (!store.writeSnapshotPatch) {
    return "error";
  }
  if (estimateEncodedPatchBytes(record.patch) > maxPatchBytes) {
    return "error";
  }
  try {
    const result = await store.writeSnapshotPatch(record);
    return result === "accepted" ? "synced" : "conflict";
  } catch {
    return "offline";
  }
}

export function canReplaceRemoteSnapshot(incoming: RemoteSnapshotRecord, current: RemoteSnapshotRecord | null): boolean {
  if (!current) {
    return true;
  }
  if (incoming.version > current.version) {
    return true;
  }
  return incoming.version === current.version && incoming.clientId === current.clientId;
}

export function applyRemoteSnapshotRecord(workspace: YjsWorkspace, record: RemoteSnapshotRecord): void {
  const incoming = mergeIntoNewWorkspace(record.state);
  const snapshot = getYjsSnapshot(incoming);
  if (snapshot) {
    setYjsSnapshot(workspace, snapshot);
  }
}
