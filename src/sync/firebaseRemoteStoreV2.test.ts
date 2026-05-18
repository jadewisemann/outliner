import { beforeEach, describe, expect, it, vi } from "vitest";

const { setMock, getMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  getMock: vi.fn()
}));

vi.mock("firebase/database", () => ({
  child: (parent: string, path: string) => `${parent}/${path}`,
  get: getMock,
  onValue: vi.fn(),
  ref: (_database: unknown, path: string) => path,
  set: setMock
}));

describe("FirebaseRemoteStoreV2", () => {
  beforeEach(() => {
    setMock.mockReset();
    getMock.mockReset();
    getMock.mockResolvedValue({ exists: () => false });
  });

  it("writes only the v2 latest snapshot path", async () => {
    const { FirebaseRemoteStoreV2 } = await import("./firebaseRemoteStoreV2");
    const store = new FirebaseRemoteStoreV2({} as never, "user-a");

    await store.writeLatestSnapshot({
      version: 1,
      clientId: "client-a",
      updatedAt: 10,
      state: new Uint8Array([1])
    });

    expect(setMock).toHaveBeenCalledWith("users/user-a/workspaces/root/v2/snapshot", {
      version: 1,
      clientId: "client-a",
      updatedAt: 10,
      state: "AQ==",
      vector: undefined
    });
    expect(setMock.mock.calls[0][0]).not.toContain("/updates");
  });
});
