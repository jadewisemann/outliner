import { useCallback } from "react";
import type { Store } from "../store";
import { downloadFile } from "../shared/download";
import { detectFormat, exportBackup, exportDoc, importDoc, parseBackup, type Format } from "./formats";

/** Getting outlines in and out of the workspace as files. */
export function useTransfer(store: Store) {
  const exportAs = useCallback(
    (format: Format | "backup") => {
      const { doc, view, workspace } = store;
      if (format === "backup") {
        downloadFile("outliner-backup.json", exportBackup(workspace), "application/json");
        return;
      }
      const extension = format === "opml" ? "opml" : format === "markdown" ? "md" : "txt";
      downloadFile(`${doc.title}.${extension}`, exportDoc(doc, format, view.zoomId), "text/plain");
    },
    [store]
  );

  /**
   * A whole export at once, since that is the shape another outliner hands
   * over: one file per document. A backup among them replaces the workspace
   * and nothing else in the batch is read — the two cannot both be honoured.
   */
  const importFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const content = await file.text();
        const backup = parseBackup(content);
        if (backup) {
          // Importing a backup replaces everything; that decision stays with the user.
          if (confirm("백업 파일입니다. 현재 워크스페이스를 덮어쓸까요?")) store.docs.replaceAll(backup);
          return;
        }
      }

      // Files arrive in whatever order the picker gave them; a stable one
      // keeps the sidebar reproducible across two imports of the same folder.
      for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
        const content = await file.text();
        const title = file.name.replace(/\.[^.]+$/, "");
        store.docs.add(importDoc(title, content, detectFormat(file.name, content)));
      }
    },
    [store]
  );

  return { exportAs, importFiles };
}
