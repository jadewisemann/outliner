import type { Database, DataSnapshot } from "firebase/database";
import { child, get, ref, runTransaction } from "firebase/database";
import { base64ToBytes, bytesToBase64 } from "./remoteEncoding";
import { applyUpdate, createYjsWorkspace, encodeState, encodeStateVector, getYjsSnapshot, mergeIntoNewWorkspace, setYjsSnapshot } from "./yjsAdapter";
import { canReplaceRemoteSnapshot } from "./remoteSyncV2";
import type { RemoteSnapshotPatchRecord, RemoteSnapshotRecord, RemoteStoreV2 } from "./syncTypes";
import { applySnapshotPatchToStored } from "./snapshotPatch";

type FirebaseRemoteSnapshotV2 = {
  version: number;
  clientId: string;
  updatedAt: number;
  state: string;
  vector?: string;
};

type FirebaseRemotePatchV2 = Omit<RemoteSnapshotPatchRecord, "patch"> & {
  patch: RemoteSnapshotPatchRecord["patch"];
};

type FirebaseRemoteStateV2 = {
  snapshot?: FirebaseRemoteSnapshotV2;
  patch?: FirebaseRemotePatchV2 | null;
};

type FirebaseRemoteUpdateV1 = {
  clientId: string;
  seq: number;
  update: string;
  createdAt: number;
};

type LegacySnapshotState = {
  state: string | null;
  vector?: string;
  updatedAt: number;
};

type LegacyUpdateState = {
  version: number;
  clientId: string;
  updatedAt?: number;
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
    const result = await runTransaction(this.v2Ref(), (current: FirebaseRemoteStateV2 | null) => {
      const currentRecord = current?.snapshot ? decodeRecord(current.snapshot) : null;
      if (!canReplaceRemoteSnapshot(record, currentRecord)) {
        return;
      }
      return { ...(current ?? {}), snapshot: encodeRecord(record), patch: null };
    });
    return result.committed ? "accepted" : "rejected";
  }

  async readSnapshotPatch(afterVersion: number): Promise<RemoteSnapshotPatchRecord | null> {
    const snapshot = await get(this.patchRef());
    if (!snapshot.exists()) {
      return null;
    }
    const record = decodePatchRecord(snapshot.val() as FirebaseRemotePatchV2);
    return record.baseVersion === afterVersion ? record : null;
  }

  async writeSnapshotPatch(record: RemoteSnapshotPatchRecord): Promise<"accepted" | "rejected"> {
    const result = await runTransaction(this.v2Ref(), (current: FirebaseRemoteStateV2 | null) => {
      if (!current?.snapshot || current.snapshot.version !== record.baseVersion) {
        return;
      }
      const currentRecord = decodeRecord(current.snapshot);
      const nextRecord = materializePatch(currentRecord, record);
      return {
        ...(current ?? {}),
        snapshot: encodeRecord(nextRecord),
        patch: encodePatchRecord(record)
      };
    });
    return result.committed ? "accepted" : "rejected";
  }

  private async readLegacySnapshot(): Promise<RemoteSnapshotRecord | null> {
    const workspaceRef = this.workspaceRef();
    const legacySnapshot = await get(child(workspaceRef, "snapshot"));
    const legacyUpdates = await get(child(workspaceRef, "updates"));
    const workspace = createYjsWorkspace();
    const snapshotState = applyLegacySnapshot(workspace, legacySnapshot);
    const updateState = applyLegacyUpdates(workspace, legacyUpdates);
    if (!snapshotState.state && !legacyUpdates.exists()) {
      return null;
    }
    return {
      version: updateState.version,
      clientId: updateState.clientId,
      updatedAt: updateState.updatedAt ?? snapshotState.updatedAt,
      state: encodeState(workspace),
      vector: snapshotState.vector ? base64ToBytes(snapshotState.vector) : encodeStateVector(workspace)
    };
  }

  private workspaceRef() {
    return ref(this.database, `users/${this.userId}/workspaces/${this.workspaceId}`);
  }

  private snapshotRef() {
    return child(this.workspaceRef(), "v2/snapshot");
  }

  private patchRef() {
    return child(this.workspaceRef(), "v2/patch");
  }

  private v2Ref() {
    return child(this.workspaceRef(), "v2");
  }
}

function applyLegacySnapshot(workspace: ReturnType<typeof createYjsWorkspace>, snapshot: DataSnapshot): LegacySnapshotState {
  const initial = { state: null, updatedAt: Date.now() };
  if (!snapshot.exists()) {
    return initial;
  }
  const value = snapshot.val() as { state?: string; vector?: string; updatedAt?: number };
  const state = value.state ?? null;
  if (state) {
    applyUpdate(workspace, base64ToBytes(state));
  }
  return {
    state,
    vector: value.vector,
    updatedAt: value.updatedAt ?? initial.updatedAt
  };
}

function applyLegacyUpdates(workspace: ReturnType<typeof createYjsWorkspace>, updatesSnapshot: DataSnapshot): LegacyUpdateState {
  if (!updatesSnapshot.exists()) {
    return { version: 0, clientId: "legacy-firebase" };
  }
  const updates = Object.values(updatesSnapshot.val() as Record<string, FirebaseRemoteUpdateV1>).sort(
    (left, right) => left.createdAt - right.createdAt
  );
  for (const update of updates) {
    applyUpdate(workspace, base64ToBytes(update.update));
  }
  const latestUpdate = updates.at(-1);
  return latestUpdate
    ? { version: updates.length, clientId: latestUpdate.clientId, updatedAt: latestUpdate.createdAt }
    : { version: 0, clientId: "legacy-firebase" };
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

function encodePatchRecord(record: RemoteSnapshotPatchRecord): FirebaseRemotePatchV2 {
  return JSON.parse(JSON.stringify(record)) as FirebaseRemotePatchV2;
}

function decodePatchRecord(record: FirebaseRemotePatchV2): RemoteSnapshotPatchRecord {
  return JSON.parse(JSON.stringify(record)) as RemoteSnapshotPatchRecord;
}

function materializePatch(snapshot: RemoteSnapshotRecord, patch: RemoteSnapshotPatchRecord): RemoteSnapshotRecord {
  const currentSnapshot = getYjsSnapshot(mergeIntoNewWorkspace(snapshot.state));
  if (!currentSnapshot) {
    return snapshot;
  }
  const nextSnapshot = applySnapshotPatchToStored(currentSnapshot, patch.patch);
  const workspace = createYjsWorkspace();
  setYjsSnapshot(workspace, nextSnapshot);
  return {
    version: patch.version,
    clientId: patch.clientId,
    updatedAt: patch.updatedAt,
    state: encodeState(workspace),
    vector: encodeStateVector(workspace)
  };
}

export function isValidFirebasePathKey(value: string): boolean {
  return value.length > 0 && !/[.#$/[\]]/.test(value);
}
