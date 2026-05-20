import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import type { OutlineSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import { makeDocumentWithTexts } from "../test/factories";
import { FakeRemoteStoreV2 } from "../sync/fakeRemoteStoreV2";
import { App } from "./App";
import { DEFAULT_PREFERENCES, type PreferenceSettings } from "./preferences";

function memoryPersistence(initial: OutlineSnapshot | null = null): LocalPersistence & { preferences: PreferenceSettings } {
  let current = initial;
  let conflictBackup: OutlineSnapshot | null = null;
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
    expect(screen.getByRole("heading", { name: "Outliner" })).toBeInTheDocument();
    expect(await screen.findByRole("tree", { name: "Outline" })).toBeInTheDocument();
    expect(screen.getByText("Saved locally")).toBeInTheDocument();
  });

  it("renders a persisted snapshot through the Yjs workspace runtime", async () => {
    const document = makeDocumentWithTexts(["Persisted"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);

    expect(await screen.findByText("Persisted")).toBeInTheDocument();
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

  it("renders the runtime remote sync status", async () => {
    const document = makeDocumentWithTexts(["A"]);
    render(
      <App
        persistence={memoryPersistence({ document, view: createInitialView(document) })}
        remoteStore={new FakeRemoteStoreV2()}
      />
    );

    expect(await screen.findByText("Synced")).toBeInTheDocument();
  });

  it("imports plain text into the current workspace without replacing existing nodes", async () => {
    const document = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document, view: createInitialView(document) })} />);
    await screen.findByText("A");

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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    fireEvent.click(screen.getByLabelText("Word count"));
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "mono" } });
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    fireEvent.click(screen.getByLabelText("Spellcheck"));

    await waitFor(() => expect(persistence.preferences.theme).toBe("dark"));
    expect(persistence.preferences.font).toBe("mono");
    expect(persistence.preferences.spellcheck).toBe(false);
    expect(persistence.preferences.showWordCount).toBe(false);

    fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(window.document.documentElement.dataset.theme).toBe("dark");
  });

  it("scopes saved custom CSS to the outliner editor", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    const persistence = memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) });
    render(<App persistence={persistence} />);
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
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
    expect(screen.getByRole("option", { name: /Open settings/i })).toBeInTheDocument();
  });

  it("applies edited shortcut settings to editor commands", async () => {
    const outlineDocument = makeDocumentWithTexts(["A"]);
    render(<App persistence={memoryPersistence({ document: outlineDocument, view: createInitialView(outlineDocument) })} />);
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
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
});
