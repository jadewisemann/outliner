import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { bytesToBase64 } from "./remoteEncoding";
import { applyUpdate, createYjsWorkspace, encodeState, getYjsSnapshot, setYjsSnapshot } from "./yjsAdapter";

const { getMock, runTransactionMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  runTransactionMock: vi.fn()
}));

vi.mock("firebase/database", () => ({
  child: (parent: string, path: string) => `${parent}/${path}`,
  get: getMock,
  ref: (_database: unknown, path: string) => path,
  runTransaction: runTransactionMock
}));

describe("FirebaseRemoteStoreV2", () => {
  beforeEach(() => {
    getMock.mockReset();
    runTransactionMock.mockReset();
    getMock.mockResolvedValue(snapshot(null));
    runTransactionMock.mockImplementation((_ref: string, update: (current: unknown) => unknown) => {
      const next = update(null);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshot(next) });
    });
  });

  it("transactionally writes only the v2 latest snapshot path without undefined fields", async () => {
    const { FirebaseRemoteStoreV2 } = await import("./firebaseRemoteStoreV2");
    const store = new FirebaseRemoteStoreV2({} as never, "user-a");

    await expect(
      store.writeLatestSnapshot({
        version: 1,
        clientId: "client-a",
        updatedAt: 10,
        state: new Uint8Array([1])
      })
    ).resolves.toBe("accepted");

    expect(runTransactionMock).toHaveBeenCalledWith(
      "users/user-a/workspaces/root/v2/snapshot",
      expect.any(Function)
    );
    const transactionBody = runTransactionMock.mock.calls[0][1](null);
    expect(transactionBody).toEqual({
      version: 1,
      clientId: "client-a",
      updatedAt: 10,
      state: "AQ=="
    });
    expect(transactionBody).not.toHaveProperty("vector");
    expect(runTransactionMock.mock.calls[0][0]).not.toContain("/updates");
  });

  it("rejects equal-version writes from a different client", async () => {
    const { FirebaseRemoteStoreV2 } = await import("./firebaseRemoteStoreV2");
    const store = new FirebaseRemoteStoreV2({} as never, "user-a");
    runTransactionMock.mockImplementation((_ref: string, update: (current: unknown) => unknown) => {
      const current = {
        version: 1,
        clientId: "client-a",
        updatedAt: 10,
        state: "AQ=="
      };
      const next = update(current);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshot(next ?? current) });
    });

    await expect(
      store.writeLatestSnapshot({
        version: 1,
        clientId: "client-b",
        updatedAt: 11,
        state: new Uint8Array([2])
      })
    ).resolves.toBe("rejected");
  });

  it("reconstructs legacy snapshot plus updates before writing the v2 snapshot", async () => {
    const { FirebaseRemoteStoreV2 } = await import("./firebaseRemoteStoreV2");
    const base = makeDocumentWithTexts(["Base"]);
    const latest = makeDocumentWithTexts(["Latest"]);
    const legacyWorkspace = createYjsWorkspace({ document: base, view: createInitialView(base) });
    const baseState = encodeState(legacyWorkspace);
    setYjsSnapshot(legacyWorkspace, { document: latest, view: createInitialView(latest) });
    const latestState = encodeState(legacyWorkspace);
    getMock.mockImplementation((path: string) => {
      if (path.endsWith("/v2/snapshot")) {
        return Promise.resolve(snapshot(null));
      }
      if (path.endsWith("/snapshot")) {
        return Promise.resolve(snapshot({ state: bytesToBase64(baseState), updatedAt: 1 }));
      }
      if (path.endsWith("/updates")) {
        return Promise.resolve(
          snapshot({
            a: { clientId: "legacy", seq: 1, update: bytesToBase64(latestState), createdAt: 2 }
          })
        );
      }
      return Promise.resolve(snapshot(null));
    });
    let migrated: unknown;
    runTransactionMock.mockImplementation((_ref: string, update: (current: unknown) => unknown) => {
      migrated = update(null);
      return Promise.resolve({ committed: true, snapshot: snapshot(migrated) });
    });
    const store = new FirebaseRemoteStoreV2({} as never, "user-a");

    const record = await store.readLatestSnapshot();
    const restored = record ? getYjsSnapshot(createYjsWorkspaceFromState(record.state)) : undefined;

    expect(record).toMatchObject({ version: 1, clientId: "legacy", updatedAt: 2 });
    expect(restored?.document.nodes[latest.nodes[latest.rootId].children[0]].text).toBe("Latest");
    expect(migrated).toMatchObject({ version: 1, clientId: "legacy", updatedAt: 2 });
  });
});

function snapshot(value: unknown) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value
  };
}

function createYjsWorkspaceFromState(state: Uint8Array) {
  const workspace = createYjsWorkspace();
  applyUpdate(workspace, state);
  return workspace;
}
