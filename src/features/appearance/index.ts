/**
 * Public API of `features/appearance`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export { useAppearance } from "./model/useAppearance";
export { useTheme } from "./model/useTheme";
export { Settings } from "./ui/Settings";
