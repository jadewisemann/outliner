import type { RemoteSnapshotPatchRecord, RemoteSnapshotRecord, RemoteStoreMetering, RemoteStoreV2 } from "./syncTypes";
import { canReplaceRemoteSnapshot } from "./remoteSyncV2";
import { estimateEncodedSnapshotBytes } from "./remoteEncoding";
import { applySnapshotPatch, estimateEncodedPatchBytes } from "./snapshotPatch";
import {
  createYjsWorkspace,
  encodeState,
  encodeStateVector,
  getYjsSnapshot,
  mergeIntoNewWorkspace,
  setYjsSnapshot
} from "./yjsAdapter";

export class FakeRemoteStoreV2 implements RemoteStoreV2 {
  private snapshot: RemoteSnapshotRecord | null = null;
  private latestPatch: RemoteSnapshotPatchRecord | null = null;
  private subscribers = new Set<() => void>();
  private writeFailures = 0;
  private metering: RemoteStoreMetering = { readBytes: 0, writeBytes: 0, storedBytes: 0 };

  async readLatestSnapshot(): Promise<RemoteSnapshotRecord | null> {
    this.metering.readBytes += this.snapshot ? estimateEncodedSnapshotBytes(this.snapshot) : 0;
    return this.snapshot ? cloneRecord(this.snapshot) : null;
  }

  async writeLatestSnapshot(record: RemoteSnapshotRecord): Promise<"accepted" | "rejected"> {
    if (this.writeFailures > 0) {
      this.writeFailures -= 1;
      throw new Error("Fake remote v2 write failed");
    }
    if (!canReplaceRemoteSnapshot(record, this.snapshot)) {
      return "rejected";
    }
    this.metering.writeBytes += estimateEncodedSnapshotBytes(record);
    this.metering.storedBytes -= this.snapshot ? estimateEncodedSnapshotBytes(this.snapshot) : 0;
    this.metering.storedBytes -= this.latestPatch ? estimateEncodedPatchBytes(this.latestPatch.patch) : 0;
    this.snapshot = cloneRecord(record);
    this.latestPatch = null;
    this.metering.storedBytes += estimateEncodedSnapshotBytes(record);
    for (const subscriber of this.subscribers) {
      subscriber();
    }
    return "accepted";
  }

  async readSnapshotPatch(afterVersion: number): Promise<RemoteSnapshotPatchRecord | null> {
    if (!this.latestPatch || this.latestPatch.baseVersion !== afterVersion) {
      return null;
    }
    this.metering.readBytes += estimateEncodedPatchBytes(this.latestPatch.patch);
    return clonePatchRecord(this.latestPatch);
  }

  async writeSnapshotPatch(record: RemoteSnapshotPatchRecord): Promise<"accepted" | "rejected"> {
    if (this.writeFailures > 0) {
      this.writeFailures -= 1;
      throw new Error("Fake remote v2 write failed");
    }
    if (!this.snapshot || record.baseVersion !== this.snapshot.version) {
      return "rejected";
    }
    const previousSnapshotBytes = estimateEncodedSnapshotBytes(this.snapshot);
    const previousPatchBytes = this.latestPatch ? estimateEncodedPatchBytes(this.latestPatch.patch) : 0;
    const workspace = createYjsWorkspace();
    const currentSnapshot = getYjsSnapshot(mergeIntoNewWorkspace(this.snapshot.state));
    if (!currentSnapshot) {
      return "rejected";
    }
    const nextSnapshot = applySnapshotPatch(currentSnapshot, record.patch);
    setYjsSnapshot(workspace, nextSnapshot);
    this.metering.writeBytes += estimateEncodedPatchBytes(record.patch);
    this.metering.storedBytes -= previousSnapshotBytes + previousPatchBytes;
    this.snapshot = {
      version: record.version,
      clientId: record.clientId,
      updatedAt: record.updatedAt,
      state: encodeState(workspace),
      vector: encodeStateVector(workspace)
    };
    this.latestPatch = clonePatchRecord(record);
    this.metering.storedBytes += estimateEncodedSnapshotBytes(this.snapshot) + estimateEncodedPatchBytes(record.patch);
    for (const subscriber of this.subscribers) {
      subscriber();
    }
    return "accepted";
  }

  subscribe(onSnapshotChanged: () => void): () => void {
    this.subscribers.add(onSnapshotChanged);
    return () => {
      this.subscribers.delete(onSnapshotChanged);
    };
  }

  failNextWrite(): void {
    this.writeFailures += 1;
  }

  getMetering(): RemoteStoreMetering {
    return { ...this.metering };
  }
}

function cloneRecord(record: RemoteSnapshotRecord): RemoteSnapshotRecord {
  return {
    ...record,
    state: new Uint8Array(record.state),
    vector: record.vector ? new Uint8Array(record.vector) : undefined
  };
}

function clonePatchRecord(record: RemoteSnapshotPatchRecord): RemoteSnapshotPatchRecord {
  return JSON.parse(JSON.stringify(record)) as RemoteSnapshotPatchRecord;
}
