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
  | "done";

export type Keymap = Record<Action, string>;

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
  done: "Mod+Enter"
};

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
  done: "완료 표시"
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
 * Compared against `event.code` for punctuation and `event.key` for letters.
 *
 * Punctuation has to go by physical key: with Shift held, `.` reports as `>`,
 * and on a non-US layout the character behind a key is anyone's guess.
 */
export function matches(event: KeyboardEvent | React.KeyboardEvent, spec: string): boolean {
  const chord = parse(spec);
  const mod = event.metaKey || event.ctrlKey;
  if (chord.mod !== mod || chord.shift !== event.shiftKey || chord.alt !== event.altKey) return false;

  const code = PUNCTUATION[chord.key];
  if (code) return event.code === code;
  if (chord.key.startsWith("arrow") || chord.key === "enter" || chord.key === "tab") {
    return event.key.toLowerCase() === chord.key;
  }
  return event.key.toLowerCase() === chord.key;
}

const PUNCTUATION: Record<string, string> = {
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  "\\": "Backslash",
  "[": "BracketLeft",
  "]": "BracketRight",
  ";": "Semicolon",
  "'": "Quote",
  "-": "Minus",
  "=": "Equal"
};

/** The spec a keystroke would be written as, for the rebinding recorder. */
export function specOf(event: KeyboardEvent | React.KeyboardEvent): string | null {
  const key = event.key;
  if (["Meta", "Control", "Shift", "Alt"].includes(key)) return null;

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");

  const punctuation = Object.entries(PUNCTUATION).find(([, code]) => code === event.code);
  parts.push(punctuation ? punctuation[0] : key.length === 1 ? key.toUpperCase() : key);
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
      const bound = (raw as Record<string, unknown>)[action];
      if (typeof bound === "string" && bound !== "") map[action] = bound;
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
  return (Object.keys(keymap) as Action[]).filter((other) => other !== action && keymap[other] === spec);
}
