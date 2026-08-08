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

  const importFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      const backup = parseBackup(content);
      if (backup) {
        // Importing a backup replaces everything; that decision stays with the user.
        if (confirm("백업 파일입니다. 현재 워크스페이스를 덮어쓸까요?")) store.docs.replaceAll(backup);
        return;
      }
      const title = file.name.replace(/\.[^.]+$/, "");
      store.docs.add(importDoc(title, content, detectFormat(file.name, content)));
    },
    [store]
  );

  return { exportAs, importFile };
}
