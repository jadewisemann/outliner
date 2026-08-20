import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP, conflicts, describe as show, matches, specOf } from "../keymap";

const event = (patch: Partial<KeyboardEvent>) =>
  ({ key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...patch }) as KeyboardEvent;

describe("matches", () => {
  it("treats Mod as either ⌘ or Ctrl", () => {
    expect(matches(event({ key: "b", metaKey: true }), "Mod+B")).toBe(true);
    expect(matches(event({ key: "b", ctrlKey: true }), "Mod+B")).toBe(true);
    expect(matches(event({ key: "b" }), "Mod+B")).toBe(false);
  });

  it("requires the modifiers to match exactly", () => {
    expect(matches(event({ key: "k", metaKey: true, shiftKey: true }), "Mod+K")).toBe(false);
    expect(matches(event({ key: "K", metaKey: true, shiftKey: true }), "Mod+Shift+K")).toBe(true);
  });

  it("goes by physical key for punctuation, since Shift changes the character", () => {
    // ⌘⇧. reports its key as ">" on a US layout.
    expect(matches(event({ key: ">", code: "Period", metaKey: true, shiftKey: true }), "Mod+Shift+.")).toBe(true);
    expect(matches(event({ key: ".", code: "Period", metaKey: true }), "Mod+.")).toBe(true);
  });

  it("knows the named keys", () => {
    expect(matches(event({ key: "ArrowUp", metaKey: true, shiftKey: true }), "Mod+Shift+ArrowUp")).toBe(true);
    expect(matches(event({ key: "Enter", metaKey: true }), "Mod+Enter")).toBe(true);
  });
});

describe("specOf", () => {
  it("writes a keystroke the way the table stores it", () => {
    expect(specOf(event({ key: "j", metaKey: true }))).toBe("Mod+J");
    expect(specOf(event({ key: ">", code: "Period", ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+.");
  });

  it("refuses a bare letter, which is typing rather than a shortcut", () => {
    expect(specOf(event({ key: "j" }))).toBeNull();
    expect(specOf(event({ key: "Shift", shiftKey: true }))).toBeNull();
  });
});

describe("the default table", () => {
  it("binds every action exactly once", () => {
    const specs = Object.values(DEFAULT_KEYMAP);
    expect(new Set(specs).size).toBe(specs.length);
  });

  it("reports a clash when two actions are given the same chord", () => {
    const clashing = { ...DEFAULT_KEYMAP, duplicate: DEFAULT_KEYMAP.bold };
    expect(conflicts(clashing, "duplicate", clashing.duplicate)).toEqual(["bold"]);
    expect(conflicts(DEFAULT_KEYMAP, "duplicate", DEFAULT_KEYMAP.duplicate)).toEqual([]);
  });

  it("is written for a reader, not for the parser", () => {
    expect(show("Mod+Shift+K")).toMatch(/⇧K$/);
  });
});
