export type CommandId = "undo" | "redo" | "toggleSettings";

export type ThemePreference = "light" | "dark";
export type FontPreference = "system" | "serif" | "mono";

export type PreferenceSettings = {
  theme: ThemePreference;
  font: FontPreference;
  spellcheck: boolean;
  showWordCount: boolean;
  autoFocus: boolean;
  keymap: Record<CommandId, string>;
};

export const DEFAULT_PREFERENCES: PreferenceSettings = {
  theme: "light",
  font: "system",
  spellcheck: true,
  showWordCount: true,
  autoFocus: true,
  keymap: {
    undo: "Mod+Z",
    redo: "Mod+Y",
    toggleSettings: "Mod+,"
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
  const wantsShift = parts.includes("Shift");
  const wantsAlt = parts.includes("Alt");
  return (
    event.key.toLowerCase() === key.toLowerCase() &&
    (event.metaKey || event.ctrlKey) === wantsMod &&
    event.shiftKey === wantsShift &&
    event.altKey === wantsAlt
  );
}
