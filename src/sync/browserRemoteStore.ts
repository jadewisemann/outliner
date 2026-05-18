import type { RemoteStore, RemoteUpdate } from "./syncTypes";

type StoredRemoteUpdate = {
  id: string;
  clientId: string;
  seq: number;
  update: string;
  createdAt: number;
};

type StoredRemoteState = {
  snapshot: string | null;
  vector: string | null;
  updates: StoredRemoteUpdate[];
};

export class BrowserRemoteStore implements RemoteStore {
  private readonly key: string;
  private readonly channel?: BroadcastChannel;
  private readonly subscribers = new Set<(update: RemoteUpdate) => void>();
  private readonly seenUpdateIds = new Set<string>();

  constructor(workspaceId: string) {
    this.key = `outliner:browser-remote:${workspaceId}`;
    this.channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(this.key);
    window.addEventListener("storage", this.handleStorage);
    this.channel?.addEventListener("message", this.handleBroadcast);
  }

  async readSnapshot(): Promise<Uint8Array | null> {
    const state = this.readState();
    return state.snapshot ? base64ToBytes(state.snapshot) : null;
  }

  async writeSnapshot(snapshot: Uint8Array, vector: Uint8Array): Promise<void> {
    const state = this.readState();
    this.writeState({
      ...state,
      snapshot: bytesToBase64(snapshot),
      vector: bytesToBase64(vector)
    });
  }

  async appendUpdate(update: RemoteUpdate): Promise<void> {
    const state = this.readState();
    if (!state.updates.some((stored) => stored.id === update.id)) {
      state.updates.push({
        id: update.id,
        clientId: update.clientId,
        seq: update.seq,
        update: bytesToBase64(update.update),
        createdAt: update.createdAt
      });
      this.writeState(state);
    }
    this.notify(update);
    this.channel?.postMessage({ type: "update-appended" });
  }

  async listUpdates(after?: string): Promise<RemoteUpdate[]> {
    const updates = this.readState()
      .updates.map((update) => ({
        id: update.id,
        clientId: update.clientId,
        seq: update.seq,
        update: base64ToBytes(update.update),
        createdAt: update.createdAt
      }))
      .sort((left, right) => left.createdAt - right.createdAt);
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
      if (this.subscribers.size === 0) {
        window.removeEventListener("storage", this.handleStorage);
        this.channel?.removeEventListener("message", this.handleBroadcast);
        this.channel?.close();
      }
    };
  }

  private readonly handleStorage = (event: StorageEvent) => {
    if (event.key === this.key) {
      this.notifyUnseenUpdates();
    }
  };

  private readonly handleBroadcast = () => {
    this.notifyUnseenUpdates();
  };

  private notifyUnseenUpdates(): void {
    for (const update of this.readState().updates) {
      if (this.seenUpdateIds.has(update.id)) {
        continue;
      }
      this.notify({
        id: update.id,
        clientId: update.clientId,
        seq: update.seq,
        update: base64ToBytes(update.update),
        createdAt: update.createdAt
      });
    }
  }

  private notify(update: RemoteUpdate): void {
    if (this.seenUpdateIds.has(update.id)) {
      return;
    }
    this.seenUpdateIds.add(update.id);
    for (const subscriber of this.subscribers) {
      subscriber(update);
    }
  }

  private readState(): StoredRemoteState {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) {
      return { snapshot: null, vector: null, updates: [] };
    }
    return JSON.parse(raw) as StoredRemoteState;
  }

  private writeState(state: StoredRemoteState): void {
    window.localStorage.setItem(this.key, JSON.stringify(state));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
