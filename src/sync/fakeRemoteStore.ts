import type { RemoteStore, RemoteUpdate } from "./syncTypes";

export class FakeRemoteStore implements RemoteStore {
  private snapshot: Uint8Array | null = null;
  private updates = new Map<string, RemoteUpdate>();
  private subscribers = new Set<(update: RemoteUpdate) => void>();

  async readSnapshot(): Promise<Uint8Array | null> {
    return this.snapshot;
  }

  async writeSnapshot(snapshot: Uint8Array): Promise<void> {
    this.snapshot = snapshot;
  }

  async appendUpdate(update: RemoteUpdate): Promise<void> {
    this.updates.set(update.id, update);
    for (const subscriber of this.subscribers) {
      subscriber(update);
    }
  }

  async listUpdates(after?: string): Promise<RemoteUpdate[]> {
    const updates = Array.from(this.updates.values()).sort((a, b) => a.createdAt - b.createdAt);
    if (!after) {
      return updates;
    }
    const index = updates.findIndex((update) => update.id === after);
    return index >= 0 ? updates.slice(index + 1) : updates;
  }

  subscribe(onUpdate: (update: RemoteUpdate) => void): () => void {
    this.subscribers.add(onUpdate);
    return () => {
      this.subscribers.delete(onUpdate);
    };
  }
}
