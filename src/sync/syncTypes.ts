export type SyncStatus = "local-only" | "offline" | "syncing" | "synced" | "error";

export type RemoteUpdate = {
  id: string;
  clientId: string;
  seq: number;
  update: Uint8Array;
  createdAt: number;
};

export interface RemoteStore {
  readSnapshot(): Promise<Uint8Array | null>;
  writeSnapshot(snapshot: Uint8Array, vector: Uint8Array): Promise<void>;
  appendUpdate(update: RemoteUpdate): Promise<void>;
  listUpdates(after?: string): Promise<RemoteUpdate[]>;
  subscribe(onUpdate: (update: RemoteUpdate) => void): () => void;
}
