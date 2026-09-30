/**
 * Public API of `entities/keymap`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export {
  ACTION_LABELS,
  chordOf,
  COLOR_ACTIONS,
  conflicts,
  describe,
  matches,
  PRESET_LABELS,
  presetOf,
  PRESETS,
  resolveKeymap,
  saveKeymap,
  specOf,
  storedKeymap,
  UNBOUND
} from "./model/keymap";
export type { Action, Keymap, PresetName } from "./model/keymap";
