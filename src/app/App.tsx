import { useEffect, useMemo, useRef, type SetStateAction } from "react";
import { Outliner } from "../components/Outliner";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import { exportToJson, exportToMarkdown } from "../domain/exporters";
import type { OutlineDocument, ViewState } from "../domain/outlineTypes";
import { createBrowserLocalPersistence, type LocalPersistence } from "../persistence/localPersistence";
import type { SyncStatus } from "../sync/syncTypes";
import { useOutlineWorkspace } from "./useOutlineWorkspace";

const createId = () => crypto.randomUUID();
const now = () => Date.now();
const syncStatus: SyncStatus = "local-only";

type AppProps = {
  persistence?: LocalPersistence;
};

export function App({ persistence: providedPersistence }: AppProps = {}) {
  const browserPersistence = useMemo(() => createBrowserLocalPersistence("workspace_root"), []);
  const persistence = providedPersistence ?? browserPersistence;
  const { snapshot, commitSnapshot, undo, redo } = useOutlineWorkspace({ persistence, createId, now });
  const latestSnapshotRef = useRef(snapshot);
  const pendingSnapshotRef = useRef(snapshot);
  const commitScheduledRef = useRef(false);
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

  const downloadExport = (kind: "json" | "markdown") => {
    if (!document) {
      return;
    }
    const content = kind === "json" ? exportToJson(document, view) : exportToMarkdown(document);
    const type = kind === "json" ? "application/json" : "text/markdown";
    const extension = kind === "json" ? "json" : "md";
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `outliner-export.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          <SyncStatusBadge status={syncStatus} />
        </div>
      </header>
      <Outliner
        document={document}
        view={view}
        createId={createId}
        now={now}
        onDocumentChange={setDocument}
        onViewChange={setView}
      />
    </main>
  );
}
