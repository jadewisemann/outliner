import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSync } from "../useSync";
import { makeDoc, makeWorkspace } from "../../types";

/** A REST endpoint that answers every GET with `body` and accepts every PUT. */
function restRemote(body: unknown) {
  localStorage.setItem("outliner:sync", JSON.stringify({ kind: "rest", url: "https://example.test/o.json", token: "" }));
  vi.stubGlobal("fetch", async () => ({
    status: 200,
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify(body)
  }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("useSync", () => {
  it("keeps the undo history when a merge brings in no document at all", async () => {
    // The remote's only document sat in the trash past the gravestone window,
    // so this untouched device adopts the remote and the merge prunes it away:
    // a result with nothing in it to apply.
    const binned = makeDoc("binned long ago", { deleted: { at: 1, by: "other" } });
    restRemote({ docs: { [binned.id]: binned }, graves: {}, keymap: null });
    const live = { current: makeWorkspace() };
    const apply = vi.fn();
    const onAbsorb = vi.fn();

    renderHook(() => useSync({ live, apply, onAbsorb, ready: true }));
    // Written only once a round has finished without an error.
    await waitFor(() => expect(localStorage.getItem("outliner:synced")).not.toBeNull());

    expect(apply).not.toHaveBeenCalled();
    expect(onAbsorb).not.toHaveBeenCalled();
  });
});
