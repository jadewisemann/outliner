import { useEffect, useMemo, useRef, useState, type ChangeEvent, type SetStateAction } from "react";
import { Outliner } from "../components/Outliner";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import {
  applyImportedOutline,
  exportToJson,
  exportToMarkdown,
  exportToOpml,
  exportToPlainText,
  previewImport,
  type ImportApplyOptions,
  type ImportFormat
} from "../domain/exporters";
import type { OutlineDocument, ViewState } from "../domain/outlineTypes";
import { createBrowserLocalPersistence, type LocalPersistence } from "../persistence/localPersistence";
import type { RemoteStoreV2 } from "../sync/syncTypes";
import { useOutlineWorkspace } from "./useOutlineWorkspace";

const createId = () => crypto.randomUUID();
const now = () => Date.now();

type AppProps = {
  persistence?: LocalPersistence;
  remoteStore?: RemoteStoreV2;
};

export function App({ persistence: providedPersistence, remoteStore }: AppProps = {}) {
  const browserPersistence = useMemo(() => createBrowserLocalPersistence("workspace_root"), []);
  const persistence = providedPersistence ?? browserPersistence;
  const { snapshot, loaded, commitSnapshot, undo, redo, syncStatus } = useOutlineWorkspace({
    persistence,
    remoteStore,
    createId,
    now
  });
  const latestSnapshotRef = useRef(snapshot);
  const pendingSnapshotRef = useRef(snapshot);
  const commitScheduledRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importFormat, setImportFormat] = useState<ImportFormat>("opml");
  const [importMode, setImportMode] = useState<ImportApplyOptions["mode"]>("mergeRoot");
  const [importError, setImportError] = useState<string>();
  latestSnapshotRef.current = snapshot;
  const { document, view } = snapshot;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || (key !== "z" && key !== "y")) {
        return;
      }
      event.preventDefault();
      if (key === "y" || (key === "z" && event.shiftKey)) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [redo, undo]);

  const commit = (nextDocument: OutlineDocument, nextView: ViewState) => {
    const next = { document: nextDocument, view: nextView };
    latestSnapshotRef.current = next;
    pendingSnapshotRef.current = next;
    if (commitScheduledRef.current) {
      return;
    }
    commitScheduledRef.current = true;
    queueMicrotask(() => {
      commitScheduledRef.current = false;
      commitSnapshot(pendingSnapshotRef.current);
    });
  };

  const setDocument = (next: SetStateAction<OutlineDocument>) => {
    const current = latestSnapshotRef.current;
    const nextDocument = typeof next === "function" ? next(current.document) : next;
    commit(nextDocument, current.view);
  };

  const setView = (nextView: ViewState) => {
    const current = latestSnapshotRef.current;
    commit(current.document, nextView);
  };

  const downloadExport = (kind: "json" | "markdown" | "opml" | "plainText", visibleOnly = false) => {
    if (!document) {
      return;
    }
    const options = { visibleOnly, zoomNodeId: view.zoomNodeId };
    const content =
      kind === "json"
        ? exportToJson(document, view)
        : kind === "markdown"
          ? exportToMarkdown(document, options)
          : kind === "opml"
            ? exportToOpml(document, options)
            : exportToPlainText(document, options);
    const type =
      kind === "json"
        ? "application/json"
        : kind === "markdown"
          ? "text/markdown"
          : kind === "opml"
            ? "text/x-opml"
            : "text/plain";
    const extension = kind === "json" ? "json" : kind === "markdown" ? "md" : kind === "opml" ? "opml" : "txt";
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `outliner-export${visibleOnly ? "-visible" : ""}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importOutlineFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const value = await readFileAsText(file);
    const imported = previewImport(value, importFormat, createId, now);
    if (!imported.ok) {
      setImportError(imported.error);
      return;
    }
    const current = latestSnapshotRef.current;
    const options: ImportApplyOptions =
      importMode === "insertUnder"
        ? { mode: "insertUnder", targetNodeId: current.view.selectedNodeId ?? current.document.rootId }
        : { mode: importMode };
    setImportError(undefined);
    commitSnapshot(applyImportedOutline(current, imported, options));
  };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Outliner</h1>
          <p>Local-first keyboard workspace</p>
        </div>
        <div className="top-actions">
          <button type="button" onClick={() => downloadExport("json")}>
            Export JSON
          </button>
          <button type="button" onClick={() => downloadExport("markdown")}>
            Export Markdown
          </button>
          <button type="button" onClick={() => downloadExport("opml")}>
            Export OPML
          </button>
          <button type="button" onClick={() => downloadExport("plainText")}>
            Export Text
          </button>
          <button type="button" onClick={() => downloadExport("opml", true)}>
            Export Visible OPML
          </button>
          <select
            aria-label="Import format"
            value={importFormat}
            onChange={(event) => setImportFormat(event.target.value as ImportFormat)}
          >
            <option value="opml">OPML</option>
            <option value="plainText">Text</option>
          </select>
          <select
            aria-label="Import mode"
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as ImportApplyOptions["mode"])}
          >
            <option value="mergeRoot">Merge at root</option>
            <option value="insertUnder">Insert under selected</option>
            <option value="replace">Replace workspace</option>
          </select>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            Import
          </button>
          <input
            ref={importInputRef}
            aria-label="Import outline file"
            type="file"
            accept=".opml,.xml,.txt,text/plain,text/x-opml,application/xml"
            hidden
            onChange={importOutlineFile}
          />
          <SyncStatusBadge status={syncStatus} />
        </div>
        {importError ? <p role="alert">Import failed: {importError}</p> : null}
      </header>
      {loaded ? (
        <Outliner
          document={document}
          view={view}
          createId={createId}
          now={now}
          onDocumentChange={setDocument}
          onViewChange={setView}
        />
      ) : null}
    </main>
  );
}

function readFileAsText(file: File): Promise<string> {
  if ("text" in file && typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read import file"));
    reader.readAsText(file);
  });
}
