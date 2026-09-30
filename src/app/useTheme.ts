import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

const KEY = "outliner:theme";

/**
 * What this device saved, or the OS's preference when it saved nothing usable.
 * Storage hands back whatever was ever written under the key, so only the two
 * real values are taken from it.
 */
function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  // A machine in dark mode should not be greeted with a white flash.
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Light or dark, per device — the theme does not travel with the workspace.
 * Written to `data-theme` and saved on every change, the first one included.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((current) => (current === "dark" ? "light" : "dark")), []);

  return { theme, toggleTheme };
}
