/**
 * Public API of `entities/text`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export { autoDate, dateToken, daysFrom } from "./lib/dates";
export {
  applyCompletion,
  autoFormat,
  completionAt,
  isUrl,
  linkTo,
  toggleLink,
  toggleWrap
} from "./lib/markdown";
export type { Selection, Trigger, WrapKind } from "./lib/markdown";
export { extractTags, inlineDates, renderInline, renderNote, sourceOffset } from "./ui/inline";
