import { migrate } from "./migrate";
import type { Workspace } from "../types";
import { readWorkspace } from "./validate";
import { invokeNative, isNative } from "../shared/native";

const DB_NAME = "outliner";
const STORE = "workspace";
const KEY = "current";
/** When `KEY` was last written, beside it in the same store. */
const SAVED_AT = "savedAt";

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
  const savedAt = Date.now();
  const db = await openDb();
  if (!db) writeLocalStorage(workspace);
  else await writeDb(db, workspace, savedAt);
  // Inside the native shell the app also keeps its own file, so the notes do
  // not depend on the webview's storage policy. A failure here rejects, and
  // the caller shows that the save did not land.
  if (isNative()) await writeReplica(workspace, savedAt);
}

/**
 * Writes reach the shell in the order they were made. Each `invoke` is its
 * own task on the other side, so without this chain two overlapping saves
 * could land in reverse and leave the older one on disk.
 */
let replicaQueue: Promise<void> = Promise.resolve();
function writeReplica(workspace: Workspace, savedAt: number): Promise<void> {
  const text = JSON.stringify({ savedAt, workspace });
  const next = replicaQueue.then(() => invokeNative<void>("replica_write", { text }));
  replicaQueue = next.catch(() => undefined);
  return next;
}

/**
 * The workspace this device last saved: the webview's database, or — inside
 * the native shell — the shell's own file (`replica_read` in src-tauri) when
 * that is newer or the database is gone.
 *
 * Newest wins, whole. Merging the two looked tempting (they are two replicas)
 * but is wrong for anything that removes without a gravestone: a backup import
 * replaces the workspace outright, and merging a replica that had not caught
 * up yet would bring the replaced documents back. They are copies of one
 * device's history, not two devices, so the later copy is simply the truth.
 */
export async function loadLocal(): Promise<Workspace | null> {
  const db = await openDb();
  const stored = db ? await readDb(db) : null;
  const fromDb = stored ?? readLocalStorage();
  const dbAt = db && stored ? await readSavedAt(db) : 0;
  const replica = await readReplica();
  const pick = replica && (!fromDb || replica.savedAt > dbAt) ? replica.value : fromDb;
  return pick === null ? null : readWorkspace(migrate(pick));
}

async function readReplica(): Promise<{ savedAt: number; value: unknown } | null> {
  if (!isNative()) return null;
  try {
    const text = await invokeNative<string | null>("replica_read");
    if (!text) return null;
    const parsed = JSON.parse(text) as { savedAt?: unknown; workspace?: unknown };
    // Validated by the caller, like anything else from outside the page.
    return typeof parsed?.savedAt === "number" ? { savedAt: parsed.savedAt, value: parsed.workspace } : null;
  } catch {
    return null;
  }
}

function readSavedAt(db: IDBDatabase): Promise<number> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(SAVED_AT);
    request.onsuccess = () => resolve(typeof request.result === "number" ? request.result : 0);
    request.onerror = () => resolve(0);
  });
}

function writeDb(db: IDBDatabase, workspace: Workspace, savedAt: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(workspace, KEY);
    tx.objectStore(STORE).put(savedAt, SAVED_AT);
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
export type StorageGrade = "persisted" | "best-effort" | "unknown" | "file";

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
  // In the native shell every save also lands in the app's own file, which
  // no browser policy can clear: that, not the webview's answer, is the grade.
  if (isNative()) return "file";
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
