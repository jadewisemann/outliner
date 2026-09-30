/**
 * Public API of `entities/sync`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export { mergeWorkspace } from "./model/merge";
export { useSync } from "./model/useSync";
export { attachmentUrl, MAX_ATTACHMENT_BYTES, nameFor, rememberUpload } from "./api/attachments";
export { allowFolder, announceToOtherTabs, DEFAULT_FOLDER, pickFolder } from "./api/remote";
export type { Revision, SyncConfig, SyncStatus } from "./api/remote";
