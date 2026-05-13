import type { OutlineSnapshot } from "../domain/outlineTypes";

export interface LocalPersistence {
  load(): Promise<OutlineSnapshot | null>;
  save(snapshot: OutlineSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export function createBrowserLocalPersistence(name: string): LocalPersistence {
  const key = `outliner:${name}`;
  return {
    async load() {
      if (!hasIndexedDb()) {
        return loadFromLocalStorage(key);
      }
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readonly");
        const request = tx.objectStore("snapshots").get(key);
        request.onsuccess = () => resolve((request.result as OutlineSnapshot | undefined) ?? null);
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
    }
  };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function loadFromLocalStorage(key: string): OutlineSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(key);
  return value ? (JSON.parse(value) as OutlineSnapshot) : null;
}

function saveToLocalStorage(key: string, snapshot: OutlineSnapshot): void {
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
