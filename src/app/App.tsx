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
import { createManualBackup, serializeManualBackup } from "./backup";
import { DEFAULT_PREFERENCES, matchesKeyBinding, normalizePreferences, type CommandId, type PreferenceSettings } from "./preferences";
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
  const { snapshot, loaded, commitSnapshot, snapshotHistory, restoreSnapshot, undo, redo, syncStatus } = useOutlineWorkspace({
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
  const [preferences, setPreferences] = useState<PreferenceSettings>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  latestSnapshotRef.current = snapshot;
  const { document, view } = snapshot;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesKeyBinding(event, preferences.keymap.toggleSettings)) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }
      if (matchesKeyBinding(event, preferences.keymap.redo)) {
        event.preventDefault();
        redo();
        return;
      }
      if (matchesKeyBinding(event, preferences.keymap.undo)) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [preferences.keymap.redo, preferences.keymap.toggleSettings, preferences.keymap.undo, redo, undo]);

  useEffect(() => {
    let cancelled = false;
    persistence.loadPreferences().then((loadedPreferences) => {
      if (!cancelled) {
        setPreferences(normalizePreferences(loadedPreferences));
        setPreferencesLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [persistence]);

  useEffect(() => {
    if (!loaded || !preferencesLoaded) {
      return;
    }
    void persistence.savePreferences(preferences);
  }, [loaded, persistence, preferences, preferencesLoaded]);

  useEffect(() => {
    window.document.documentElement.dataset.theme = preferences.theme;
    window.document.documentElement.dataset.font = preferences.font;
  }, [preferences.font, preferences.theme]);

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

  const downloadBackup = () => {
    const backup = createManualBackup(latestSnapshotRef.current, preferences, snapshotHistory, now());
    const url = URL.createObjectURL(new Blob([serializeManualBackup(backup)], { type: "application/json" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "outliner-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const updatePreference = <K extends keyof PreferenceSettings>(key: K, value: PreferenceSettings[K]) => {
    setPreferences((current) => normalizePreferences({ ...current, [key]: value }));
  };

  const updateKeyBinding = (command: CommandId, value: string) => {
    setPreferences((current) =>
      normalizePreferences({
        ...current,
        keymap: {
          ...current.keymap,
          [command]: value
        }
      })
    );
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
          <button type="button" onClick={downloadBackup}>
            Backup
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
          <button type="button" aria-label="Settings" onClick={() => setSettingsOpen((open) => !open)}>
            Settings
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
      {settingsOpen ? (
        <aside className="settings-panel" aria-label="Settings panel">
          <label>
            Theme
            <select
              aria-label="Theme"
              value={preferences.theme}
              onChange={(event) => updatePreference("theme", event.target.value as PreferenceSettings["theme"])}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Font
            <select
              aria-label="Font"
              value={preferences.font}
              onChange={(event) => updatePreference("font", event.target.value as PreferenceSettings["font"])}
            >
              <option value="system">System</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label>
            <input
              aria-label="Spellcheck"
              type="checkbox"
              checked={preferences.spellcheck}
              onChange={(event) => updatePreference("spellcheck", event.target.checked)}
            />
            Spellcheck
          </label>
          <label>
            <input
              aria-label="Word count"
              type="checkbox"
              checked={preferences.showWordCount}
              onChange={(event) => updatePreference("showWordCount", event.target.checked)}
            />
            Word count
          </label>
          <label>
            <input
              aria-label="Auto focus"
              type="checkbox"
              checked={preferences.autoFocus}
              onChange={(event) => updatePreference("autoFocus", event.target.checked)}
            />
            Auto focus
          </label>
          {(["undo", "redo", "toggleSettings"] as CommandId[]).map((command) => (
            <label key={command}>
              {commandLabel(command)}
              <input
                aria-label={`${commandLabel(command)} shortcut`}
                value={preferences.keymap[command]}
                onChange={(event) => updateKeyBinding(command, event.target.value)}
              />
            </label>
          ))}
        </aside>
      ) : null}
      {preferences.showWordCount ? <p className="word-count">{countWords(document)} words</p> : null}
      {snapshotHistory.length > 0 ? (
        <aside className="history-panel" aria-label="Snapshot history">
          {snapshotHistory.slice(0, 5).map((entry) => (
            <button key={entry.id} type="button" onClick={() => restoreSnapshot(entry.id)}>
              {new Date(entry.createdAt).toLocaleString()} · {previewSnapshot(entry.snapshot.document)}
            </button>
          ))}
        </aside>
      ) : null}
      {loaded ? (
        <Outliner
          document={document}
          view={view}
          createId={createId}
          now={now}
          spellcheck={preferences.spellcheck}
          autoFocus={preferences.autoFocus}
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

function countWords(document: OutlineDocument): number {
  return Object.values(document.nodes)
    .filter((node) => node.id !== document.rootId)
    .reduce((total, node) => total + node.text.trim().split(/\s+/).filter(Boolean).length, 0);
}

function previewSnapshot(document: OutlineDocument): string {
  const firstChildId = document.nodes[document.rootId]?.children[0];
  const text = firstChildId ? document.nodes[firstChildId]?.text.trim() : "";
  return text ? text.slice(0, 40) : "Untitled";
}

function commandLabel(command: CommandId): string {
  return command === "toggleSettings" ? "Settings" : command === "undo" ? "Undo" : "Redo";
}
