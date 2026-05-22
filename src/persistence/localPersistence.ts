import type { StoredSnapshot } from "../domain/outlineTypes";
import { normalizePreferences, type PreferenceSettings } from "../app/preferences";

export type SnapshotHistoryEntry = {
  id: string;
  createdAt: number;
  reason: "autosave" | "restore" | "conflict";
  snapshot: StoredSnapshot;
};

export interface LocalPersistence {
  load(): Promise<StoredSnapshot | null>;
  save(snapshot: StoredSnapshot): Promise<void>;
  clear(): Promise<void>;
  listSnapshotHistory(): Promise<SnapshotHistoryEntry[]>;
  saveSnapshotHistory(entry: SnapshotHistoryEntry): Promise<void>;
  clearSnapshotHistory(): Promise<void>;
  loadPreferences(): Promise<PreferenceSettings>;
  savePreferences(preferences: PreferenceSettings): Promise<void>;
  loadConflictBackup(): Promise<StoredSnapshot | null>;
  saveConflictBackup(snapshot: StoredSnapshot): Promise<void>;
  clearConflictBackup(): Promise<void>;
}

export function createBrowserLocalPersistence(name: string): LocalPersistence {
  const key = `outliner:${name}`;
  const conflictKey = `${key}:conflict`;
  const historyKey = `${key}:history`;
  const preferencesKey = `${key}:preferences`;
  return {
    async load() {
      if (!hasIndexedDb()) {
        return loadFromLocalStorage<StoredSnapshot>(key);
      }
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readonly");
        const request = tx.objectStore("snapshots").get(key);
        request.onsuccess = () => resolve((request.result as StoredSnapshot | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    },
    async save(snapshot) {
      if (!hasIndexedDb()) {
        saveToLocalStorage(key, snapshot);
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(snapshot, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async clear() {
      if (!hasIndexedDb()) {
        window.localStorage.removeItem(key);
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async listSnapshotHistory() {
      if (!hasIndexedDb()) {
        return loadHistoryFromLocalStorage(historyKey);
      }
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readonly");
        const request = tx.objectStore("snapshots").get(historyKey);
        request.onsuccess = () => resolve(normalizeHistory(request.result));
        request.onerror = () => reject(request.error);
      });
    },
    async saveSnapshotHistory(entry) {
      const history = [entry, ...(await this.listSnapshotHistory()).filter((item) => item.id !== entry.id)].slice(0, 50);
      if (!hasIndexedDb()) {
        window.localStorage.setItem(historyKey, JSON.stringify(history));
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(history, historyKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async clearSnapshotHistory() {
      if (!hasIndexedDb()) {
        window.localStorage.removeItem(historyKey);
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").delete(historyKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async loadPreferences() {
      if (!hasIndexedDb()) {
        return normalizePreferences(loadFromLocalStorage<PreferenceSettings>(preferencesKey));
      }
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readonly");
        const request = tx.objectStore("snapshots").get(preferencesKey);
        request.onsuccess = () => resolve(normalizePreferences(request.result as PreferenceSettings | undefined));
        request.onerror = () => reject(request.error);
      });
    },
    async savePreferences(preferences) {
      const normalized = normalizePreferences(preferences);
      if (!hasIndexedDb()) {
        window.localStorage.setItem(preferencesKey, JSON.stringify(normalized));
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(normalized, preferencesKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async loadConflictBackup() {
      if (!hasIndexedDb()) {
        return loadFromLocalStorage<StoredSnapshot>(conflictKey);
      }
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readonly");
        const request = tx.objectStore("snapshots").get(conflictKey);
        request.onsuccess = () => resolve((request.result as StoredSnapshot | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    },
    async saveConflictBackup(snapshot) {
      if (!hasIndexedDb()) {
        saveToLocalStorage(conflictKey, snapshot);
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(snapshot, conflictKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async clearConflictBackup() {
      if (!hasIndexedDb()) {
        window.localStorage.removeItem(conflictKey);
        return;
      }
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").delete(conflictKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function loadFromLocalStorage<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : null;
}

function saveToLocalStorage(key: string, snapshot: StoredSnapshot): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("local-first-outliner", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("snapshots");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadHistoryFromLocalStorage(key: string): SnapshotHistoryEntry[] {
  return normalizeHistory(loadFromLocalStorage<SnapshotHistoryEntry[]>(key));
}

function normalizeHistory(value: unknown): SnapshotHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is SnapshotHistoryEntry => {
      const candidate = entry as Partial<SnapshotHistoryEntry>;
      return Boolean(candidate.id && candidate.createdAt && candidate.snapshot);
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}
