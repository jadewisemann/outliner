import { useEffect, useMemo, useState } from "react";
import { Outliner } from "../components/Outliner";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import {
  createEmptyDocument,
  createInitialView,
  ensureEditableNode,
  ROOT_ID
} from "../domain/outline";
import { exportToJson, exportToMarkdown } from "../domain/exporters";
import type { OutlineDocument, ViewState } from "../domain/outlineTypes";
import { createBrowserLocalPersistence } from "../persistence/localPersistence";
import type { SyncStatus } from "../sync/syncTypes";

const createId = () => crypto.randomUUID();
const now = () => Date.now();

export function App() {
  const persistence = useMemo(() => createBrowserLocalPersistence("workspace_root"), []);
  const [document, setDocument] = useState<OutlineDocument>(() => {
    const seeded = ensureEditableNode(createEmptyDocument(now), createId, now);
    return seeded.document;
  });
  const [view, setView] = useState<ViewState>(() => createInitialView(document));
  const [syncStatus] = useState<SyncStatus>("local-only");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    persistence.load().then((snapshot) => {
      if (cancelled) {
        return;
      }
      if (snapshot) {
        const restored = ensureEditableNode(snapshot.document, createId, now);
        setDocument(restored.document);
        setView({
          zoomNodeId: snapshot.view.zoomNodeId || ROOT_ID,
          selectedNodeId: snapshot.view.selectedNodeId ?? restored.nodeId
        });
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [persistence]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    void persistence.save({ document, view });
  }, [document, loaded, persistence, view]);

  const downloadExport = (kind: "json" | "markdown") => {
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
