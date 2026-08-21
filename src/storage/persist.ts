import { migrate } from "./migrate";
import type { Workspace } from "../types";
import { readWorkspace } from "./validate";

const DB_NAME = "outliner";
const STORE = "workspace";
const KEY = "current";

/**
 * IndexedDB with a localStorage fallback. IndexedDB is the primary store
 * because a large outline outgrows the 5MB localStorage budget.
 */
/** Returns `null` when there is nothing usable stored, so the caller can start fresh. */
export async function loadWorkspace(): Promise<Workspace | null> {
  const db = await openDb();
  const raw = (db ? await readDb(db) : null) ?? readLocalStorage();
  if (raw === null) return null;
  // Storage can be corrupted by a half-written record or an older build.
  return readWorkspace(migrate(raw));
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

/* ------------------------------------------------------------------ */
/* storage durability                                                  */
/* ------------------------------------------------------------------ */

/**
 * What the browser promises about the notes kept here.
 *
 * `best-effort` is IndexedDB's default grade and it means what it says: under
 * storage pressure — or after a stretch of not being opened, which iOS Safari
 * counts in days — the browser may delete everything. An app that says
 * "your data stays on your device" cannot leave that to the browser's
 * discretion, so the grade is asked for rather than assumed.
 *
 * `unknown` is kept apart from `best-effort` on purpose: a browser that does
 * not answer the question is not the same as one that answered no, and the UI
 * must not claim more than it was told.
 */
export type StorageGrade = "persisted" | "best-effort" | "unknown";

/**
 * Asks for the durable grade, returning the grade actually in force.
 *
 * Safe to call on every start, and it has to be: the answer changes as the
 * user commits to the app. Chrome grants persistence off engagement signals
 * (installed, bookmarked, visited often), so the first visit is refused and a
 * later one is granted — asking once and remembering the no would understate
 * what the browser is now willing to promise. Firefox prompts instead, which
 * is why the same call sits behind a button in the sync panel.
 */
export async function requestPersistence(): Promise<StorageGrade> {
  if (typeof navigator === "undefined") return "unknown";
  const storage = navigator.storage;
  if (!storage?.persist || !storage.persisted) return "unknown";
  try {
    if (await storage.persisted()) return "persisted";
    return (await storage.persist()) ? "persisted" : "best-effort";
  } catch {
    // A refused prompt and a broken API arrive the same way here, and neither
    // is evidence about the grade.
    return "unknown";
  }
}
