import type { RemoteSnapshotPatchRecord, RemoteSnapshotRecord, RemoteStoreMetering, RemoteStoreV2 } from "./syncTypes";
import { base64ToBytes, bytesToBase64, estimateEncodedSnapshotBytes } from "./remoteEncoding";
import { canReplaceRemoteSnapshot } from "./remoteSyncV2";
import { applySnapshotPatch, estimateEncodedPatchBytes } from "./snapshotPatch";
import {
  createYjsWorkspace,
  encodeState,
  encodeStateVector,
  getYjsSnapshot,
  mergeIntoNewWorkspace,
  setYjsSnapshot
} from "./yjsAdapter";

type StoredRemoteSnapshotV2 = {
  version: number;
  clientId: string;
  updatedAt: number;
  state: string;
  vector?: string;
};

type StoredRemotePatchV2 = Omit<RemoteSnapshotPatchRecord, "patch"> & {
  patch: RemoteSnapshotPatchRecord["patch"];
};

type StoredRemoteUpdateV1 = {
  id: string;
  clientId: string;
  seq: number;
  update: string;
  createdAt: number;
};

type StoredRemoteStateV1 = {
  snapshot: string | null;
  vector: string | null;
  updates: StoredRemoteUpdateV1[];
};

export class BrowserRemoteStoreV2 implements RemoteStoreV2 {
  private readonly key: string;
  private readonly patchKey: string;
  private readonly legacyKey: string;
  private channel?: BroadcastChannel;
  private readonly subscribers = new Set<() => void>();
  private listening = false;
  private metering: RemoteStoreMetering = { readBytes: 0, writeBytes: 0, storedBytes: 0 };

  constructor(workspaceId: string) {
    this.key = `outliner:browser-remote:${workspaceId}:v2`;
    this.patchKey = `${this.key}:patch`;
    this.legacyKey = `outliner:browser-remote:${workspaceId}`;
  }

  async readLatestSnapshot(): Promise<RemoteSnapshotRecord | null> {
    const stored = this.readStoredSnapshot();
    if (stored) {
      const record = decodeRecord(stored);
      this.metering.readBytes += estimateEncodedSnapshotBytes(record);
      return record;
    }
    const legacy = this.readLegacySnapshot();
    if (!legacy) {
      return null;
    }
    const record = decodeRecord(legacy);
    await this.writeLatestSnapshot(record);
    return record;
  }

  async writeLatestSnapshot(record: RemoteSnapshotRecord): Promise<"accepted" | "rejected"> {
    const previous = this.readStoredSnapshot();
    if (!canReplaceRemoteSnapshot(record, previous ? decodeRecord(previous) : null)) {
      return "rejected";
    }
    const previousPatch = this.readStoredPatch();
    this.metering.writeBytes += estimateEncodedSnapshotBytes(record);
    this.metering.storedBytes -= previous ? estimateEncodedSnapshotBytes(decodeRecord(previous)) : 0;
    this.metering.storedBytes -= previousPatch ? estimateEncodedPatchBytes(previousPatch.patch) : 0;
    this.writeStoredSnapshot(encodeRecord(record));
    this.removeStoredPatch();
    this.metering.storedBytes += estimateEncodedSnapshotBytes(record);
    this.notify();
    this.channel?.postMessage({ type: "snapshot-written" });
    return "accepted";
  }

  async readSnapshotPatch(afterVersion: number): Promise<RemoteSnapshotPatchRecord | null> {
    const stored = this.readStoredPatch();
    if (!stored || stored.baseVersion !== afterVersion) {
      return null;
    }
    this.metering.readBytes += estimateEncodedPatchBytes(stored.patch);
    return clonePatchRecord(stored);
  }

  async writeSnapshotPatch(record: RemoteSnapshotPatchRecord): Promise<"accepted" | "rejected"> {
    const previous = this.readStoredSnapshot();
    if (!previous || previous.version !== record.baseVersion) {
      return "rejected";
    }
    const previousPatch = this.readStoredPatch();
    const next = materializePatch(decodeRecord(previous), record);
    this.metering.writeBytes += estimateEncodedPatchBytes(record.patch);
    this.metering.storedBytes -= estimateEncodedSnapshotBytes(decodeRecord(previous));
    this.metering.storedBytes -= previousPatch ? estimateEncodedPatchBytes(previousPatch.patch) : 0;
    this.writeStoredSnapshot(encodeRecord(next));
    this.writeStoredPatch(clonePatchRecord(record));
    this.metering.storedBytes += estimateEncodedSnapshotBytes(next) + estimateEncodedPatchBytes(record.patch);
    this.notify();
    this.channel?.postMessage({ type: "patch-written" });
    return "accepted";
  }

