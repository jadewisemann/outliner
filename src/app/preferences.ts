export type CommandId =
  | "undo"
  | "redo"
  | "toggleSettings"
  | "openNodePalette"
  | "openCommandPalette"
  | "focusNodeNote"
  | "insertLineBreak"
  | "createSiblingNode"
  | "expandSelection"
  | "selectNodeLine"
  | "deleteNodeLine"
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
export type OutlineDensityPreference = "compact" | "comfortable" | "spacious";
export type ContentWidthPreference = "narrow" | "standard" | "wide" | "full";
export type BulletStylePreference = "circle" | "diamond" | "dash";

export type PreferenceSettings = {
  theme: ThemePreference;
  font: FontPreference;
  outlineDensity: OutlineDensityPreference;
  contentWidth: ContentWidthPreference;
  bulletStyle: BulletStylePreference;
  indentSizePx: number;
  editorFontSizePx: number;
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
  { id: "expandSelection", label: "Expand selection", group: "power", defaultShortcut: "Ctrl+A", palette: false },
  { id: "selectNodeLine", label: "Select current line", group: "power", defaultShortcut: "Ctrl+L", palette: false },
  { id: "deleteNodeLine", label: "Delete current line", group: "power", defaultShortcut: "Ctrl+Shift+K", palette: false },
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
  outlineDensity: "comfortable",
  contentWidth: "standard",
  bulletStyle: "circle",
  indentSizePx: 24,
  editorFontSizePx: 14,
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
export const INDENT_SIZE_MIN = 12;
export const INDENT_SIZE_MAX = 48;
export const EDITOR_FONT_SIZE_MIN = 12;
export const EDITOR_FONT_SIZE_MAX = 22;

export function normalizeTypewriterScrollOffset(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return DEFAULT_PREFERENCES.typewriterScrollOffsetPx;
  }
  return Math.min(TYPEWRITER_SCROLL_OFFSET_MAX, Math.max(TYPEWRITER_SCROLL_OFFSET_MIN, Math.round(numberValue)));
}

export function normalizeIndentSize(value: unknown): number {
  return normalizeBoundedInteger(value, DEFAULT_PREFERENCES.indentSizePx, INDENT_SIZE_MIN, INDENT_SIZE_MAX);
}

export function normalizeEditorFontSize(value: unknown): number {
  return normalizeBoundedInteger(value, DEFAULT_PREFERENCES.editorFontSizePx, EDITOR_FONT_SIZE_MIN, EDITOR_FONT_SIZE_MAX);
}

export function rowHeightForDensity(density: OutlineDensityPreference): number {
  return density === "compact" ? 28 : density === "spacious" ? 40 : 32;
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
    theme: normalizeTheme(value?.theme),
    font: normalizeFont(value?.font),
    outlineDensity: normalizeOutlineDensity(value?.outlineDensity),
    contentWidth: normalizeContentWidth(value?.contentWidth),
    bulletStyle: normalizeBulletStyle(value?.bulletStyle),
    indentSizePx: normalizeIndentSize(value?.indentSizePx),
    editorFontSizePx: normalizeEditorFontSize(value?.editorFontSizePx),
    spellcheck: normalizeBoolean(value?.spellcheck, DEFAULT_PREFERENCES.spellcheck),
    showWordCount: normalizeBoolean(value?.showWordCount, DEFAULT_PREFERENCES.showWordCount),
    showNotes: normalizeBoolean(value?.showNotes, DEFAULT_PREFERENCES.showNotes),
    autoFocus: normalizeBoolean(value?.autoFocus, DEFAULT_PREFERENCES.autoFocus),
    typewriterScrollEnabled: normalizeBoolean(value?.typewriterScrollEnabled, DEFAULT_PREFERENCES.typewriterScrollEnabled),
    typewriterScrollOffsetPx: normalizeTypewriterScrollOffset(value?.typewriterScrollOffsetPx),
    customCss: typeof value?.customCss === "string" ? value.customCss : DEFAULT_PREFERENCES.customCss,
    customCssEnabled: normalizeBoolean(value?.customCssEnabled, DEFAULT_PREFERENCES.customCssEnabled),
    keymap: normalizedKeymap
  };
}

function normalizeTheme(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_PREFERENCES.theme;
}

function normalizeFont(value: unknown): FontPreference {
  return isFontPreference(value) ? value : DEFAULT_PREFERENCES.font;
}

function normalizeOutlineDensity(value: unknown): OutlineDensityPreference {
  return isOutlineDensityPreference(value) ? value : DEFAULT_PREFERENCES.outlineDensity;
}

function normalizeContentWidth(value: unknown): ContentWidthPreference {
  return isContentWidthPreference(value) ? value : DEFAULT_PREFERENCES.contentWidth;
}

function normalizeBulletStyle(value: unknown): BulletStylePreference {
  return isBulletStylePreference(value) ? value : DEFAULT_PREFERENCES.bulletStyle;
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark";
}

function isFontPreference(value: unknown): value is FontPreference {
  return value === "system" || value === "serif" || value === "mono";
}

function isOutlineDensityPreference(value: unknown): value is OutlineDensityPreference {
  return value === "compact" || value === "comfortable" || value === "spacious";
}

function isContentWidthPreference(value: unknown): value is ContentWidthPreference {
  return value === "narrow" || value === "standard" || value === "wide" || value === "full";
}

function isBulletStylePreference(value: unknown): value is BulletStylePreference {
  return value === "circle" || value === "diamond" || value === "dash";
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
