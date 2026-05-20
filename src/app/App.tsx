import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction
} from "react";
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
import type { NodeId, OutlineDocument, ViewState } from "../domain/outlineTypes";
import { revealNode } from "../domain/outline";
import { getVisibleNodes } from "../domain/outlineSelectors";
import { searchOutline } from "../domain/searchSelectors";
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
  const [recentNodeIds, setRecentNodeIds] = useState<NodeId[]>([]);
  const [customCssError, setCustomCssError] = useState<string>();
  latestSnapshotRef.current = snapshot;
  const { document, view } = snapshot;
  const scopedCustomCss = useMemo(
    () => (preferences.customCssEnabled ? scopeCustomCss(preferences.customCss) : { css: "" }),
    [preferences.customCss, preferences.customCssEnabled]
  );
  const commandPaletteItems = useMemo(
    () =>
      buildCommandPaletteItems({
        document,
        view,
        query: commandPaletteQuery,
        recentNodeIds,
        openSettings: (section) => {
          setSettingsSection(section);
          setSettingsOpen(true);
        },
        closePalette: () => setCommandPaletteOpen(false),
        jumpToNode: (nodeId) => {
          const current = latestSnapshotRef.current;
          const nextDocument = revealNode(current.document, nodeId, now);
          commit(nextDocument, { ...current.view, selectedNodeId: nodeId });
        }
      }),
    [commandPaletteQuery, document, recentNodeIds, view]
  );

  useEffect(() => {
    if (!view.selectedNodeId || view.selectedNodeId === document.rootId || !document.nodes[view.selectedNodeId]) {
      return;
    }
    setRecentNodeIds((current) => [view.selectedNodeId!, ...current.filter((nodeId) => nodeId !== view.selectedNodeId)].slice(0, 6));
  }, [document.nodes, document.rootId, view.selectedNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesKeyBinding(event, preferences.keymap.toggleSettings)) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }
      if (matchesKeyBinding(event, preferences.keymap.openCommandPalette)) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        setCommandPaletteQuery(">");
        setCommandPaletteIndex(0);
        return;
      }
      if (matchesKeyBinding(event, preferences.keymap.openNodePalette)) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        setCommandPaletteQuery("");
        setCommandPaletteIndex(0);
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
  }, [
    preferences.keymap.openCommandPalette,
    preferences.keymap.openNodePalette,
    preferences.keymap.redo,
    preferences.keymap.toggleSettings,
    preferences.keymap.undo,
    redo,
    undo
  ]);

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

  useEffect(() => {
    setCustomCssError(scopedCustomCss.error);
  }, [scopedCustomCss.error]);

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

  const runCommandPaletteItem = (item: CommandPaletteItem | undefined) => {
    if (!item) {
      return;
    }
    item.run();
    setCommandPaletteOpen(false);
    setCommandPaletteQuery("");
    setCommandPaletteIndex(0);
  };

  const handleCommandPaletteKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandPaletteIndex((index) => Math.min(index + 1, Math.max(0, commandPaletteItems.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandPaletteIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runCommandPaletteItem(commandPaletteItems[commandPaletteIndex]);
    }
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
      <style data-testid="custom-css-style">{scopedCustomCss.css}</style>
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
        <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <SettingsPanel
            preferences={preferences}
            section={settingsSection}
            customCssError={customCssError}
            onSectionChange={setSettingsSection}
            onPreferenceChange={updatePreference}
            onKeyBindingChange={updateKeyBinding}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
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
        <div className="outliner-custom-css-scope">
          <Outliner
            document={document}
            view={view}
            createId={createId}
            now={now}
            spellcheck={preferences.spellcheck}
            autoFocus={preferences.autoFocus}
            showNotes={preferences.showNotes}
            keymap={preferences.keymap}
            onDocumentChange={setDocument}
            onViewChange={setView}
          />
        </div>
      ) : null}
      {commandPaletteOpen ? (
        <div className="command-palette-backdrop" role="presentation" onMouseDown={() => setCommandPaletteOpen(false)}>
          <section
            className="command-palette"
            role="dialog"
            aria-label="Command palette"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              autoFocus
              type="search"
              aria-label="Command palette search"
              value={commandPaletteQuery}
              placeholder={commandPaletteQuery.startsWith(">") ? "Type a command" : "Search nodes, or type > for commands"}
              onChange={(event) => {
                setCommandPaletteQuery(event.target.value);
                setCommandPaletteIndex(0);
              }}
              onKeyDown={handleCommandPaletteKeyDown}
            />
            <div className="command-palette-results" role="listbox" aria-label="Command palette results">
              {commandPaletteItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={index === commandPaletteIndex ? "command-palette-result-active" : ""}
                  role="option"
                  aria-selected={index === commandPaletteIndex}
                  onMouseEnter={() => setCommandPaletteIndex(index)}
                  onClick={() => runCommandPaletteItem(item)}
                >
                  <span className="command-palette-result-main">
                    <span>{item.title}</span>
                    {item.preview ? <span className="command-palette-preview">{item.preview}</span> : null}
                  </span>
                  <small>{item.kind}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

type SettingsSection = "general" | "editor" | "appearance" | "shortcuts" | "customCss" | "sync";

type CommandPaletteItem = {
  id: string;
  title: string;
  kind: string;
  preview?: string;
  run: () => void;
};

function SettingsPanel({
  preferences,
  section,
  customCssError,
  onSectionChange,
  onPreferenceChange,
  onKeyBindingChange,
  onClose
}: {
  preferences: PreferenceSettings;
  section: SettingsSection;
  customCssError?: string;
  onSectionChange: (section: SettingsSection) => void;
  onPreferenceChange: <K extends keyof PreferenceSettings>(key: K, value: PreferenceSettings[K]) => void;
  onKeyBindingChange: (command: CommandId, value: string) => void;
  onClose: () => void;
}) {
  const keyCommands: CommandId[] = [
    "undo",
    "redo",
    "toggleSettings",
    "openNodePalette",
    "openCommandPalette",
    "focusNodeNote",
    "createSiblingNode"
  ];
  const duplicateShortcuts = findDuplicateShortcuts(preferences.keymap);
  return (
    <aside className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
      <div className="settings-header">
        <strong>Settings</strong>
        <button type="button" aria-label="Close settings" onClick={onClose}>
          Close
        </button>
      </div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "settings-tab-active" : ""}
            onClick={() => onSectionChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="settings-section">
        {section === "general" ? (
          <>
            <label>
              Theme
              <select
                aria-label="Theme"
                value={preferences.theme}
                onChange={(event) => onPreferenceChange("theme", event.target.value as PreferenceSettings["theme"])}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              <input
                aria-label="Word count"
                type="checkbox"
                checked={preferences.showWordCount}
                onChange={(event) => onPreferenceChange("showWordCount", event.target.checked)}
              />
              Word count
            </label>
            <label>
              <input
                aria-label="Show notes"
                type="checkbox"
                checked={preferences.showNotes}
                onChange={(event) => onPreferenceChange("showNotes", event.target.checked)}
              />
              Show notes
            </label>
          </>
        ) : null}
        {section === "editor" ? (
          <>
            <label>
              <input
                aria-label="Spellcheck"
                type="checkbox"
                checked={preferences.spellcheck}
                onChange={(event) => onPreferenceChange("spellcheck", event.target.checked)}
              />
              Spellcheck
            </label>
            <label>
              <input
                aria-label="Auto focus"
                type="checkbox"
                checked={preferences.autoFocus}
                onChange={(event) => onPreferenceChange("autoFocus", event.target.checked)}
              />
              Auto focus
            </label>
          </>
        ) : null}
        {section === "appearance" ? (
          <label>
            Font
            <select
              aria-label="Font"
              value={preferences.font}
              onChange={(event) => onPreferenceChange("font", event.target.value as PreferenceSettings["font"])}
            >
              <option value="system">System</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
        ) : null}
        {section === "shortcuts" ? (
          <>
            {keyCommands.map((command) => {
              const duplicate = duplicateShortcuts.has(preferences.keymap[command].toLocaleLowerCase());
              return (
                <label key={command}>
                  {commandLabel(command)}
                  <input
                    aria-label={`${commandLabel(command)} shortcut`}
                    value={preferences.keymap[command]}
                    onChange={(event) => onKeyBindingChange(command, event.target.value)}
                  />
                  {duplicate ? <span role="alert">Shortcut conflict</span> : null}
                </label>
              );
            })}
          </>
        ) : null}
        {section === "customCss" ? (
          <>
            <label>
              <input
                aria-label="Enable custom CSS"
                type="checkbox"
                checked={preferences.customCssEnabled}
                onChange={(event) => onPreferenceChange("customCssEnabled", event.target.checked)}
              />
              Enable custom CSS
            </label>
            <textarea
              aria-label="Custom CSS"
              value={preferences.customCss}
              placeholder=".outline-row-active { background: #fff4bf; }"
              onChange={(event) => onPreferenceChange("customCss", event.target.value)}
            />
            <button type="button" onClick={() => onPreferenceChange("customCss", "")}>
              Reset CSS
            </button>
            {customCssError ? <p role="alert">{customCssError}</p> : null}
          </>
        ) : null}
        {section === "sync" ? <p>Sync and account settings are reserved for Phase 16.</p> : null}
      </div>
    </aside>
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
  return command === "toggleSettings"
    ? "Settings"
    : command === "openNodePalette"
      ? "Node palette"
    : command === "openCommandPalette"
      ? "Command palette"
      : command === "focusNodeNote"
        ? "Edit note"
        : command === "createSiblingNode"
          ? "Create sibling node"
      : command === "undo"
        ? "Undo"
        : "Redo";
}

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
  { id: "appearance", label: "Appearance" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "customCss", label: "Custom CSS" },
  { id: "sync", label: "Sync" }
];

function buildCommandPaletteItems({
  document,
  view,
  query,
  recentNodeIds,
  openSettings,
  closePalette,
  jumpToNode
}: {
  document: OutlineDocument;
  view: ViewState;
  query: string;
  recentNodeIds: NodeId[];
  openSettings: (section: SettingsSection) => void;
  closePalette: () => void;
  jumpToNode: (nodeId: string) => void;
}): CommandPaletteItem[] {
  const commandMode = query.trimStart().startsWith(">");
  const normalizedQuery = (commandMode ? query.trimStart().slice(1) : query).trim().toLocaleLowerCase();
  const commands: CommandPaletteItem[] = [
    {
      id: "command:settings",
      title: "Open settings",
      kind: "Command",
      run: () => {
        openSettings("general");
      }
    },
    {
      id: "command:shortcuts",
      title: "Edit shortcuts",
      kind: "Command",
      run: () => {
        openSettings("shortcuts");
      }
    },
    {
      id: "command:custom-css",
      title: "Edit custom CSS",
      kind: "Command",
      run: () => {
        openSettings("customCss");
      }
    },
    {
      id: "command:close",
      title: "Close command palette",
      kind: "Command",
      run: closePalette
    }
  ].filter((item) => !normalizedQuery || item.title.toLocaleLowerCase().includes(normalizedQuery));
  if (commandMode) {
    return commands.slice(0, 12);
  }

  if (!normalizedQuery) {
    const recentIds = recentNodeIds.filter((nodeId) => nodeId !== document.rootId && Boolean(document.nodes[nodeId]));
    const visibleNodes = getVisibleNodes(document, view.zoomNodeId).filter((item) => !recentIds.includes(item.id));
    return [
      ...recentIds.map((nodeId) => nodeToPaletteItem(document, nodeId, "Recent node", jumpToNode)),
      ...visibleNodes.map((item) => nodeToPaletteItem(document, item.id, "Node", jumpToNode))
    ].slice(0, 12);
  }

  const nodeResults = searchOutline(document, query, { zoomNodeId: view.zoomNodeId })
    .slice(0, 12)
    .map((result) => ({
      id: `node:${result.nodeId}`,
      title: result.text || "Untitled node",
      kind: "Node",
      preview: searchResultPreview(document, result.breadcrumbIds, result.text),
      run: () => jumpToNode(result.nodeId)
    }));
  return nodeResults;
}

function nodeToPaletteItem(
  document: OutlineDocument,
  nodeId: NodeId,
  kind: "Node" | "Recent node",
  jumpToNode: (nodeId: string) => void
): CommandPaletteItem {
  const node = document.nodes[nodeId];
  return {
    id: `${kind === "Recent node" ? "recent" : "node"}:${nodeId}`,
    title: node.text || "Untitled node",
    kind,
    preview: nodePreview(document, nodeId),
    run: () => jumpToNode(nodeId)
  };
}

function searchResultPreview(document: OutlineDocument, breadcrumbIds: NodeId[], text: string): string {
  const context = breadcrumbIds
    .map((nodeId) => document.nodes[nodeId]?.text.trim())
    .filter(Boolean)
    .join(" / ");
  return context ? `${context} / Match: ${text}` : `Match: ${text}`;
}

function nodePreview(document: OutlineDocument, nodeId: NodeId): string {
  const path = getNodePath(document, nodeId)
    .slice(0, -1)
    .map((id) => document.nodes[id]?.text.trim())
    .filter(Boolean)
    .join(" / ");
  return path || "Top level";
}

function getNodePath(document: OutlineDocument, targetNodeId: NodeId): NodeId[] {
  const path: NodeId[] = [];
  const visit = (nodeId: NodeId): boolean => {
    if (nodeId === targetNodeId) {
      path.push(nodeId);
      return true;
    }
    const node = document.nodes[nodeId];
    if (!node) {
      return false;
    }
    for (const childId of node.children) {
      if (visit(childId)) {
        path.unshift(nodeId);
        return true;
      }
    }
    return false;
  };
  visit(document.rootId);
  return path.filter((nodeId) => nodeId !== document.rootId);
}

function scopeCustomCss(source: string): { css: string; error?: string } {
  const trimmed = source.trim();
  if (!trimmed) {
    return { css: "" };
  }
  if (trimmed.includes("@import")) {
    return { css: "", error: "Custom CSS cannot use @import." };
  }
  let index = 0;
  const rules: string[] = [];
  while (index < trimmed.length) {
    const open = trimmed.indexOf("{", index);
    if (open < 0) {
      if (trimmed.slice(index).trim()) {
        return { css: "", error: "Custom CSS has an incomplete rule." };
      }
      break;
    }
    const close = trimmed.indexOf("}", open + 1);
    if (close < 0) {
      return { css: "", error: "Custom CSS has an incomplete rule." };
    }
    const selector = trimmed.slice(index, open).trim();
    const body = trimmed.slice(open + 1, close).trim();
    if (!selector || !body) {
      return { css: "", error: "Custom CSS has an empty rule." };
    }
    if (selector.startsWith("@")) {
      return { css: "", error: "Custom CSS supports plain editor selectors only." };
    }
    const scopedSelector = selector
      .split(",")
      .map((part) => scopeSelector(part.trim()))
      .join(", ");
    rules.push(`${scopedSelector} { ${body} }`);
    index = close + 1;
  }
  return { css: rules.join("\n") };
}

function scopeSelector(selector: string): string {
  if (selector === ":root" || selector === "html" || selector === "body") {
    return ".outliner-custom-css-scope";
  }
  return `.outliner-custom-css-scope ${selector}`;
}

function findDuplicateShortcuts(keymap: PreferenceSettings["keymap"]): Set<string> {
  const counts = new Map<string, number>();
  for (const value of Object.values(keymap)) {
    const key = value.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}
