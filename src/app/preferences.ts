export type CommandId =
  | "undo"
  | "redo"
  | "toggleSettings"
  | "openNodePalette"
  | "openCommandPalette"
  | "focusNodeNote"
  | "createSiblingNode";

export type ThemePreference = "light" | "dark";
export type FontPreference = "system" | "serif" | "mono";

export type PreferenceSettings = {
  theme: ThemePreference;
  font: FontPreference;
  spellcheck: boolean;
  showWordCount: boolean;
  showNotes: boolean;
  autoFocus: boolean;
  customCss: string;
  customCssEnabled: boolean;
  keymap: Record<CommandId, string>;
};

export const DEFAULT_PREFERENCES: PreferenceSettings = {
  theme: "light",
  font: "system",
  spellcheck: true,
  showWordCount: true,
  showNotes: true,
  autoFocus: true,
  customCss: "",
  customCssEnabled: false,
  keymap: {
    undo: "Mod+Z",
    redo: "Mod+Y",
    toggleSettings: "Mod+,",
    openNodePalette: "Mod+P",
    openCommandPalette: "Mod+Shift+P",
    focusNodeNote: "Shift+Enter",
    createSiblingNode: "Mod+Enter"
  }
};

export function normalizePreferences(value: Partial<PreferenceSettings> | null | undefined): PreferenceSettings {
  return {
    ...DEFAULT_PREFERENCES,
    ...value,
    keymap: {
      ...DEFAULT_PREFERENCES.keymap,
      ...value?.keymap
    }
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
