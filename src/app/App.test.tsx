import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import type { OutlineSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import { makeDocumentWithTexts } from "../test/factories";
import { App } from "./App";

function memoryPersistence(initial: OutlineSnapshot | null = null): LocalPersistence {
  let current = initial;
  return {
    async load() {
      return current;
    },
    async save(snapshot) {
      current = snapshot;
    },
    async clear() {
      current = null;
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
});
