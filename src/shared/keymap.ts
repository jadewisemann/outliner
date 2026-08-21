import type { Color } from "../types";

/**
 * Every rebindable key in one table.
 *
 * The line drawn here is between *shortcuts* and *editing semantics*. Enter
 * splitting a row, Backspace joining one, arrows moving the caret — those are
 * what the editor is, not preferences, and rebinding them would only produce
 * an editor nobody could describe. Everything with a modifier is a shortcut.
 */

export type Action =
  | "palette"
  | "commands"
  | "search"
  | "filter"
  | "sidebar"
  | "help"
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "code"
  | "strike"
  | "highlight"
  | "link"
  | "duplicate"
  | "delete"
  | "indent"
  | "outdent"
  | "moveUp"
  | "moveDown"
  | "collapse"
  | "zoomIn"
  | "zoomOut"
  | "done"
  | "collapseAll"
  | "expandAll"
  | "checklist"
  | "numbered"
  | "color1"
  | "color2"
  | "color3"
  | "color4"
  | "color5"
  | "color6"
  | "colorNone";

export type Keymap = Record<Action, string>;

/**
 * An action deliberately left without a key.
 *
 * A preset needs this: Dynalist spends ⌘] and ⌘[ on zoom, so its preset has to
 * take them away from indent rather than bind both and let whichever branch is
 * checked first swallow the key. Tab and Shift+Tab still indent — that is
 * editing rather than a shortcut, so no preset can take it away.
 */
export const UNBOUND = "";

/** `Mod` is ⌘ on a Mac and Ctrl everywhere else — one binding, both machines. */
export const DEFAULT_KEYMAP: Keymap = {
  palette: "Mod+P",
  commands: "Mod+Shift+P",
  search: "Mod+Shift+F",
  filter: "Mod+F",
  sidebar: "Mod+\\",
  help: "Mod+/",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",

  bold: "Mod+B",
  italic: "Mod+I",
  code: "Mod+E",
  strike: "Mod+Shift+X",
  highlight: "Mod+Shift+H",
  link: "Mod+K",

  duplicate: "Mod+D",
  delete: "Mod+Shift+K",
  indent: "Mod+]",
  outdent: "Mod+[",
  moveUp: "Mod+Shift+ArrowUp",
  moveDown: "Mod+Shift+ArrowDown",
  collapse: "Mod+.",
  zoomIn: "Mod+Shift+.",
  zoomOut: "Mod+Shift+,",
  done: "Mod+Enter",

  // ⌘⇧[ and ⌘⇧] would read better next to the brackets, but they switch
  // browser tabs on a Mac and a page cannot take that back.
  collapseAll: "Mod+Alt+[",
  expandAll: "Mod+Alt+]",

  // Display flags the palette already reached but the keyboard did not.
  // Dynalist's own chords for these are ⌘⇧C and ⌘⇧`, which Chrome's inspector
  // and macOS's window cycling take before the page sees them — so the default
  // table picks keys that survive and the Dynalist table keeps the real ones.
  checklist: "Mod+Shift+L",
  numbered: "Mod+Shift+7",
  color1: "Mod+Shift+1",
  color2: "Mod+Shift+2",
  color3: "Mod+Shift+3",
  color4: "Mod+Shift+4",
  color5: "Mod+Shift+5",
  color6: "Mod+Shift+6",
  colorNone: "Mod+Shift+0"
};

/**
 * The same actions under the keys a Dynalist hand already knows.
 *
 * This exists rather than a rewritten default because the default set was a
 * decision, not an accident: editing is meant to feel like a markdown editor
 * and navigation like a code editor's palette (docs/parity.md §2.2), which is
 * what spends ⌘K on links and ⌘]/⌘[ on indenting. Moving off Dynalist should
 * not cost a user their muscle memory, and keeping Dynalist's keys should not
 * cost everyone else the editor conventions — so both tables ship.
 *
 * Only bindings actually verified as Dynalist's are claimed as Dynalist's.
 * Where Dynalist has no equivalent the editor default carries over untouched;
 * the two entries that had to move to clear a collision say so on the line.
 */
export const DYNALIST_KEYMAP: Keymap = {
  ...DEFAULT_KEYMAP,

  palette: "Mod+O", // Dynalist's file finder
  sidebar: "Mod+Shift+F", // Dynalist's file pane
  // ⌘⇧F is the file pane above, so workspace search moves next to the palette.
  // Dynalist has no separate global-search chord to copy here.
  search: "Mod+Shift+O",

  collapse: "Mod+.", // already the default; listed because it is Dynalist's too
  zoomIn: "Mod+]",
  zoomOut: "Mod+[",

  // ⌘] and ⌘[ are zoom above. Tab and Shift+Tab still indent — they are the
  // editor, not a binding, and Dynalist indents with them too.
  indent: UNBOUND,
  outdent: UNBOUND,

  // Fidelity costs something here: macOS cycles windows on ⌘` and ⌘⇧`, and
  // Chrome opens its inspector on ⌘⇧C, none of which a page can intercept. A
  // hand that wants those keys back knows them as these, and can rebind any
  // one that its browser eats.
  code: "Mod+`",
  checklist: "Mod+Shift+C",
  colorNone: "Mod+Shift+`"
};

/** Which colour each colour action means, for the handlers that apply them. */
export const COLOR_ACTIONS: [Action, Color][] = [
  ["colorNone", 0],
  ["color1", 1],
  ["color2", 2],
  ["color3", 3],
  ["color4", 4],
  ["color5", 5],
  ["color6", 6]
];

export type PresetName = "editor" | "dynalist";

