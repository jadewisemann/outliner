import type { SyncPayload } from "@/entities/outline";
import { invokeNative } from "@/shared/api/native";
import { mergeWorkspace } from "../../model/merge";
import { lacks } from "../../model/push";
import { isLocked, type Keyring } from "../cipher";
import { emptyPayload, type Backend, type Stored, type SyncConfig } from "./contract";
import { openPayload, sealPayload } from "./payload";

/** One file as the shell read it. `stamp` is a hash of its bytes, used as the version. */
type Entry = { name: string; text: string; stamp: string };

/** What `folder_read` in `src-tauri/src/lib.rs` answers. */
type FolderRead = { canonical: Entry | null; copies: Entry[] };

/** A copy as it was read; the shell moves it only if it still has these bytes. */
type Seen = { name: string; stamp: string };

/**
 * A folder on this computer, holding one file: `outliner.json`.
 *
 * The folder is usually one that something else already syncs — iCloud Drive,
 * Dropbox, Google Drive, OneDrive, Syncthing. That service carries the file
 * between machines for free, and this backend only reads it, merges, and
 * writes it back. It is the REST contract with the network replaced by a
 * disk, and the file is written in exactly the REST backend's format, so a
 * workspace can move between the two by copying one file.
 *
 * What differs from a server is handled here rather than papered over
 * (ADR-0011, DESIGN.md principle 21):
 *
 * 1. **Nobody arbitrates writes.** The shell compares the file's hash before
 *    replacing it, which catches another writer on this machine, but a sync
 *    service can later swap in another machine's version without asking. So
 *    the backend is `unguarded`: the loop pushes whenever the file is missing
 *    something this device holds, not only when there are new edits.
 * 2. **Sync services make conflict copies.** Each is a complete workspace. A
 *    copy that adds something is merged in and, once the merged file is
 *    written, moved into `.outliner-merged/`; a copy the file already covers
 *    is moved right away. Moved, never deleted, and only if it still holds
 *    the bytes that were read.
 * 3. **Bytes this device cannot read are never written over.** An unreadable
 *    `outliner.json` is renamed aside (`outliner.unreadable-….json`) before
 *    anything is written in its place; an unreadable or sealed copy is left
 *    exactly where it is. Only a sealed *canonical* file stops the backend —
 *    that is the file it would otherwise overwrite (principle 7).
 */
export function createFileBackend(config: Extract<SyncConfig, { kind: "file" }>, keys: Keyring): Backend {
  /** Copies merged by the last pull, retired by the next successful push. */
  let merged: Seen[] = [];
  /**
   * The last answer, by the stamps it was built from. Polling every few
   * seconds must not re-open, re-parse and re-validate an unchanged file —
   * and handing back the same object keeps the merge a no-op (principle 4).
   */
  let last: { key: string; stored: Stored; merged: Seen[] } | null = null;

  const readCanonical = async (entry: Entry | null): Promise<SyncPayload | null> => {
    if (!entry) return null;
    // Untrusted like any remote: the file may have been edited by hand,
    // half-synced, or written by a newer build. A sealed file under another
    // passphrase throws `locked` here, which stops the round.
    const payload = await openPayload(keys, entry.text);
    if (payload) return payload;
    // Readable bytes that are not a workspace: set them aside so the write
    // that follows cannot destroy them.
    await invokeNative<boolean>("folder_set_aside", { dir: config.dir, expect: entry.stamp });
    return null;
  };

  const readCopy = async (entry: Entry): Promise<SyncPayload | null> => {
    try {
      // Awaited here, inside the try: a returned promise would reject past the catch.
      return await openPayload(keys, entry.text);
    } catch (error) {
      // A copy sealed under a passphrase this device lacks is left on disk
      // and out of the merge. It is never written over, so it need not stop
      // anything.
      if (isLocked(error)) return null;
      throw error;
    }
  };

  return {
    // A disk answers fast and costs nothing. The pull interval is what bounds
    // how soon another machine's edit shows up, after its sync service has
    // delivered the file.
    cadence: { pullMs: 5_000, pushMs: 1_500 },
    unguarded: true,

    async pull() {
      const read = await invokeNative<FolderRead>("folder_read", { dir: config.dir });
      const key = [read.canonical?.stamp ?? "-", ...read.copies.map((copy) => `${copy.name}:${copy.stamp}`)].join("|");
      if (last && last.key === key) {
        merged = last.merged;
        return last.stored;
      }

      const canonical = await readCanonical(read.canonical);
      let payload = canonical ?? emptyPayload();
      merged = [];
      const covered: Seen[] = [];
      for (const copy of read.copies) {
        const extra = await readCopy(copy);
        if (!extra) continue;
        const seen = { name: copy.name, stamp: copy.stamp };
        if (lacks(payload, extra)) {
          payload = mergeWorkspace(payload, extra);
          merged.push(seen);
        } else {
          covered.push(seen);
        }
      }
      // Already in the file: move it now, no write needed. If the move fails
      // the copy is simply covered again next time — it can never force a
      // rewrite of its own.
      if (covered.length > 0) await invokeNative<string[]>("folder_retire", { dir: config.dir, copies: covered });

      const stored: Stored = {
        payload,
        // Set aside or absent: nothing to compare against.
        version: canonical ? read.canonical!.stamp : null,
        // Something only a write can settle: copies that added content.
        rewrite: merged.length > 0
      };
      last = { key, stored, merged };
      return stored;
    },

    async push(payload, version) {
      const stamp = await invokeNative<string | null>("folder_write", {
        dir: config.dir,
        text: await sealPayload(keys, payload),
        expect: typeof version === "string" ? version : null,
        retire: merged
      });
      // The file changed since it was read: pull, merge, try again.
      if (stamp === null) return null;
      merged = [];
      last = null;
      return stamp;
    }
  };
}

/** Asks the shell for a folder. Null when the dialog was closed. Picking allows it. */
export function pickFolder(): Promise<string | null> {
  return invokeNative<string | null>("folder_pick");
}

/**
 * Asks the shell to allow a typed-in folder. The shell shows its own
 * confirmation, which the page can neither draw nor click; false if declined.
 */
export function allowFolder(dir: string): Promise<boolean> {
  return invokeNative<boolean>("folder_allow", { dir });
}
