import type { RemoteListOptions, RemoteSnapshotOptions, RemoteStore, RemoteStoreMetering, RemoteUpdate } from "./syncTypes";

export class FakeRemoteStore implements RemoteStore {
  private snapshot: Uint8Array | null = null;
  private updates = new Map<string, RemoteUpdate>();
  private subscribers = new Set<(update: RemoteUpdate) => void>();
  private appendFailures = 0;
  private metering: RemoteStoreMetering = { readBytes: 0, writeBytes: 0, storedBytes: 0 };

  async readSnapshot(): Promise<Uint8Array | null> {
    this.metering.readBytes += this.snapshot?.byteLength ?? 0;
    return this.snapshot;
  }

  async writeSnapshot(snapshot: Uint8Array, _vector?: Uint8Array, options?: RemoteSnapshotOptions): Promise<void> {
    this.metering.writeBytes += snapshot.byteLength;
    this.metering.storedBytes -= this.snapshot?.byteLength ?? 0;
    this.snapshot = snapshot;
    this.metering.storedBytes += snapshot.byteLength;
    if (options?.compactThrough) {
      this.deleteUpdatesThrough(options.compactThrough);
    }
  }

  async appendUpdate(update: RemoteUpdate): Promise<void> {
    if (this.appendFailures > 0) {
      this.appendFailures -= 1;
      throw new Error("Fake remote append failed");
    }
    const previous = this.updates.get(update.id);
    this.metering.writeBytes += update.update.byteLength;
    if (!previous) {
      this.metering.storedBytes += update.update.byteLength;
    }
    this.updates.set(update.id, update);
    for (const subscriber of this.subscribers) {
      subscriber(update);
    }
  }

  async listUpdates(after?: string, options?: RemoteListOptions): Promise<RemoteUpdate[]> {
    const updates = Array.from(this.updates.values()).sort((a, b) => a.createdAt - b.createdAt);
    const filtered = after ? updates.slice(updates.findIndex((update) => update.id === after) + 1) : updates;
    const result = typeof options?.limit === "number" ? filtered.slice(0, options.limit) : filtered;
    this.metering.readBytes += result.reduce((total, update) => total + update.update.byteLength, 0);
    return result;
  }

  subscribe(onUpdate: (update: RemoteUpdate) => void, options?: { after?: string }): () => void {
    const ignoredIds = new Set<string>();
    if (options?.after) {
      const updates = Array.from(this.updates.values()).sort((a, b) => a.createdAt - b.createdAt);
      const cursorIndex = updates.findIndex((update) => update.id === options.after);
      for (const update of cursorIndex >= 0 ? updates.slice(0, cursorIndex + 1) : []) {
        ignoredIds.add(update.id);
      }
    }
    const subscriber = (update: RemoteUpdate) => {
      if (ignoredIds.has(update.id)) {
        return;
      }
      onUpdate(update);
    };
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  failNextAppend(): void {
    this.appendFailures += 1;
  }

  getMetering(): RemoteStoreMetering {
    return { ...this.metering };
  }

  private deleteUpdatesThrough(updateId: string): void {
    const updates = Array.from(this.updates.values()).sort((a, b) => a.createdAt - b.createdAt);
    const cursorIndex = updates.findIndex((update) => update.id === updateId);
    for (const update of cursorIndex >= 0 ? updates.slice(0, cursorIndex + 1) : []) {
      this.updates.delete(update.id);
      this.metering.storedBytes -= update.update.byteLength;
    }
  }
}
