import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLocal } from "../persist";
import { makeWorkspace, type Workspace } from "../../types";

/**
 * The native shell, reduced to `replica_read` answering with the given file
 * text. This environment has no IndexedDB, so the browser's own copy is the
 * localStorage fallback, which `loadLocal` weighs against the replica the same
 * way it weighs the database.
 */
function shellWithReplica(text: string | null) {
  (window as unknown as { __TAURI__: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string) => {
        if (command === "replica_read") return text;
        throw new Error(`unexpected command ${command}`);
      }
    }
  };
}

function browserCopy(workspace: Workspace) {
  localStorage.setItem("outliner:current", JSON.stringify(workspace));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe("loadLocal", () => {
  it("takes the newer copy whole when it is the replica", async () => {
    const older = makeWorkspace();
    const newer = makeWorkspace();
    browserCopy(older);
    shellWithReplica(JSON.stringify({ savedAt: Date.now(), workspace: newer }));

    expect((await loadLocal())?.activeDocId).toBe(newer.activeDocId);
  });

  it("does not let a replica with no workspace in it replace the browser's copy", async () => {
    // A hand-edited or foreign file. Taken as the newer copy, it would have
    // become a fresh workspace, and the next save would have written that
    // over the real one.
    const saved = makeWorkspace();
    browserCopy(saved);
    for (const workspace of [undefined, null, "not a workspace", 7]) {
      shellWithReplica(JSON.stringify({ savedAt: Date.now(), workspace }));
      expect((await loadLocal())?.activeDocId).toBe(saved.activeDocId);
    }
  });
});