export const PRESETS: Record<PresetName, Keymap> = {
  editor: DEFAULT_KEYMAP,
  dynalist: DYNALIST_KEYMAP
};

export const PRESET_LABELS: Record<PresetName, string> = {
  editor: "에디터",
  dynalist: "Dynalist"
};

/** Which preset a table *is*, so the panel can say so. Null once edited. */
export function presetOf(keymap: Keymap): PresetName | null {
  const names = Object.keys(PRESETS) as PresetName[];
  return names.find((name) => (Object.keys(PRESETS[name]) as Action[]).every((a) => PRESETS[name][a] === keymap[a])) ?? null;
}

export const ACTION_LABELS: Record<Action, string> = {
  palette: "팔레트",
  commands: "팔레트 — 명령",
  search: "전체 검색",
  filter: "이 문서 안에서 거르기",
  sidebar: "사이드바",
  help: "단축키 도움말",
  undo: "실행 취소",
  redo: "다시 실행",
  bold: "굵게",
  italic: "기울임",
  code: "코드",
  strike: "취소선",
  highlight: "강조",
  link: "링크",
  duplicate: "항목 복제",
  delete: "항목 삭제",
  indent: "들여쓰기",
  outdent: "내어쓰기",
  moveUp: "위로 옮기기",
  moveDown: "아래로 옮기기",
  collapse: "접기 / 펼치기",
  zoomIn: "확대",
  zoomOut: "축소",
  done: "완료 표시",
  collapseAll: "모두 접기",
  expandAll: "모두 펼치기",
  checklist: "체크리스트로 / 끄기",
  numbered: "번호 목록으로 / 끄기",
  color1: "색 — 빨강",
  color2: "색 — 노랑",
  color3: "색 — 초록",
  color4: "색 — 파랑",
  color5: "색 — 보라",
  color6: "색 — 회색",
  colorNone: "색 지우기"
};

type Chord = { mod: boolean; shift: boolean; alt: boolean; key: string };

function parse(spec: string): Chord {
  const parts = spec.split("+");
  const key = parts.pop() ?? "";
  return {
    mod: parts.includes("Mod"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
    key: key.toLowerCase()
  };
}

/**
 * Compared against `event.code` for punctuation and digits, `event.key` for
 * letters and named keys.
 *
 * Punctuation and digits have to go by physical key: with Shift held, `.`
 * reports as `>` and `1` as `!`, and on a non-US layout the character behind a
 * key is anyone's guess. That matters most for the colour labels, which are
 * ⌘⇧1~6 — by character they would simply never fire.
 */
export function matches(event: KeyboardEvent | React.KeyboardEvent, spec: string): boolean {
  // An action left unbound has no keystroke that means it.
  if (spec === UNBOUND) return false;

  const chord = parse(spec);
  const mod = event.metaKey || event.ctrlKey;
  if (chord.mod !== mod || chord.shift !== event.shiftKey || chord.alt !== event.altKey) return false;

  const code = PHYSICAL_KEYS[chord.key];
  if (code) return event.code === code;
  return event.key.toLowerCase() === chord.key;
}

/** Specs whose key is a physical position rather than a character. */
const PHYSICAL_KEYS: Record<string, string> = {
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  "\\": "Backslash",
  "[": "BracketLeft",
  "]": "BracketRight",
  ";": "Semicolon",
  "'": "Quote",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
  "0": "Digit0",
  "1": "Digit1",
  "2": "Digit2",
  "3": "Digit3",
  "4": "Digit4",
  "5": "Digit5",
  "6": "Digit6",
  "7": "Digit7",
  "8": "Digit8",
  "9": "Digit9"
};

/** The spec a keystroke would be written as, for the rebinding recorder. */
export function specOf(event: KeyboardEvent | React.KeyboardEvent): string | null {
  const key = event.key;
  if (["Meta", "Control", "Shift", "Alt"].includes(key)) return null;

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");

  const physical = Object.entries(PHYSICAL_KEYS).find(([, code]) => code === event.code);
  parts.push(physical ? physical[0] : key.length === 1 ? key.toUpperCase() : key);
  // A bare letter is not a shortcut, it is typing.
  return parts.length > 1 ? parts.join("+") : null;
}

/** How a binding is written for a reader: ⌘⇧K rather than Mod+Shift+K. */
export function describe(spec: string): string {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return spec
    .replace("Mod+", mac ? "⌘" : "Ctrl+")
    .replace("Shift+", "⇧")
    .replace("Alt+", mac ? "⌥" : "Alt+")
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓");
}

/* ------------------------------------------------------------------ */

const KEY = "outliner:keys";

export function loadKeymap(): Keymap {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULT_KEYMAP;
    const map = { ...DEFAULT_KEYMAP };
    for (const action of Object.keys(DEFAULT_KEYMAP) as Action[]) {
      // "" is a real value here — an action the user unbound on purpose. Only
      // a missing or non-string entry falls back, which is also how a table
      // saved before a new action existed picks up that action's default.
      const bound = (raw as Record<string, unknown>)[action];
      if (typeof bound === "string") map[action] = bound;
    }
    return map;
  } catch {
    return DEFAULT_KEYMAP;
  }
}

export function saveKeymap(keymap: Keymap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(keymap));
  } catch {
    /* private mode — the defaults come back next time */
  }
}

/** Actions already bound to the same chord, so the panel can say so. */
export function conflicts(keymap: Keymap, action: Action, spec: string): Action[] {
  if (spec === UNBOUND) return [];
  return (Object.keys(keymap) as Action[]).filter((other) => other !== action && keymap[other] === spec);
}
