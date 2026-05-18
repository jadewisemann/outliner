import type { OutlineSnapshotPatch } from "./snapshotPatch";

export type SyncStatus = "local-only" | "offline" | "syncing" | "synced" | "error" | "conflict";

export type RemoteUpdate = {
  id: string;
  clientId: string;
  seq: number;
  update: Uint8Array;
  createdAt: number;
};

export type RemoteSnapshotOptions = {
  compactThrough?: string;
};

export type RemoteListOptions = {
  limit?: number;
};

export type RemoteSubscribeOptions = {
  after?: string;
};

export type RemoteStoreMetering = {
  readBytes: number;
  writeBytes: number;
  storedBytes: number;
};

export type RemoteSnapshotWriteResult = "accepted" | "rejected";

export type RemoteSnapshotMetadata = {
  version: number;
  clientId: string;
  updatedAt: number;
};

export type RemoteSnapshotRecord = RemoteSnapshotMetadata & {
  state: Uint8Array;
  vector?: Uint8Array;
};

export type RemoteSnapshotPatchRecord = RemoteSnapshotMetadata & {
  baseVersion: number;
  patch: OutlineSnapshotPatch;
};

export type RemoteSyncV2State = {
  status: SyncStatus;
  version: number;
  updatedAt: number;
  hasPendingLocalChanges: boolean;
};

export interface RemoteStore {
  readSnapshot(): Promise<Uint8Array | null>;
  writeSnapshot(snapshot: Uint8Array, vector: Uint8Array, options?: RemoteSnapshotOptions): Promise<void>;
  appendUpdate(update: RemoteUpdate): Promise<void>;
  listUpdates(after?: string, options?: RemoteListOptions): Promise<RemoteUpdate[]>;
  subscribe(onUpdate: (update: RemoteUpdate) => void, options?: RemoteSubscribeOptions): () => void;
  getMetering?(): RemoteStoreMetering;
}

export interface RemoteStoreV2 {
  readLatestSnapshot(): Promise<RemoteSnapshotRecord | null>;
  writeLatestSnapshot(record: RemoteSnapshotRecord): Promise<RemoteSnapshotWriteResult>;
  readSnapshotPatch?(afterVersion: number): Promise<RemoteSnapshotPatchRecord | null>;
  writeSnapshotPatch?(record: RemoteSnapshotPatchRecord): Promise<RemoteSnapshotWriteResult>;
  subscribe?(onSnapshotChanged: () => void): () => void;
  getMetering?(): RemoteStoreMetering;
}
