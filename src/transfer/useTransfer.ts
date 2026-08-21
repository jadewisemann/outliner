import { useCallback } from "react";
import type { Store } from "../store";
import { downloadFile } from "../shared/download";
import type { Id } from "../types";
import { detectFormat, exportBackup, exportDoc, importDoc, isImportable, parseBackup, type Format } from "./formats";
import { directoryOf, pathOf } from "./paths";

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
   *
   * Directories among them are rebuilt as folders. An outliner's export is a
   * tree, and flattening it loses something the user arranged by hand and
   * cannot get back from the files — so the shape of the export is part of
   * what is being imported, not packaging around it.
   */
  const importFiles = useCallback(
    async (files: File[]) => {
      // A directory picker hands over everything it found — `accept` is only
      // honoured by the plain file picker — so the readable files are picked
      // out first. Without this an unrecognised file would fall through to
      // plain text and land as a document full of junk. Saying so matters when
      // it leaves nothing: an import that silently does nothing reads as a bug.
      const readable = files.filter((file) => isImportable(file.name));
      if (readable.length === 0) {
        alert("가져올 수 있는 파일이 없습니다 — Markdown·OPML·텍스트·백업(JSON) 파일을 넣어주세요.");
        return;
      }

      for (const file of readable) {
        const content = await file.text();
        const backup = parseBackup(content);
        if (backup) {
          // Importing a backup replaces everything; that decision stays with the user.
          if (confirm("백업 파일입니다. 현재 워크스페이스를 덮어쓸까요?")) store.docs.replaceAll(backup);
          return;
        }
      }

      // Files arrive in whatever order the picker gave them; a stable one keeps
      // the sidebar reproducible across two imports of the same folder. Sorting
      // by path rather than by name also groups each directory's files
      // together, so the folders come out in a readable order.
      const ordered = [...readable].sort((a, b) => pathOf(a).localeCompare(pathOf(b)));

      // Folders are made on the way past and remembered by their path, so a
      // directory holding twenty files becomes one folder rather than twenty.
      // Never reused across imports, though: an existing folder that happens to
      // share a name is a different folder, and quietly merging into it would
      // put the new notes somewhere the user did not ask for.
      const made = new Map<string, Id | null>([["", null]]);
      const folderFor = (path: string): Id | null => {
        const remembered = made.get(path);
        if (remembered !== undefined) return remembered;
        const cut = path.lastIndexOf("/");
        const parent = folderFor(cut === -1 ? "" : path.slice(0, cut));
        const id = store.docs.createFolder(path.slice(cut + 1), parent).id;
        made.set(path, id);
        return id;
      };

      for (const file of ordered) {
        const content = await file.text();
        const title = file.name.replace(/\.[^.]+$/, "");
        const parent = folderFor(directoryOf(pathOf(file)));
        store.docs.add({ ...importDoc(title, content, detectFormat(file.name, content)), parent });
      }
    },
    [store]
  );

  return { exportAs, importFiles };
}
