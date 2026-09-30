import { useEffect, useState } from "react";
import type { Store } from "../store";
import { nativeInfo } from "../shared/native";
import { allowFolder, pickFolder as pickNativeFolder } from "./api/remote";
import { createPrivateRepo, fetchOauthClientId } from "./api/githubAuth";
import { buildConfig, canCreateRepo, initialForm, type OauthPrefill, type SyncForm } from "./syncForm";

/**
 * Everything the sync panel does: the fields, what this device and this
 * deployment can offer, and the actions behind the buttons. The panel only
 * renders it.
 */
export function useSyncForm(sync: Store["sync"], oauth?: OauthPrefill) {
  const [form, setForm] = useState(() => initialForm(sync.config, oauth));
  const [folderNote, setFolderNote] = useState("");

  // The folder option needs a real path on disk: the desktop shell has one to
  // give, a browser tab and a phone do not.
  const [folders, setFolders] = useState(sync.config?.kind === "file");
  useEffect(() => {
    void nativeInfo().then((info) => {
      if (info && !info.mobile) setFolders(true);
    });
  }, []);

  // The login button only appears when this deployment has the OAuth function.
  const [clientId, setClientId] = useState<string | null>(null);
  const [repoNote, setRepoNote] = useState("");
  useEffect(() => {
    void fetchOauthClientId().then(setClientId);
  }, []);

  /** Writing the value a field already holds changes nothing, as with one state per field. */
  const setField = <K extends keyof SyncForm>(key: K, value: SyncForm[K]) =>
    setForm((current) => (current[key] === value ? current : { ...current, [key]: value }));

  const built = buildConfig(form);

  const pickFolder = () => {
    void pickNativeFolder()
      .then((picked) => {
        if (picked) setField("dir", picked);
      })
      .catch(() => {
        /* the dialog failed to open; the path can still be typed */
      });
  };

  const createRepo = () => {
    const name = form.repo.trim().split("/")[1];
    setRepoNote("만드는 중…");
    void createPrivateRepo(form.token.trim(), name).then((ok) =>
      setRepoNote(ok ? `비공개 저장소 ${form.repo.trim()} 준비됨` : "저장소를 만들지 못했습니다")
    );
  };

  /** Connects to what the fields describe, then calls `onDone`. */
  const save = (onDone: () => void) => {
    if (built?.kind !== "file") {
      sync.setConfig(built);
      onDone();
      return;
    }
    // The shell keeps its own list of folders it may touch; a typed
    // path gets its native confirmation first.
    void allowFolder(built.dir)
      .then((allowed) => {
        if (!allowed) return setFolderNote("폴더를 허용하지 않아 연결하지 않았습니다.");
        sync.setConfig(built);
        onDone();
      })
      .catch(() => setFolderNote("이 폴더를 쓸 수 없습니다."));
  };

  return {
    form,
    setField,
    /** Whether this device can offer the folder option. */
    folders,
    /** The OAuth client id, when this deployment can log in with GitHub. */
    clientId,
    folderNote,
    repoNote,
    canSave: built !== null,
    canCreateRepo: canCreateRepo(form),
    pickFolder,
    createRepo,
    save
  };
}
