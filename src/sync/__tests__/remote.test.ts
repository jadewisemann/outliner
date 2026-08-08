import { beforeEach, describe, expect, it } from "vitest";
import { configKey, loadSyncConfig, saveSyncConfig } from "../api/remote";

beforeEach(() => localStorage.clear());

describe("sync config", () => {
  it("round-trips a GitHub configuration", () => {
    saveSyncConfig({ kind: "github", repo: "me/notes", path: "outline.json", token: "pat" });
    expect(loadSyncConfig()).toEqual({ kind: "github", repo: "me/notes", path: "outline.json", token: "pat" });
  });

  it("reads a config saved before backends had a kind as plain REST", () => {
    // Devices that configured sync in an earlier build stored {url, token}.
    localStorage.setItem("outliner:sync", JSON.stringify({ url: "https://example.com/o.json", token: "t" }));
    expect(loadSyncConfig()).toEqual({ kind: "rest", url: "https://example.com/o.json", token: "t" });
  });

  it("fills in the default path for a GitHub config that lacks one", () => {
    localStorage.setItem("outliner:sync", JSON.stringify({ kind: "github", repo: "me/notes", token: "pat" }));
    expect(loadSyncConfig()?.kind === "github" && loadSyncConfig()).toMatchObject({ path: "outliner" });
  });

  it("treats a path from the single-file layout as the folder beside it", () => {
    // `outliner.json` and `outliner` name the same workspace, so a device that
    // configured sync in an earlier build keeps its first-sync marker.
    const folder = configKey({ kind: "github", repo: "me/notes", path: "outliner", token: "x" });
    expect(configKey({ kind: "github", repo: "me/notes", path: "outliner.json", token: "x" })).toBe(folder);
  });

  it("rejects garbage instead of returning a half-config", () => {
    for (const raw of ["nonsense", "{}", JSON.stringify({ kind: "github", token: "pat" })]) {
      localStorage.setItem("outliner:sync", raw);
      expect(loadSyncConfig()).toBeNull();
    }
  });

  it("gives each remote a distinct identity for the first-sync marker", () => {
    const github = configKey({ kind: "github", repo: "me/notes", path: "a.json", token: "x" });
    const rest = configKey({ kind: "rest", url: "https://example.com/a.json", token: "x" });
    expect(github).not.toBe(rest);
    expect(github).toContain("me/notes");
  });
});
