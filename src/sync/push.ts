import { changedBy, mergeWorkspace } from "./merge";
import type { Stored } from "./api/remote";
import type { SyncPayload } from "../types";

/**
 * Whether a sync round, having pulled and merged, should offer this device's
 * workspace back to the remote.
 *
 * The default is to stay quiet: nothing of ours is unpushed and the remote has
 * a version, so a push would only echo back what it already holds — and on
 * GitHub every push is a commit, so an idle device must not leave a trail of
 * empty ones. Compare-and-swap is what makes that safe: a write of ours can
 * only be lost by being refused, and a refusal is retried.
 *
 * Two exceptions, both for remotes without compare-and-swap (DESIGN.md
 * principle 21):
 *
 * - the remote asked to be rewritten (`Stored.rewrite`: conflict copies were
 *   merged, and only a write can retire them);
 * - the backend is `unguarded` and the remote no longer holds everything this
 *   device does — something replaced our last write without asking.
 */
export function shouldPush(options: {
  stored: Stored;
  local: SyncPayload;
  /** Edits made since the last accepted push. */
  unpushed: boolean;
  unguarded: boolean;
}): boolean {
  const { stored, local, unpushed, unguarded } = options;
  if (unpushed || stored.version === null || stored.rewrite) return true;
  return unguarded && lacks(stored.payload, local);
}

/**
 * Whether `remote` is missing anything `local` holds. Merging local into the
 * remote hands back the remote's own objects when there is nothing to bring
 * in (principle 4), so identity answers it without serialising anything.
 */
export function lacks(remote: SyncPayload, local: SyncPayload): boolean {
  return changedBy(remote, mergeWorkspace(remote, local));
}
