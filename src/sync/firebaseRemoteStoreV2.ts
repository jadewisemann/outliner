import type { Database } from "firebase/database";
import { child, get, onValue, ref, set } from "firebase/database";
import { base64ToBytes, bytesToBase64 } from "./remoteEncoding";
import type { RemoteSnapshotRecord, RemoteStoreV2 } from "./syncTypes";

type FirebaseRemoteSnapshotV2 = {
  version: number;
  clientId: string;
  updatedAt: number;
  state: string;
  vector?: string;
};

type FirebaseRemoteUpdateV1 = {
  clientId: string;
  seq: number;
  update: string;
  createdAt: number;
};

export class FirebaseRemoteStoreV2 implements RemoteStoreV2 {
  constructor(
    private readonly database: Database,
    private readonly userId: string
  ) {}

  async readLatestSnapshot(): Promise<RemoteSnapshotRecord | null> {
    const snapshot = await get(this.snapshotRef());
    if (snapshot.exists()) {
      return decodeRecord(snapshot.val() as FirebaseRemoteSnapshotV2);
    }
    const legacy = await this.readLegacySnapshot();
    if (!legacy) {
      return null;
    }
    await this.writeLatestSnapshot(legacy);
    return legacy;
  }

  async writeLatestSnapshot(record: RemoteSnapshotRecord): Promise<void> {
    const current = await get(this.snapshotRef());
    if (current.exists() && record.version < (current.val() as FirebaseRemoteSnapshotV2).version) {
      return;
    }
    await set(this.snapshotRef(), encodeRecord(record));
  }

  subscribe(onSnapshotChanged: () => void): () => void {
    return onValue(this.snapshotRef(), () => {
      onSnapshotChanged();
    });
  }

  private async readLegacySnapshot(): Promise<RemoteSnapshotRecord | null> {
    const workspaceRef = this.workspaceRef();
    const legacySnapshot = await get(child(workspaceRef, "snapshot"));
    const legacyUpdates = await get(child(workspaceRef, "updates"));
    let state: string | null = null;
    let vector: string | undefined;
    let version = 0;
    let clientId = "legacy-firebase";
    let updatedAt = Date.now();

    if (legacySnapshot.exists()) {
      const value = legacySnapshot.val() as { state?: string; vector?: string; updatedAt?: number };
      state = value.state ?? null;
      vector = value.vector;
      updatedAt = value.updatedAt ?? updatedAt;
    }
    if (legacyUpdates.exists()) {
      const updates = Object.values(legacyUpdates.val() as Record<string, FirebaseRemoteUpdateV1>).sort(
        (left, right) => left.createdAt - right.createdAt
      );
      const latest = updates.at(-1);
      if (latest) {
        state = latest.update;
        version = updates.length;
        clientId = latest.clientId;
        updatedAt = latest.createdAt;
      }
    }
    if (!state) {
      return null;
    }
    return {
      version,
      clientId,
      updatedAt,
      state: base64ToBytes(state),
      vector: vector ? base64ToBytes(vector) : undefined
    };
  }

  private workspaceRef() {
    return ref(this.database, `users/${this.userId}/workspaces/root`);
  }

  private snapshotRef() {
    return child(this.workspaceRef(), "v2/snapshot");
  }
}

function encodeRecord(record: RemoteSnapshotRecord): FirebaseRemoteSnapshotV2 {
  return {
    version: record.version,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    state: bytesToBase64(record.state),
    vector: record.vector ? bytesToBase64(record.vector) : undefined
  };
}

function decodeRecord(record: FirebaseRemoteSnapshotV2): RemoteSnapshotRecord {
  return {
    version: record.version,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    state: base64ToBytes(record.state),
    vector: record.vector ? base64ToBytes(record.vector) : undefined
  };
}
