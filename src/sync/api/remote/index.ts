// The one import path for the transport layer. The split behind it: contract
// (types), rest / github (the two backends), codec (byte-stable serialisation),
// settings (localStorage config and the cross-tab ping).
import { createKeyring, plainKeyring } from "../cipher";
import { createGithubBackend, repoFolder } from "./github";
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
  return config.kind === "github" ? createGithubBackend(config, keys) : createRestBackend(config, keys);
}

/** Stable identity of a remote, for the has-ever-synced marker. */
export function configKey(config: SyncConfig): string {
  return config.kind === "github" ? `github:${config.repo}#${repoFolder(config.path)}` : config.url;
}
