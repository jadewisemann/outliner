import type { Database } from "firebase/database";
import {
  child,
  endAt,
  get,
  limitToFirst,
  onChildAdded,
  orderByKey,
  query,
  ref,
  remove,
  set,
  startAfter
} from "firebase/database";
import type { RemoteListOptions, RemoteSnapshotOptions, RemoteStore, RemoteUpdate } from "./syncTypes";
import { base64ToBytes, bytesToBase64 } from "./remoteEncoding";

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

  async writeSnapshot(snapshot: Uint8Array, vector: Uint8Array, options?: RemoteSnapshotOptions): Promise<void> {
    await set(child(this.workspaceRef(), "snapshot"), {
      state: bytesToBase64(snapshot),
      vector: bytesToBase64(vector),
      updatedAt: Date.now()
    });
    if (options?.compactThrough) {
      await this.deleteUpdatesThrough(options.compactThrough);
    }
  }

  async appendUpdate(update: RemoteUpdate): Promise<void> {
    const updatesRef = child(this.workspaceRef(), "updates");
    const updateRef = child(updatesRef, update.id);
    await set(updateRef, {
      clientId: update.clientId,
      seq: update.seq,
      update: bytesToBase64(update.update),
      createdAt: update.createdAt
    } satisfies FirebaseRemoteUpdate);
  }

  async listUpdates(after?: string, options?: RemoteListOptions): Promise<RemoteUpdate[]> {
    const updatesRef = child(this.workspaceRef(), "updates");
    const updatesQuery = query(
      updatesRef,
      orderByKey(),
      ...(after ? [startAfter(after)] : []),
      ...(typeof options?.limit === "number" ? [limitToFirst(options.limit)] : [])
    );
    const snapshot = await get(updatesQuery);
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
    return updates;
  }

  subscribe(onUpdate: (update: RemoteUpdate) => void, options?: { after?: string }): () => void {
    const updatesRef = child(this.workspaceRef(), "updates");
    const updatesQuery = query(updatesRef, orderByKey(), ...(options?.after ? [startAfter(options.after)] : []));
    const unsubscribe = onChildAdded(updatesQuery, (snapshot) => {
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

  private async deleteUpdatesThrough(updateId: string): Promise<void> {
    const updatesRef = child(this.workspaceRef(), "updates");
    const snapshot = await get(query(updatesRef, orderByKey(), endAt(updateId)));
    if (!snapshot.exists()) {
      return;
    }
    await Promise.all(
      Object.keys(snapshot.val() as Record<string, FirebaseRemoteUpdate>).map((id) => remove(child(updatesRef, id)))
    );
  }
}

export { base64ToBytes, bytesToBase64 };
