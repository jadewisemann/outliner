import type { RemoteSnapshotRecord, RemoteStoreMetering, RemoteStoreV2 } from "./syncTypes";
import { canReplaceRemoteSnapshot } from "./remoteSyncV2";
import { estimateEncodedSnapshotBytes } from "./remoteEncoding";

export class FakeRemoteStoreV2 implements RemoteStoreV2 {
  private snapshot: RemoteSnapshotRecord | null = null;
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
    this.snapshot = cloneRecord(record);
    this.metering.storedBytes += estimateEncodedSnapshotBytes(record);
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
