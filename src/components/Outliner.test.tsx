import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { Outliner } from "./Outliner";

describe("Outliner", () => {
  it("renders root breadcrumb and visible nodes", () => {
    const document = makeDocumentWithTexts(["A", "B"]);
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Root");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("zooms when clicking a bullet", async () => {
    const user = userEvent.setup();
    const document = makeDocumentWithTexts(["A"]);
    const onViewChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={onViewChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Zoom into node" }));
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ zoomNodeId: "n-1" }));
  });

  it("highlights a selected visible range", () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, _, c] = document.nodes[document.rootId].children;
    const { container } = render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: c,
          selectionAnchorNodeId: a,
          selectionFocusNodeId: c
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".outline-row-selected")).toHaveLength(3);
  });

  it("extends range selection with shift arrow navigation", async () => {
    const document = makeDocumentWithTexts(["A", "B"]);
    const onViewChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={onViewChange}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "ArrowDown",
      code: "ArrowDown",
      shiftKey: true
    });
    await waitFor(() => {
      expect(onViewChange).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedNodeId: "n-2",
          selectionAnchorNodeId: "n-1",
          selectionFocusNodeId: "n-2"
        })
      );
    });
  });

  it("pastes multiline text as outline nodes", async () => {
    const document = makeDocumentWithTexts(["HelloWorld"]);
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "paste-1"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    fireEvent.paste(screen.getByRole("textbox", { name: "Outline node text" }), {
      clipboardData: { getData: () => " A\n  B" }
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            "n-1": expect.objectContaining({ text: "HelloWorld A", children: ["paste-1"] }),
            "paste-1": expect.objectContaining({ text: "B" })
          })
        })
      );
    });
  });

  it("deletes a selected visible range with backspace", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b] = document.nodes[document.rootId].children;
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: b,
          selectionAnchorNodeId: a,
          selectionFocusNodeId: b
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Backspace",
      code: "Backspace"
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.not.objectContaining({
            [a]: expect.anything(),
            [b]: expect.anything()
          })
        })
      );
    });
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: expect.objectContaining({
          "n-3": expect.objectContaining({ text: "C" })
        })
      })
    );
  });
});
