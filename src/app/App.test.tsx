import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialView } from "../domain/outline";
import type { OutlineSnapshot, StoredSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import { makeDocumentWithTexts } from "../test/factories";
import { FakeRemoteStoreV2 } from "../sync/fakeRemoteStoreV2";
import { App } from "./App";
import { COMMAND_REGISTRY, DEFAULT_PREFERENCES, normalizePreferences, type PreferenceSettings } from "./preferences";

function memoryPersistence(initial: StoredSnapshot | null = null): LocalPersistence & { preferences: PreferenceSettings } {
  let current: StoredSnapshot | null = initial;
  let conflictBackup: StoredSnapshot | null = null;
  const history: Awaited<ReturnType<LocalPersistence["listSnapshotHistory"]>> = [];
  let preferences = DEFAULT_PREFERENCES;
  return {
    get preferences() {
      return preferences;
    },
    async load() {
      return current;
    },
    async save(snapshot) {
      current = snapshot;
    },
    async clear() {
      current = null;
    },
    async listSnapshotHistory() {
      return history;
    },
    async saveSnapshotHistory(entry) {
      history.unshift(entry);
    },
    async clearSnapshotHistory() {
      history.length = 0;
    },
    async loadPreferences() {
      return preferences;
    },
    async savePreferences(next) {
      preferences = next;
    },
    async loadConflictBackup() {
      return conflictBackup;
    },
    async saveConflictBackup(snapshot) {
      conflictBackup = snapshot;
    },
    async clearConflictBackup() {
      conflictBackup = null;
    }
  };
}

describe("App", () => {
  it("renders the root outliner screen", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Workspace menu" })).toBeInTheDocument();
    expect(await screen.findByRole("tree", { name: "Outline" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Sync status/)).not.toBeInTheDocument();
  });

  it("renders a persisted snapshot through the Yjs workspace runtime", async () => {
    const document = makeDocumentWithTexts(["Persisted"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);

    expect(await screen.findByText("Persisted")).toBeInTheDocument();
  });

  it("shows workspace documents and supports create switch rename and delete from the sidebar", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const document = makeDocumentWithTexts(["First body"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);
    await screen.findByText("First body");

    const sidebar = screen.getByRole("complementary", { name: "Documents" });
    expect(within(sidebar).getByRole("button", { name: "Untitled" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(sidebar).getByRole("button", { name: "New document" }));
    await waitFor(() => expect(within(sidebar).getAllByRole("listitem")).toHaveLength(2));
    expect(within(sidebar).getAllByRole("button", { name: "Untitled" }).at(-1)).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(sidebar).getAllByRole("button", { name: "Rename Untitled" }).at(-1)!);
    const titleInput = within(sidebar).getByLabelText("Document title");
    fireEvent.change(titleInput, { target: { value: "Second" } });
    fireEvent.keyDown(titleInput, { key: "Enter", code: "Enter" });
    expect(await within(sidebar).findByRole("button", { name: "Second" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(sidebar).getAllByRole("button", { name: "Untitled" })[0]);
    expect(await screen.findByText("First body")).toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Delete Second" }));
    expect(confirm).toHaveBeenCalledWith('Delete "Second"?');
    await waitFor(() => expect(within(sidebar).queryByRole("button", { name: "Second" })).not.toBeInTheDocument());
    confirm.mockRestore();
  });

  it("keeps the outliner editable when the workspace sidebar is collapsed", async () => {
    const document = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Collapse document sidebar" }));
    expect(screen.getByRole("button", { name: "Expand document sidebar" })).toBeInTheDocument();

    const textbox = screen.getByRole("textbox", { name: "Outline node text" });
    fireEvent.change(textbox, { target: { textContent: "Edited" } });
    expect(screen.getByRole("tree", { name: "Outline" })).toBeInTheDocument();
  });

  it("undoes and redoes an outline structure edit from keyboard shortcuts", async () => {
    const document = makeDocumentWithTexts(["A"]);
    const { container } = render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);
    await screen.findByText("A");
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.paste(textbox, {
      clipboardData: { getData: () => "A\nB" }
    });
    await waitFor(() => expect(container.querySelectorAll(".outline-row")).toHaveLength(2));

    fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(container.querySelectorAll(".outline-row")).toHaveLength(1));

    fireEvent.keyDown(window, { key: "y", code: "KeyY", ctrlKey: true });
    await waitFor(() => expect(container.querySelectorAll(".outline-row")).toHaveLength(2));
  });

  it("keeps runtime remote sync state out of the top controls", async () => {
    const document = makeDocumentWithTexts(["A"]);
    render(
      <App
        persistence={memoryPersistence({ document, view: createInitialView(document) })}
        remoteStore={new FakeRemoteStoreV2()}
      />
    );

    await screen.findByText("A");
    expect(screen.queryByText("Synced")).not.toBeInTheDocument();
  });

  it("imports plain text into the current workspace without replacing existing nodes", async () => {
    const document = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);
    await screen.findByText("A");

    openWorkspaceMenuSection("Import");
    fireEvent.change(screen.getByLabelText("Import format"), { target: { value: "plainText" } });
    const file = new File(["B\n  C"], "outline.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Import outline file"), { target: { files: [file] } });

    expect(await screen.findByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("keeps the workspace intact when import parsing fails", async () => {
    const document = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);
    await screen.findByText("A");

    openWorkspaceMenuSection("Import");
    const file = new File(["<opml><body><outline></body></opml>"], "broken.opml", { type: "text/x-opml" });
    fireEvent.change(screen.getByLabelText("Import outline file"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Import failed");
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("stores settings separately from outline undo and applies them to the shell", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    const persistence = memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) });
    render(<App persistence={persistence} />);
    await screen.findByText("A");

    openSettingsPanel();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "mono" } });
    fireEvent.change(screen.getByLabelText("Outline density"), { target: { value: "spacious" } });
    fireEvent.change(screen.getByLabelText("Content width"), { target: { value: "wide" } });
    fireEvent.change(screen.getByLabelText("Bullet style"), { target: { value: "diamond" } });
    fireEvent.change(screen.getByLabelText("Indent size"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("Editor text size"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "General" }));
    fireEvent.click(screen.getByLabelText("Word count"));
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    fireEvent.click(screen.getByLabelText("Spellcheck"));

    await waitFor(() => expect(persistence.preferences.theme).toBe("dark"));
    expect(persistence.preferences.font).toBe("mono");
    expect(persistence.preferences.outlineDensity).toBe("spacious");
    expect(persistence.preferences.contentWidth).toBe("wide");
    expect(persistence.preferences.bulletStyle).toBe("diamond");
    expect(persistence.preferences.indentSizePx).toBe(32);
    expect(persistence.preferences.editorFontSizePx).toBe(16);
    expect(persistence.preferences.spellcheck).toBe(false);
    expect(persistence.preferences.showWordCount).toBe(false);

    fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(window.document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("main")).toHaveAttribute("data-bullet-style", "diamond");
  });

  it("opens file actions and settings from the hierarchical workspace menu", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    expect(screen.getByRole("dialog", { name: "Workspace menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Typewriter scroll")).toBeInTheDocument();
  });

  it("stores typewriter scroll settings in preferences", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    const persistence = memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) });
    render(<App persistence={persistence} />);
    await screen.findByText("A");

    openSettingsPanel();
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    fireEvent.click(screen.getByLabelText("Typewriter scroll"));
    fireEvent.change(screen.getByLabelText("Typewriter scroll offset"), { target: { value: "48" } });

    await waitFor(() => expect(persistence.preferences.typewriterScrollEnabled).toBe(true));
    expect(persistence.preferences.typewriterScrollOffsetPx).toBe(48);
  });

  it("normalizes typewriter scroll preferences from persisted values", () => {
    expect(normalizePreferences({ typewriterScrollOffsetPx: 999 }).typewriterScrollOffsetPx).toBe(240);
    expect(normalizePreferences({ typewriterScrollOffsetPx: -999 }).typewriterScrollOffsetPx).toBe(-240);
    expect(normalizePreferences({}).typewriterScrollEnabled).toBe(false);
    expect(normalizePreferences({ indentSizePx: 999 }).indentSizePx).toBe(48);
    expect(normalizePreferences({ editorFontSizePx: 1 }).editorFontSizePx).toBe(12);
    expect(normalizePreferences({ outlineDensity: "huge" as never }).outlineDensity).toBe("comfortable");
  });

  it("scopes saved custom CSS to the outliner editor", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    const persistence = memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) });
    render(<App persistence={persistence} />);
    await screen.findByText("A");

    openSettingsPanel();
    fireEvent.click(screen.getByRole("button", { name: "Custom CSS" }));
    fireEvent.click(screen.getByLabelText("Enable custom CSS"));
    fireEvent.change(screen.getByLabelText("Custom CSS"), {
      target: { value: ".outline-row-active { background: rgb(255, 244, 191); }" }
    });

    await waitFor(() => expect(persistence.preferences.customCssEnabled).toBe(true));
    expect(persistence.preferences.customCss).toContain(".outline-row-active");
    expect(screen.getByTestId("custom-css-style")).toHaveTextContent(
      ".outliner-custom-css-scope .outline-row-active"
    );

    fireEvent.change(screen.getByLabelText("Custom CSS"), { target: { value: "@import url('bad.css');" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot use @import");
    expect(screen.getByTestId("custom-css-style")).toHaveTextContent("");
  });

  it("opens the command palette from the keyboard and jumps to a searched node", async () => {
    const outlineDocument = makeDocumentWithTexts(["Alpha", "Beta"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("Alpha");

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });
    const paletteSearch = await screen.findByRole("searchbox", { name: "Command palette search" });
    fireEvent.change(paletteSearch, { target: { value: "Beta" } });
    fireEvent.keyDown(paletteSearch, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText("Beta").closest(".outline-row")).toHaveClass("outline-row-active"));
  });

  it("searches Korean node text from the node palette", async () => {
    const outlineDocument = makeDocumentWithTexts(["알파", "베타 메모"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("알파");

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });
    const paletteSearch = await screen.findByRole("searchbox", { name: "Command palette search" });
    fireEvent.change(paletteSearch, { target: { value: "베타" } });
    fireEvent.keyDown(paletteSearch, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText("베타 메모").closest(".outline-row")).toHaveClass("outline-row-active"));
  });

  it("opens command mode directly with the command palette shortcut", async () => {
    const outlineDocument = makeDocumentWithTexts(["Alpha", "Beta"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("Alpha");

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true, shiftKey: true });
    const paletteSearch = await screen.findByRole("searchbox", { name: "Command palette search" });

    expect(paletteSearch).toHaveValue(">");
    expect(screen.getByRole("option", { name: "Settings Command" })).toBeInTheDocument();
  });

  it("executes formatting commands from the command palette", async () => {
    const outlineDocument = makeDocumentWithTexts(["Alpha"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("Alpha");

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true, shiftKey: true });
    const paletteSearch = await screen.findByRole("searchbox", { name: "Command palette search" });
    fireEvent.change(paletteSearch, { target: { value: ">heading 2" } });
    fireEvent.keyDown(paletteSearch, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText("Alpha").closest(".outline-row")).toHaveClass("outline-row-heading-2"));
  });

  it("shows search result preview and moves the active result with arrow keys", async () => {
    const outlineDocument = makeDocumentWithTexts(["Alpha parent", "Beta preview", "Gamma preview"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("Alpha parent");

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });
    const paletteSearch = await screen.findByRole("searchbox", { name: "Command palette search" });
    fireEvent.change(paletteSearch, { target: { value: "preview" } });

    expect(screen.getByText("Beta preview / Match: Beta preview", { selector: ".command-palette-preview" })).toBeInTheDocument();

    fireEvent.keyDown(paletteSearch, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(paletteSearch, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText("Gamma preview").closest(".outline-row")).toHaveClass("outline-row-active"));
  });

  it("keeps recently visited nodes in the same palette", async () => {
    const outlineDocument = makeDocumentWithTexts(["Alpha", "Beta"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("Alpha");

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });
    const firstSearch = await screen.findByRole("searchbox", { name: "Command palette search" });
    fireEvent.change(firstSearch, { target: { value: "Beta" } });
    fireEvent.keyDown(firstSearch, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(screen.getByText("Beta").closest(".outline-row")).toHaveClass("outline-row-active"));

    fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });

    const results = within(screen.getByRole("listbox", { name: "Command palette results" }));
    const firstResult = (await results.findAllByRole("option"))[0];
    expect(firstResult).toHaveTextContent("Beta");
    expect(firstResult).toHaveTextContent("Recent node");
  });

  it("applies edited shortcut settings to editor commands", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("A");

    openSettingsPanel();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    fireEvent.change(screen.getByLabelText("Create sibling node shortcut"), { target: { value: "Ctrl+Alt+Enter" } });
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      ctrlKey: true,
      altKey: true
    });

    await waitFor(() => expect(screen.getByRole("tree", { name: "Outline" })).toHaveAttribute("data-visible-count", "2"));
  });

  it("shows every registry command in shortcut settings and warns about conflicts and reserved shortcuts", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("A");

    openSettingsPanel();
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));

    for (const command of COMMAND_REGISTRY) {
      expect(screen.getByLabelText(`${command.label} shortcut`)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText("Node palette shortcut"), { target: { value: "Mod+R" } });
    fireEvent.change(screen.getByLabelText("Command palette shortcut"), { target: { value: "Mod+R" } });

    expect(screen.getAllByText("Shortcut conflict")).toHaveLength(2);
    expect(screen.getAllByText("Reserved shortcut")).toHaveLength(2);
    expect(screen.getAllByText("Unassigned shortcut").length).toBeGreaterThan(0);
  });

  it("restores default shortcuts and imports shortcut json", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    const persistence = memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) });
    render(<App persistence={persistence} />);
    await screen.findByText("A");

    openSettingsPanel();
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    fireEvent.change(screen.getByLabelText("Create sibling node shortcut"), { target: { value: "Ctrl+Alt+Enter" } });
    fireEvent.click(screen.getByRole("button", { name: "Restore default shortcuts" }));
    expect(screen.getByLabelText("Create sibling node shortcut")).toHaveValue("Mod+Enter");

    const file = new File([JSON.stringify({ createSiblingNode: "Ctrl+Alt+Enter", unknownCommand: "F9" })], "shortcuts.json", {
      type: "application/json"
    });
    fireEvent.change(screen.getByLabelText("Import shortcuts file"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText("Create sibling node shortcut")).toHaveValue("Ctrl+Alt+Enter"));
    expect(persistence.preferences.keymap.createSiblingNode).toBe("Ctrl+Alt+Enter");
    expect("unknownCommand" in persistence.preferences.keymap).toBe(false);
  });
});

function openSettingsPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "General" }));
}

function openWorkspaceMenuSection(section: "File" | "Import" | "Settings") {
  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("button", { name: section }));
}
