import type { Database } from "firebase/database";
import { child, get, ref, runTransaction } from "firebase/database";
import { base64ToBytes, bytesToBase64 } from "./remoteEncoding";
import { applyUpdate, createYjsWorkspace, encodeState, encodeStateVector } from "./yjsAdapter";
import { canReplaceRemoteSnapshot } from "./remoteSyncV2";
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
    private readonly userId: string,
    private readonly workspaceId = "root"
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

  async writeLatestSnapshot(record: RemoteSnapshotRecord): Promise<"accepted" | "rejected"> {
    const result = await runTransaction(this.snapshotRef(), (current: FirebaseRemoteSnapshotV2 | null) => {
      const currentRecord = current ? decodeRecord(current) : null;
      if (!canReplaceRemoteSnapshot(record, currentRecord)) {
        return;
      }
      return encodeRecord(record);
    });
    return result.committed ? "accepted" : "rejected";
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

    const workspace = createYjsWorkspace();
    if (legacySnapshot.exists()) {
      const value = legacySnapshot.val() as { state?: string; vector?: string; updatedAt?: number };
      state = value.state ?? null;
      vector = value.vector;
      updatedAt = value.updatedAt ?? updatedAt;
      if (state) {
        applyUpdate(workspace, base64ToBytes(state));
      }
    }
    if (legacyUpdates.exists()) {
      const updates = Object.values(legacyUpdates.val() as Record<string, FirebaseRemoteUpdateV1>).sort(
        (left, right) => left.createdAt - right.createdAt
      );
      for (const update of updates) {
        applyUpdate(workspace, base64ToBytes(update.update));
      }
      const latestUpdate = updates.at(-1);
      if (latestUpdate) {
        version = updates.length;
        clientId = latestUpdate.clientId;
        updatedAt = latestUpdate.createdAt;
      }
    }
    if (!state && !legacyUpdates.exists()) {
      return null;
    }
    return {
      version,
      clientId,
      updatedAt,
      state: encodeState(workspace),
      vector: vector ? base64ToBytes(vector) : encodeStateVector(workspace)
    };
  }

  private workspaceRef() {
    return ref(this.database, `users/${this.userId}/workspaces/${this.workspaceId}`);
  }

  private snapshotRef() {
    return child(this.workspaceRef(), "v2/snapshot");
  }
}

function encodeRecord(record: RemoteSnapshotRecord): FirebaseRemoteSnapshotV2 {
  const encoded: FirebaseRemoteSnapshotV2 = {
    version: record.version,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    state: bytesToBase64(record.state)
  };
  if (record.vector) {
    encoded.vector = bytesToBase64(record.vector);
  }
  return encoded;
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

export function isValidFirebasePathKey(value: string): boolean {
  return value.length > 0 && !/[.#$/[\]]/.test(value);
}
