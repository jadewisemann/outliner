import { useEffect, useState } from "react";
import { applyAppearance, loadAppearance, saveAppearance, type Appearance } from "./appearance";

/** The text settings in force on this device: written to the page and saved on every change. */
export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);

  useEffect(() => {
    applyAppearance(appearance);
    saveAppearance(appearance);
  }, [appearance]);

  return { appearance, setAppearance };
}
