/**
 * Public API of `entities/outline`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export * as documents from "./model/documents";
export { createHistory } from "./model/history";
export {
  ancestors,
  appendChild,
  bulkIndent,
  bulkMove,
  bulkOutdent,
  bulkPatch,
  bulkRemove,
  bulkSetCollapsed,
  duplicate,
  ensureEditable,
  indent,
  insertAfter,
  insertOutlineText,
  mergeIntoPrevious,
  moveVertically,
  outdent,
  parentOf,
  patchNode,
  rebuildChildren,
  reparent,
  reveal,
  rowAfter,
  rowBefore,
  setCollapsedDeep,
  splitAt,
  toOutlineText,
  topLevel,
  visibleRows,
  widerScope
} from "./model/tree";
export type { Edit } from "./model/tree";
export {
  docList,
  docTree,
  hasContent,
  inboxDoc,
  makeDoc,
  makeFolder,
  makeNode,
  makeSearch,
  makeWorkspace,
  payloadChanged,
  payloadOf,
  realDocs,
  stamp,
  trashed
} from "./model/types";
export type {
  Color,
  Doc,
  DocView,
  Id,
  KeymapSetting,
  Node,
  Row,
  Stamp,
  SyncPayload,
  Workspace
} from "./model/types";
export { readDoc, readGraves, readKeymap, readPayload } from "./model/validate";
export { loadLocal, loadWorkspace, requestPersistence, saveWorkspace } from "./api/persist";
export type { StorageGrade } from "./api/persist";
export {
  detectFormat,
  exportBackup,
  exportDoc,
  IMPORT_ACCEPT,
  importDoc,
  isImportable,
  parseBackup
} from "./lib/formats";
export type { Format } from "./lib/formats";
