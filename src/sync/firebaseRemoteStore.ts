import type { Database } from "firebase/database";
import {
  child,
  get,
  off,
  onChildAdded,
  push,
  ref,
  set
} from "firebase/database";
import type { RemoteStore, RemoteUpdate } from "./syncTypes";

type FirebaseRemoteUpdate = {
  clientId: string;
  seq: number;
  update: string;
  createdAt: number;
};

export class FirebaseRemoteStore implements RemoteStore {
  constructor(
    private readonly database: Database,
    private readonly userId: string
  ) {}

  async readSnapshot(): Promise<Uint8Array | null> {
    const snapshot = await get(child(this.workspaceRef(), "snapshot/state"));
    return snapshot.exists() ? base64ToBytes(snapshot.val() as string) : null;
  }

  async writeSnapshot(snapshot: Uint8Array, vector: Uint8Array): Promise<void> {
    await set(child(this.workspaceRef(), "snapshot"), {
      state: bytesToBase64(snapshot),
      vector: bytesToBase64(vector),
      updatedAt: Date.now()
    });
  }

  async appendUpdate(update: RemoteUpdate): Promise<void> {
    const updatesRef = child(this.workspaceRef(), "updates");
    const updateRef = push(updatesRef);
    await set(updateRef, {
      clientId: update.clientId,
      seq: update.seq,
      update: bytesToBase64(update.update),
      createdAt: update.createdAt
    } satisfies FirebaseRemoteUpdate);
  }

  async listUpdates(after?: string): Promise<RemoteUpdate[]> {
    const snapshot = await get(child(this.workspaceRef(), "updates"));
    if (!snapshot.exists()) {
      return [];
    }
    const value = snapshot.val() as Record<string, FirebaseRemoteUpdate>;
    const updates = Object.entries(value)
      .map(([id, update]) => ({
        id,
        clientId: update.clientId,
        seq: update.seq,
        update: base64ToBytes(update.update),
        createdAt: update.createdAt
      }))
      .sort((a, b) => a.createdAt - b.createdAt);
    if (!after) {
      return updates;
    }
    const index = updates.findIndex((update) => update.id === after);
    return index >= 0 ? updates.slice(index + 1) : updates;
  }

  subscribe(onUpdate: (update: RemoteUpdate) => void): () => void {
    const updatesRef = child(this.workspaceRef(), "updates");
    const unsubscribe = onChildAdded(updatesRef, (snapshot) => {
      const value = snapshot.val() as FirebaseRemoteUpdate;
      onUpdate({
        id: snapshot.key ?? crypto.randomUUID(),
        clientId: value.clientId,
        seq: value.seq,
        update: base64ToBytes(value.update),
        createdAt: value.createdAt
      });
    });
    return unsubscribe;
  }

  private workspaceRef() {
    return ref(this.database, `users/${this.userId}/workspaces/root`);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
