import { useCallback, useEffect, useState } from "react";
import { makeWorkspace, type Workspace } from "../types";
import { loadLocal, requestPersistence, saveWorkspace, type StorageGrade } from "./persist";

const SAVE_DEBOUNCE_MS = 400;

/**
 * The workspace on this device's disk: loaded once at start, saved shortly
 * after every change and once more on the way out, and kept at the most
 * durable storage grade the browser will grant.
 *
 * The caller owns the workspace. `apply` installs the loaded one, and
 * `onSaved` runs after each save that landed. Both must keep one identity for
 * the component's life, as a `useCallback` with no dependencies or a module
 * function does: the load runs once and the save follows only `workspace`.
 */
export function usePersistence(options: {
  workspace: Workspace | null;
  apply(next: Workspace): void;
  onSaved(): void;
}) {
  const { workspace, apply, onSaved } = options;
  const [saveFailed, setSaveFailed] = useState(false);
  const [storageGrade, setStorageGrade] = useState<StorageGrade>("unknown");

  useEffect(() => {
    let cancelled = false;
    void loadLocal().then((loaded) => {
      if (cancelled) return;
      const next = loaded && Object.keys(loaded.docs).length > 0 ? loaded : makeWorkspace();
      apply(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Asked on every start rather than once: the browser's answer changes as the
  // user commits to the app (installs it, bookmarks it, keeps coming back), so
  // a no from the first visit is not the standing answer.
  const askForDurableStorage = useCallback(() => void requestPersistence().then(setStorageGrade), []);
  useEffect(askForDurableStorage, [askForDurableStorage]);

  // Debounced saving: one timer, driven by actual changes rather than a
  // polling flag.
  useEffect(() => {
    if (!workspace) return;
    const timer = setTimeout(() => {
      void saveWorkspace(workspace).then(() => {
        setSaveFailed(false);
        onSaved();
      }, () => setSaveFailed(true));
    }, SAVE_DEBOUNCE_MS);
    // Best effort on the way out; a failure has nowhere left to be shown.
    const flush = () => void saveWorkspace(workspace).catch(() => undefined);
    window.addEventListener("beforeunload", flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeunload", flush);
    };
  }, [workspace]);

  return { saveFailed, storage: { grade: storageGrade, request: askForDurableStorage } };
}
