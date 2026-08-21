import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYMAP,
  DYNALIST_KEYMAP,
  PRESETS,
  UNBOUND,
  conflicts,
  describe as show,
  loadKeymap,
  matches,
  presetOf,
  saveKeymap,
  specOf,
  type Action,
  type Keymap,
  type PresetName
} from "../keymap";

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

  it("goes by physical key for digits too, which the colour labels need", () => {
    // ⌘⇧1 reports its key as "!" on a US layout, and as anyone's guess elsewhere.
    expect(matches(event({ key: "!", code: "Digit1", metaKey: true, shiftKey: true }), "Mod+Shift+1")).toBe(true);
    expect(matches(event({ key: "~", code: "Backquote", metaKey: true, shiftKey: true }), "Mod+Shift+`")).toBe(true);
    expect(matches(event({ key: "`", code: "Backquote", metaKey: true }), "Mod+`")).toBe(true);
  });

  it("never fires for an action left unbound", () => {
    // Otherwise a preset that empties a slot would still swallow a keystroke.
    expect(matches(event({ key: "]", code: "BracketRight", metaKey: true }), UNBOUND)).toBe(false);
    expect(matches(event({ key: "" }), UNBOUND)).toBe(false);
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
    expect(specs).not.toContain(UNBOUND);
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


describe("the presets", () => {
  const names = Object.keys(PRESETS) as PresetName[];
  const actions = Object.keys(DEFAULT_KEYMAP) as Action[];

  it.each(names)("%s binds every action", (name) => {
    for (const action of actions) expect(typeof PRESETS[name][action]).toBe("string");
  });

  it.each(names)("%s gives no two actions the same chord", (name) => {
    // Two actions on one chord means the second never fires, and the branch
    // order that decides which is silent is not something a user can see.
    const bound = actions.map((action) => PRESETS[name][action]).filter((spec) => spec !== UNBOUND);
    expect(new Set(bound).size).toBe(bound.length);
  });

  it("puts Dynalist's zoom on ⌘] and ⌘[, and clears indent to make room", () => {
    // The collision this whole table exists for: Dynalist spends the brackets
    // on zoom, so indenting cannot also claim them. Tab still indents.
    expect(DYNALIST_KEYMAP.zoomIn).toBe("Mod+]");
    expect(DYNALIST_KEYMAP.zoomOut).toBe("Mod+[");
    expect(DYNALIST_KEYMAP.indent).toBe(UNBOUND);
    expect(DYNALIST_KEYMAP.outdent).toBe(UNBOUND);
  });

  it("names the table a keymap came from, and stops naming one once edited", () => {
    expect(presetOf(DEFAULT_KEYMAP)).toBe("editor");
    expect(presetOf(DYNALIST_KEYMAP)).toBe("dynalist");
    expect(presetOf({ ...DYNALIST_KEYMAP, bold: "Mod+Alt+B" })).toBeNull();
  });
});

describe("stored keymaps", () => {
  it("keeps an unbound action unbound across a reload", () => {
    // "" used to read as "nothing stored" and quietly came back bound, which
    // would undo half of the Dynalist preset on the next visit.
    saveKeymap({ ...DYNALIST_KEYMAP });
    expect(loadKeymap().indent).toBe(UNBOUND);
    expect(presetOf(loadKeymap())).toBe("dynalist");
  });

  it("falls back to the default for an action saved before it existed", () => {
    const old: Partial<Keymap> = { bold: "Mod+Alt+B" };
    localStorage.setItem("outliner:keys", JSON.stringify(old));
    const loaded = loadKeymap();
    expect(loaded.bold).toBe("Mod+Alt+B");
    expect(loaded.color1).toBe(DEFAULT_KEYMAP.color1);
  });
});
