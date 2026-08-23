import { describe, expect, it } from "vitest";
import { FileSession, reconcileExternal } from "../workspace";

describe("FolderWorkspace POC policy", () => {
  it("replaces a clean buffer and keeps an unopposed local edit", () => {
    expect(reconcileExternal("base", "base", "remote")).toEqual({ kind: "replace", text: "remote" });
    expect(reconcileExternal("base", "local", "base")).toEqual({ kind: "keep-local" });
  });

  it("does not overwrite either side of a real conflict", () => {
    expect(reconcileExternal("base", "local", "remote")).toEqual({
      kind: "conflict",
      base: "base",
      local: "local",
      remote: "remote"
    });
  });

  it("stays dirty when the buffer changes during an asynchronous save", () => {
    const session = new FileSession();
    session.open("base");
    session.changed();
    const snapshot = session.beginSave("first edit");
    session.changed();

    expect(session.completeSave(snapshot)).toBe(false);
    expect(session.dirty).toBe(true);
  });
});
