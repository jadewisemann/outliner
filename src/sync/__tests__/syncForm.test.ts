import { describe, expect, it } from "vitest";
import type { SyncConfig } from "../api/remote";
import { buildConfig, initialForm } from "../syncForm";

describe("the sync form", () => {
  it("reopens a saved config as the same config", () => {
    // Opening the panel and pressing save must not change the setup.
    const saved: SyncConfig[] = [
      { kind: "rest", url: "https://example.com/notes.json", token: "secret" },
      { kind: "rest", url: "https://example.com/notes.json", token: "", passphrase: "pw" },
      { kind: "github", repo: "me/notes", path: "outliner", token: "pat", markdown: true },
      { kind: "github", repo: "me/notes", path: "journal", token: "pat", passphrase: "pw" },
      { kind: "file", dir: "/Users/me/Notes" }
    ];
    for (const config of saved) expect(buildConfig(initialForm(config))).toEqual(config);
  });

  it("trims, falls back to the default folder, and drops the Markdown copy under a passphrase", () => {
    const form = { ...initialForm(null), mode: "github" as const, repo: " me/notes ", path: " ", token: " pat ", markdown: true };
    expect(buildConfig(form)).toEqual({ kind: "github", repo: "me/notes", path: "outliner", token: "pat", markdown: true });
    expect(buildConfig({ ...form, passphrase: "pw" })).toEqual({
      kind: "github",
      repo: "me/notes",
      path: "outliner",
      token: "pat",
      passphrase: "pw"
    });
  });

  it("describes nothing until each backend has what it needs", () => {
    const blank = initialForm(null);
    expect(buildConfig({ ...blank, mode: "rest", url: "  " })).toBeNull();
    expect(buildConfig({ ...blank, mode: "file", dir: "  " })).toBeNull();
    expect(buildConfig({ ...blank, mode: "github", repo: "notes", token: "pat" })).toBeNull();
    expect(buildConfig({ ...blank, mode: "github", repo: "me/notes", token: "  " })).toBeNull();
    // A REST endpoint may need no token at all.
    expect(buildConfig({ ...blank, mode: "rest", url: "https://example.com/x.json" })).toEqual({
      kind: "rest",
      url: "https://example.com/x.json",
      token: ""
    });
  });
});
