import { readPayload } from "../../../storage/validate";
import { invokeNative } from "../../../shared/native";
import { mergeWorkspace } from "../../merge";
import type { Keyring } from "../cipher";
import { emptyPayload, type Backend, type SyncConfig } from "./contract";
import { parse } from "./codec";

/** One file as the shell read it. `stamp` is a hash of its bytes, used as the version. */
type Entry = { name: string; text: string; stamp: string };

/** What `folder_read` in `src-tauri/src/lib.rs` answers. */
type FolderRead = { canonical: Entry | null; copies: Entry[] };

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
 * Two things differ from a server, and both are handled here rather than
 * papered over:
 *
 * 1. **Nobody arbitrates writes.** The shell compares the file's hash before
 *    replacing it, which catches another writer on this machine, but a sync
 *    service can later swap in another machine's version without asking. So
 *    the backend is marked `unguarded`, and the loop pushes whenever the file
 *    is missing something this device holds — not only when there are new
 *    edits. The file converges no matter how it was overwritten.
 * 2. **Sync services make conflict copies.** When two machines write before
 *    either has seen the other, Dropbox leaves `outliner (… conflicted copy …).json`,
 *    Syncthing `outliner.sync-conflict-….json`, Drive `outliner (1).json`,
 *    iCloud `outliner 2.json`. Each is a complete workspace, so each is merged
 *    in, and after the merged result is safely written the copies that were
 *    read are removed. A copy that could not be read is never removed.
 */
export function createFileBackend(config: Extract<SyncConfig, { kind: "file" }>, keys: Keyring): Backend {
  /** Copies merged by the last pull, removed by the next successful push. */
  let merged: string[] = [];

  return {
    // A disk answers fast and costs nothing. The pull interval is what bounds
    // how soon another machine's edit shows up, after its sync service has
    // delivered the file.
    cadence: { pullMs: 5_000, pushMs: 1_500 },
    unguarded: true,

    async pull() {
      const read = await invokeNative<FolderRead>("folder_read", { dir: config.dir });

      // Untrusted like any remote: the file may have been edited by hand,
      // half-synced, or written by a newer build.
      let payload = read.canonical ? readPayload(parse(await keys.open(read.canonical.text))) : null;
      payload ??= emptyPayload();

      merged = [];
      for (const copy of read.copies) {
        // A copy under a passphrase this device does not have is the same
        // case as the canonical file under one: stop, rather than write over
        // something nobody here can read.
        const extra = readPayload(parse(await keys.open(copy.text)));
        if (!extra) continue;
        payload = mergeWorkspace(payload, extra);
        merged.push(copy.name);
      }

      return {
        payload,
        version: read.canonical?.stamp ?? null,
        // Copies exist, so the canonical file is not yet the whole story even
        // if this device has nothing new: write it once so the copies can go.
        rewrite: merged.length > 0
      };
    },

    async push(payload, version) {
      const stamp = await invokeNative<string | null>("folder_write", {
        dir: config.dir,
        text: await keys.seal(JSON.stringify(payload)),
        expect: typeof version === "string" ? version : null,
        remove: merged
      });
      // The file changed since it was read: pull, merge, try again.
      if (stamp === null) return null;
      merged = [];
      return stamp;
    }
  };
}

/** Asks the shell for a folder. Null when the dialog was closed. */
export function pickFolder(): Promise<string | null> {
  return invokeNative<string | null>("folder_pick");
}
