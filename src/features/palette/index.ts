/**
 * Public API of `features/palette`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export { buildCommands } from "./model/commands";
export { Palette } from "./ui/Palette";
