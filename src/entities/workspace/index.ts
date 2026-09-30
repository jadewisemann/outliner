/**
 * Public API of `entities/workspace`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export { recentDocs } from "./model/recent";
export { useStore } from "./model/store";
export type { Store } from "./model/store";
