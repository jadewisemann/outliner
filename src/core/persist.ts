import { migrate } from "./migrate";
import type { Workspace } from "./types";

const DB_NAME = "outliner";
const STORE = "workspace";
const KEY = "current";

/**
 * IndexedDB with a localStorage fallback. IndexedDB is the primary store
 * because a large outline outgrows the 5MB localStorage budget.
 */
export async function loadWorkspace(): Promise<Workspace> {
  const db = await openDb();
  const raw = db ? await readDb(db) : readLocalStorage();
  return migrate(raw ?? readLocalStorage());
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openDb();
  if (!db) {
    writeLocalStorage(workspace);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(workspace, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      writeLocalStorage(workspace);
      resolve();
    };
  });
}

function readDb(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

function readLocalStorage(): unknown {
  try {
    const raw = localStorage.getItem(`${DB_NAME}:${KEY}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalStorage(workspace: Workspace) {
  try {
    localStorage.setItem(`${DB_NAME}:${KEY}`, JSON.stringify(workspace));
  } catch {
    /* quota exceeded — the in-memory doc is still intact */
  }
}
