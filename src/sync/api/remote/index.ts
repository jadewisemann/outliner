// The one import path for the transport layer. The split behind it: contract
// (types), rest / github / file (the three backends), codec (byte-stable serialisation),
// settings (localStorage config and the cross-tab ping).
import { createKeyring, plainKeyring } from "../cipher";
import { createGithubBackend, repoFolder } from "./github";
import { createFileBackend } from "./file";
import { createRestBackend } from "./rest";
import type { Backend, SyncConfig } from "./contract";

export type {
  Backend,
  Files,
  GithubVersion,
  History,
  Revision,
  Stored,
  SyncConfig,
  SyncStatus,
  Version
} from "./contract";
export { allowFolder, pickFolder } from "./file";
export {
  announceToOtherTabs,
  hasSynced,
  loadSyncConfig,
  markSynced,
  saveSyncConfig,
  watchOtherTabs
} from "./settings";

export function createBackend(config: SyncConfig): Backend {
  const keys = config.passphrase ? createKeyring(config.passphrase) : plainKeyring();
  if (config.kind === "github") return createGithubBackend(config, keys);
  if (config.kind === "file") return createFileBackend(config, keys);
  return createRestBackend(config, keys);
}

/** Stable identity of a remote, for the has-ever-synced marker. */
export function configKey(config: SyncConfig): string {
  if (config.kind === "github") return `github:${config.repo}#${repoFolder(config.path)}`;
  if (config.kind === "file") return `file:${config.dir}`;
  return config.url;
}