  subscribe(onSnapshotChanged: () => void): () => void {
    if (this.subscribers.size === 0) {
      this.attachListeners();
    }
    this.subscribers.add(onSnapshotChanged);
    return () => {
      this.subscribers.delete(onSnapshotChanged);
      if (this.subscribers.size === 0) {
        this.detachListeners();
      }
    };
  }

  getMetering(): RemoteStoreMetering {
    return { ...this.metering };
  }

  private readonly handleStorage = (event: StorageEvent) => {
    if (event.key === this.key || event.key === this.patchKey) {
      this.notify();
    }
  };

  private readonly handleBroadcast = () => {
    this.notify();
  };

  private notify(): void {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  private readStoredSnapshot(): StoredRemoteSnapshotV2 | null {
    const raw = window.localStorage.getItem(this.key);
    return raw ? (JSON.parse(raw) as StoredRemoteSnapshotV2) : null;
  }

  private writeStoredSnapshot(snapshot: StoredRemoteSnapshotV2): void {
    window.localStorage.setItem(this.key, JSON.stringify(snapshot));
  }

  private readStoredPatch(): StoredRemotePatchV2 | null {
    const raw = window.localStorage.getItem(this.patchKey);
    return raw ? (JSON.parse(raw) as StoredRemotePatchV2) : null;
  }

  private writeStoredPatch(patch: StoredRemotePatchV2): void {
    window.localStorage.setItem(this.patchKey, JSON.stringify(patch));
  }

  private removeStoredPatch(): void {
    window.localStorage.removeItem(this.patchKey);
  }

  private readLegacySnapshot(): StoredRemoteSnapshotV2 | null {
    const raw = window.localStorage.getItem(this.legacyKey);
    if (!raw) {
      return null;
    }
    const legacy = JSON.parse(raw) as StoredRemoteStateV1;
    const latestUpdate = [...legacy.updates].sort((a, b) => a.createdAt - b.createdAt).at(-1);
    const state = latestUpdate?.update ?? legacy.snapshot;
    if (!state) {
      return null;
    }
    return {
      version: legacy.updates.length,
      clientId: latestUpdate?.clientId ?? "legacy-browser",
      updatedAt: latestUpdate?.createdAt ?? Date.now(),
      state,
      vector: legacy.vector ?? undefined
    };
  }

  private attachListeners(): void {
    if (this.listening) {
      return;
    }
    this.channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(this.key);
    window.addEventListener("storage", this.handleStorage);
    this.channel?.addEventListener("message", this.handleBroadcast);
    this.listening = true;
  }

  private detachListeners(): void {
    if (!this.listening) {
      return;
    }
    window.removeEventListener("storage", this.handleStorage);
    this.channel?.removeEventListener("message", this.handleBroadcast);
    this.channel?.close();
    this.channel = undefined;
    this.listening = false;
  }
}

function encodeRecord(record: RemoteSnapshotRecord): StoredRemoteSnapshotV2 {
  return {
    version: record.version,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    state: bytesToBase64(record.state),
    vector: record.vector ? bytesToBase64(record.vector) : undefined
  };
}

function decodeRecord(record: StoredRemoteSnapshotV2): RemoteSnapshotRecord {
  return {
    version: record.version,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    state: base64ToBytes(record.state),
    vector: record.vector ? base64ToBytes(record.vector) : undefined
  };
}

function clonePatchRecord(record: RemoteSnapshotPatchRecord): RemoteSnapshotPatchRecord {
  return JSON.parse(JSON.stringify(record)) as RemoteSnapshotPatchRecord;
}

function materializePatch(snapshot: RemoteSnapshotRecord, patch: RemoteSnapshotPatchRecord): RemoteSnapshotRecord {
  const currentSnapshot = getYjsSnapshot(mergeIntoNewWorkspace(snapshot.state));
  if (!currentSnapshot) {
    return snapshot;
  }
  const nextSnapshot = applySnapshotPatch(currentSnapshot, patch.patch);
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
