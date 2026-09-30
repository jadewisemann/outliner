import type { Doc, Id, SyncPayload } from "../../../types";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error" | "locked";

/** A request that never answers would otherwise wedge the sync loop for good. */
export const TIMEOUT_MS = 15_000;

/** The folder a GitHub workspace lives in when no `path` names one. */
export const DEFAULT_FOLDER = "outliner";

/**
 * Three kinds of remote, one contract: read a versioned JSON document, write it
 * back with compare-and-swap. Anything that can do that can hold the notes.
 * The folder's compare-and-swap holds only on this device, since a sync service
 * can replace the file without asking, which is why that backend is `unguarded`.
 */
export type SyncConfig =
  | {
      kind: "rest";
      /**
       * A URL that answers GET with the stored payload and accepts PUT of a
       * new one. A Firebase Realtime Database path works as-is, as does any
       * endpoint that stores and returns a JSON body.
       */
      url: string;
      /** Sent as `Authorization: Bearer …` when present. */
      token: string;
      /** Set to keep the remote from being able to read any of it. */
      passphrase?: string;
    }
  | {
      kind: "github";
      /** `owner/name`. */
      repo: string;
      /** Folder inside the repository that holds the workspace. */
      path: string;
      /** A fine-grained PAT with contents read/write on this one repository. */
      token: string;
      /** Set to keep the remote from being able to read any of it. */
      passphrase?: string;
      /**
       * Write a readable `.md` beside every document. Derived output only: the
       * app never reads these back. Ignored while `passphrase` is set, because
       * a plaintext copy next to the ciphertext would undo the encryption.
       */
      markdown?: boolean;
    }
  | {
      kind: "file";
      /**
       * An absolute folder path on this computer, holding `outliner.json`.
       * Native shell on desktop only (`remote/file.ts`).
       */
      dir: string;
      /** Set to keep whoever holds the folder (a sync service) from reading it. */
      passphrase?: string;
    };

/** Per-file shas of the split GitHub layout — one token covering many files. */
export type GithubVersion = { docs: Record<Id, string>; graves: string | null; keymap?: string | null };

/**
 * Whatever a backend needs to recognise its own last write. Opaque to the sync
 * loop, which only ever asks whether the remote holds anything at all (`null`)
 * and hands the token straight back on the next push.
 */
export type Version = string | GithubVersion | null;

export type Stored = {
  payload: SyncPayload;
  version: Version;
  /**
   * The remote needs writing even if this device has nothing new — the folder
   * backend sets it when it merged conflict copies that only a write can
   * retire. Absent on every other backend.
   */
  rewrite?: boolean;
};

/** One past version of one document, as the remote remembers it. */
export type Revision = { id: string; message: string; at: string; author: string };

/**
 * Reading the past. Only a backend that keeps history can offer this — a plain
 * `GET`/`PUT` URL has no memory, and neither does a file in a folder, which is
 * exactly why this is optional rather than part of the contract. Today only
 * GitHub offers it.
 */
export type History = {
  list(docId: Id): Promise<Revision[]>;
  read(docId: Id, revision: string): Promise<Doc | null>;
};

/**
 * Somewhere to put bytes that are not notes.
 *
 * Optional for the same reason history is: a plain `GET`/`PUT` URL is one
 * document, with no room beside it. A repository has room.
 */
export type Files = {
  put(name: string, bytes: Uint8Array): Promise<void>;
  /** Null when the file is not there; throws `locked` when it cannot be read. */
  get(name: string): Promise<Uint8Array | null>;
};

export type Backend = {
  pull(): Promise<Stored>;
  history?: History;
  files?: Files;
  /** Resolves to `null` when the remote moved on and the caller should re-merge. */
  push(payload: SyncPayload, version: Version): Promise<Version | undefined>;
  /**
   * How often this remote likes to be talked to. A private server can take an
   * update every couple of seconds; on GitHub every push is a commit, so the
   * cadence is gentler.
   */
  cadence: { pullMs: number; pushMs: number };
  /**
   * Writes can be replaced without a compare-and-swap ever refusing them — a
   * file that a sync service carries between machines. The loop then pushes
   * whenever the remote lacks something this device holds, instead of only
   * when there are unpushed edits. Absent on backends that answer a stale
   * write with a refusal, where that check would only repeat what CAS does.
   */
  unguarded?: boolean;
};

export function emptyPayload(): SyncPayload {
  return { docs: {}, graves: {}, keymap: null };
}
