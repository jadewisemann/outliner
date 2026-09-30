/**
 * Public API of `features/sync-settings`. Other slices import from here, never from a file
 * inside; anything not listed is internal to the slice.
 */
export type { OauthPrefill } from "./model/syncForm";
export { completeGithubLogin, fetchGithubLogin } from "./api/githubAuth";
export { SyncBadge, SyncSettings } from "./ui/SyncSettings";
