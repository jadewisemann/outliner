export type CommandId =
  | "undo"
  | "redo"
  | "toggleSettings"
  | "openNodePalette"
  | "openCommandPalette"
  | "focusNodeNote"
  | "insertLineBreak"
  | "createSiblingNode"
  | "setHeading1"
  | "setHeading2"
  | "setHeading3"
  | "clearHeading"
  | "setTextColor"
  | "resetTextColor"
  | "openFormatHelp"
  | "toggleCollapse"
  | "indentNode"
  | "outdentNode"
  | "moveNodeUp"
  | "moveNodeDown"
  | "addCursorUp"
  | "addCursorDown"
  | "clearPowerSelection";

export type ThemePreference = "light" | "dark";
export type FontPreference = "system" | "serif" | "mono";

export type PreferenceSettings = {
  theme: ThemePreference;
  font: FontPreference;
  spellcheck: boolean;
  showWordCount: boolean;
  showNotes: boolean;
  autoFocus: boolean;
  typewriterScrollEnabled: boolean;
  typewriterScrollOffsetPx: number;
  customCss: string;
  customCssEnabled: boolean;
  keymap: Record<CommandId, string>;
};

export type CommandDefinition = {
  id: CommandId;
  label: string;
  group: "global" | "editor" | "format" | "power";
  defaultShortcut: string;
  palette: boolean;
};

export const COMMAND_REGISTRY: CommandDefinition[] = [
  { id: "undo", label: "Undo", group: "global", defaultShortcut: "Mod+Z", palette: false },
  { id: "redo", label: "Redo", group: "global", defaultShortcut: "Mod+Y", palette: false },
  { id: "toggleSettings", label: "Settings", group: "global", defaultShortcut: "Mod+,", palette: true },
  { id: "openNodePalette", label: "Node palette", group: "global", defaultShortcut: "Mod+P", palette: false },
  { id: "openCommandPalette", label: "Command palette", group: "global", defaultShortcut: "Mod+Shift+P", palette: false },
  { id: "focusNodeNote", label: "Edit note", group: "editor", defaultShortcut: "Shift+Enter", palette: true },
  { id: "insertLineBreak", label: "Insert line break", group: "editor", defaultShortcut: "Alt+Enter", palette: false },
  { id: "createSiblingNode", label: "Create sibling node", group: "editor", defaultShortcut: "Mod+Enter", palette: false },
  { id: "setHeading1", label: "Set heading 1", group: "format", defaultShortcut: "", palette: true },
  { id: "setHeading2", label: "Set heading 2", group: "format", defaultShortcut: "", palette: true },
  { id: "setHeading3", label: "Set heading 3", group: "format", defaultShortcut: "", palette: true },
  { id: "clearHeading", label: "Clear heading", group: "format", defaultShortcut: "", palette: true },
  { id: "setTextColor", label: "Set text color", group: "format", defaultShortcut: "", palette: true },
  { id: "resetTextColor", label: "Reset text color", group: "format", defaultShortcut: "", palette: true },
  { id: "openFormatHelp", label: "Formatting syntax help", group: "format", defaultShortcut: "", palette: true },
  { id: "toggleCollapse", label: "Toggle collapse", group: "editor", defaultShortcut: "Mod+.", palette: true },
  { id: "indentNode", label: "Indent node", group: "editor", defaultShortcut: "Tab", palette: true },
  { id: "outdentNode", label: "Outdent node", group: "editor", defaultShortcut: "Shift+Tab", palette: true },
  { id: "moveNodeUp", label: "Move node up", group: "power", defaultShortcut: "Alt+ArrowUp", palette: true },
  { id: "moveNodeDown", label: "Move node down", group: "power", defaultShortcut: "Alt+ArrowDown", palette: true },
  { id: "addCursorUp", label: "Add cursor above", group: "power", defaultShortcut: "Mod+Alt+ArrowUp", palette: false },
  { id: "addCursorDown", label: "Add cursor below", group: "power", defaultShortcut: "Mod+Alt+ArrowDown", palette: false },
  { id: "clearPowerSelection", label: "Clear power selection", group: "power", defaultShortcut: "Escape", palette: false }
];

export const DEFAULT_KEYMAP: Record<CommandId, string> = Object.fromEntries(
  COMMAND_REGISTRY.map((command) => [command.id, command.defaultShortcut])
) as Record<CommandId, string>;

export const DEFAULT_PREFERENCES: PreferenceSettings = {
  theme: "light",
  font: "system",
  spellcheck: true,
  showWordCount: true,
  showNotes: true,
  autoFocus: true,
  typewriterScrollEnabled: false,
  typewriterScrollOffsetPx: 0,
  customCss: "",
  customCssEnabled: false,
  keymap: DEFAULT_KEYMAP
};

export const TYPEWRITER_SCROLL_OFFSET_MIN = -240;
export const TYPEWRITER_SCROLL_OFFSET_MAX = 240;

export function normalizeTypewriterScrollOffset(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return DEFAULT_PREFERENCES.typewriterScrollOffsetPx;
  }
  return Math.min(TYPEWRITER_SCROLL_OFFSET_MAX, Math.max(TYPEWRITER_SCROLL_OFFSET_MIN, Math.round(numberValue)));
}

export function normalizePreferences(value: Partial<PreferenceSettings> | null | undefined): PreferenceSettings {
  const incomingKeymap = (value?.keymap ?? {}) as Partial<Record<CommandId, string>>;
  const normalizedKeymap = { ...DEFAULT_KEYMAP };
  for (const command of COMMAND_REGISTRY) {
    const value = incomingKeymap[command.id];
    if (typeof value === "string") {
      normalizedKeymap[command.id] = value;
    }
  }
  return {
    ...DEFAULT_PREFERENCES,
    ...value,
    typewriterScrollOffsetPx: normalizeTypewriterScrollOffset(value?.typewriterScrollOffsetPx),
    keymap: normalizedKeymap
  };
}

export function matchesKeyBinding(event: KeyboardEvent, binding: string): boolean {
  const parts = binding.split("+");
  const key = parts.at(-1)?.toLowerCase();
  if (!key) {
    return false;
  }
  const wantsMod = parts.includes("Mod");
  const wantsCtrl = parts.includes("Ctrl") || parts.includes("Control");
  const wantsMeta = parts.includes("Meta") || parts.includes("Cmd");
  const wantsShift = parts.includes("Shift");
  const wantsAlt = parts.includes("Alt");
  const modMatches = wantsMod ? event.metaKey || event.ctrlKey : true;
  const ctrlMatches = wantsCtrl ? event.ctrlKey : !event.ctrlKey || wantsMod;
  const metaMatches = wantsMeta ? event.metaKey : !event.metaKey || wantsMod;
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    modMatches &&
    ctrlMatches &&
    metaMatches &&
    (wantsMod || wantsCtrl || wantsMeta || (!event.metaKey && !event.ctrlKey)) &&
    event.shiftKey === wantsShift &&
    event.altKey === wantsAlt
  );
}
