import { useCallback, useMemo, useState } from "react";
import { resolveKeymap, saveKeymap, storedKeymap, type Keymap } from "@/entities/keymap";
import type { Store } from "@/entities/workspace";

/**
 * The keyboard table in force — the one the window keys, the rows and the
 * help panel all read — and the way to change it.
 */
export function useKeymapSetting(setting: Store["keymap"], saveSetting: Store["setKeymap"]) {
  // Until the workspace carries a table, whatever this device stored before
  // the setting started travelling still applies (ADR-0008). Read once: it is
  // a fallback, not a second source of truth.
  const [deviceKeymap] = useState<Keymap | null>(storedKeymap);

  // The workspace's table when there is one, this device's old one until then.
  const keymap = useMemo(
    () => (setting ? resolveKeymap(setting.keys) : (deviceKeymap ?? resolveKeymap(null))),
    [setting, deviceKeymap]
  );

  const setKeymap = useCallback(
    (next: Keymap) => {
      // Kept on the device too, so a rebinding made before this workspace has
      // ever synced still survives a reload.
      saveKeymap(next);
      saveSetting(next);
    },
    [saveSetting]
  );

  return { keymap, setKeymap };
}
