import { DEFAULT_FOLDER, type SyncConfig } from "./api/remote";

/** Token and prefill handed over after a completed GitHub login. */
export type OauthPrefill = { token: string; login: string | null };

/** What the fields of the sync panel hold. */
export type SyncForm = {
  mode: SyncConfig["kind"];
  url: string;
  repo: string;
  path: string;
  token: string;
  dir: string;
  passphrase: string;
  markdown: boolean;
};

/** `owner/name`, which saving a GitHub config and creating the repository both require. */
const REPO_PATTERN = /^[^\s/]+\/[^\s/]+$/;

/** The fields as the panel opens: the saved config, or what a GitHub login just handed over. */
export function initialForm(config: SyncConfig | null, oauth?: OauthPrefill): SyncForm {
  return {
    mode: oauth ? "github" : config?.kind ?? "rest",
    url: config?.kind === "rest" ? config.url : "",
    repo: config?.kind === "github" ? config.repo : oauth?.login ? `${oauth.login}/outliner` : "",
    path: config?.kind === "github" ? config.path : DEFAULT_FOLDER,
    token: oauth?.token ?? (config && config.kind !== "file" ? config.token : ""),
    dir: config?.kind === "file" ? config.dir : "",
    passphrase: config?.passphrase ?? "",
    markdown: config?.kind === "github" && config.markdown === true
  };
}

/**
 * The config the fields describe, or null while they are incomplete.
 *
 * The Markdown copy is dropped while a passphrase is set: a plaintext copy
 * beside the ciphertext would undo the encryption. The GitHub backend applies
 * the same rule on its own (DESIGN.md principle 19).
 */
export function buildConfig(form: SyncForm): SyncConfig | null {
  const { mode, url, repo, path, token, dir, passphrase, markdown } = form;
  const secret = passphrase === "" ? undefined : passphrase;
  return mode === "file"
    ? dir.trim() !== ""
      ? { kind: "file", dir: dir.trim(), passphrase: secret }
      : null
    : mode === "github"
    ? REPO_PATTERN.test(repo.trim()) && token.trim() !== ""
      ? {
          kind: "github",
          repo: repo.trim(),
          path: path.trim() || DEFAULT_FOLDER,
          token: token.trim(),
          passphrase: secret,
          markdown: markdown && secret === undefined ? true : undefined
        }
      : null
    : url.trim() !== ""
      ? { kind: "rest", url: url.trim(), token: token.trim(), passphrase: secret }
      : null;
}

/**
 * Whether the create-repository button can be offered. It needs the same
 * `owner/name` as saving does, but only some token — unlike saving, not one
 * that is still there once trimmed.
 */
export function canCreateRepo(form: SyncForm): boolean {
  return form.token !== "" && REPO_PATTERN.test(form.repo.trim());
}
