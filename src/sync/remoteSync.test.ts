import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { FakeRemoteStore } from "./fakeRemoteStore";
import { compactRemoteSnapshot, createRemoteSyncState, pullRemoteUpdates, pushLocalUpdate } from "./remoteSync";
import { createYjsWorkspace, encodeState, getYjsSnapshot } from "./yjsAdapter";

describe("remote sync", () => {
  it("applies a remote snapshot to the local workspace", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["Remote"]);
    const remote = createYjsWorkspace({ document, view: createInitialView(document) });
    await compactRemoteSnapshot(store, remote);
    const local = createYjsWorkspace();
    await pullRemoteUpdates(store, local, createRemoteSyncState());
    expect(getYjsSnapshot(local)?.document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
  });

  it("pushes and pulls local updates through a fake remote store", async () => {
    const store = new FakeRemoteStore();
    const document = makeDocumentWithTexts(["A"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });
    await pushLocalUpdate(
      store,
      {
        id: "update-1",
        clientId: "client-a",
        seq: 1,
        update: encodeState(source),
        createdAt: 1
      },
      createRemoteSyncState()
    );
    const target = createYjsWorkspace();
    await pullRemoteUpdates(store, target, createRemoteSyncState());
    expect(getYjsSnapshot(target)?.document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
  });
});
