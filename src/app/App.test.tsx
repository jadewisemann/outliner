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
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "mono" } });
    fireEvent.click(screen.getByLabelText("Spellcheck"));
    fireEvent.click(screen.getByLabelText("Word count"));

    await waitFor(() => expect(persistence.preferences.theme).toBe("dark"));
    expect(persistence.preferences.font).toBe("mono");
    expect(persistence.preferences.spellcheck).toBe(false);
    expect(persistence.preferences.showWordCount).toBe(false);

    fireEvent.keyDown(window, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(window.document.documentElement.dataset.theme).toBe("dark");
  });
});
