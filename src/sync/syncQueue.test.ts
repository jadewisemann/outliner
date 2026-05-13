import { describe, expect, it } from "vitest";
import { createSyncQueueState, enqueueUpdate, markUpdateApplied } from "./syncQueue";
import type { RemoteUpdate } from "./syncTypes";

function update(id: string, seq: number): RemoteUpdate {
  return {
    id,
    clientId: "client",
    seq,
    update: new Uint8Array([seq]),
    createdAt: seq
  };
}

describe("sync queue", () => {
  it("orders pending updates by sequence", () => {
    const state = enqueueUpdate(enqueueUpdate(createSyncQueueState(), update("b", 2)), update("a", 1));
    expect(state.pending.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("does not enqueue duplicate updates", () => {
    const state = enqueueUpdate(enqueueUpdate(createSyncQueueState(), update("a", 1)), update("a", 1));
    expect(state.pending).toHaveLength(1);
  });

  it("marks updates as applied and removes pending items", () => {
    const state = markUpdateApplied(enqueueUpdate(createSyncQueueState(), update("a", 1)), "a");
    expect(state.pending).toHaveLength(0);
    expect(state.appliedIds).toEqual(["a"]);
  });
});
