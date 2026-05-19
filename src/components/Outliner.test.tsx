import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInitialView, updateNodeText } from "../domain/outline";
import type { OutlineDocument, ViewState } from "../domain/outlineTypes";
import { makeDocumentWithTexts, makeLargeDocument } from "../test/factories";
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

  it("virtualizes large documents instead of mounting every visible row", () => {
    const document = makeLargeDocument(10_000);
    const { container } = render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    const list = screen.getByRole("tree", { name: "Outline" });
    expect(list).toHaveAttribute("data-visible-count", "10000");
    expect(Number(list.getAttribute("data-rendered-count"))).toBeLessThan(80);
    expect(container.querySelectorAll(".outline-row")).toHaveLength(Number(list.getAttribute("data-rendered-count")));
    expect(screen.getByText("Node 1")).toBeInTheDocument();
    expect(screen.queryByText("Node 10000")).not.toBeInTheDocument();
  });

  it("mounts Lexical only for the active row in a large document", () => {
    const document = makeLargeDocument(10_000);
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
    expect(screen.getAllByRole("textbox", { name: "Outline node text" })).toHaveLength(1);
  });

  it("does not re-render inactive rows when typing updates the active row", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = document.nodes[document.rootId].children;
    const renderRow = vi.fn();
    let typeInActiveRow: () => void = () => {};
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: a });
      typeInActiveRow = () => {
        setCurrentDocument((current) => updateNodeText(current, a, "Ax", () => 2));
      };
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
          onRenderRow={renderRow}
        />
      );
    }
    render(<Harness />);
    renderRow.mockClear();
    act(() => {
      typeInActiveRow();
    });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Ax");
    });
    expect(renderRow).toHaveBeenCalledWith(a);
    expect(renderRow).not.toHaveBeenCalledWith(b);
    expect(renderRow).not.toHaveBeenCalledWith(c);
  });

  it("keeps the active editor mounted while Korean IME composition updates text", async () => {
    const document = makeDocumentWithTexts(["#"]);
    const [nodeId] = document.nodes[document.rootId].children;
    let updateText: (text: string) => void = () => {};
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: nodeId });
      updateText = (text: string) => {
        setCurrentDocument((current) => updateNodeText(current, nodeId, text, () => 2));
      };
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
        />
      );
    }
    render(<Harness />);
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.compositionStart(textbox);
    act(() => {
      updateText("한");
    });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("한");
    });
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toBe(textbox);
  });

  it("commits the final Korean IME text from compositionend data", async () => {
    const document = makeDocumentWithTexts(["#"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>(createInitialView(document));
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
        />
      );
    }
    render(<Harness />);
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.compositionStart(textbox);
    fireEvent.compositionUpdate(textbox, { data: "하" });
    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "하"
    });
    fireEvent.compositionEnd(textbox, { data: "한" });
    delete (textbox as { textContent?: string }).textContent;

    await waitFor(() => {
      expect(screen.getByText("한").closest(".outline-row")).toHaveAttribute("data-node-text", "한");
    });
  });

  it("does not treat composing Enter or Backspace as outline commands", async () => {
    const document = makeDocumentWithTexts([""]);
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter", keyCode: 229 });
    fireEvent.keyDown(textbox, { key: "Backspace", code: "Backspace", keyCode: 229 });

    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("keeps normal Enter behavior after IME composition ends", async () => {
    const document = makeDocumentWithTexts(["한"]);
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.compositionEnd(textbox, { data: "한" });
    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            "n-1": expect.objectContaining({ text: "한" }),
            new: expect.objectContaining({ text: "" })
          })
        })
      );
    });
  });

  it("inserts a line break into the current node with mod enter", async () => {
    const document = makeDocumentWithTexts(["Line"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>(createInitialView(document));
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
        />
      );
    }
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      ctrlKey: true
    });

    await waitFor(() => {
      expect(screen.getByText("Line").closest(".outline-row")).toHaveAttribute("data-node-text", "Line\n");
    });
    expect(screen.getAllByRole("textbox", { name: "Outline node text" })).toHaveLength(1);
  });

  it("focuses the selected node note editor with shift enter", async () => {
    const document = makeDocumentWithTexts(["With note"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>(createInitialView(document));
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
        />
      );
    }
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      shiftKey: true
    });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Node note" })).toHaveFocus();
    });
  });

  it("keeps normal Backspace behavior after IME composition ends", async () => {
    const document = makeDocumentWithTexts([""]);
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.compositionEnd(textbox, { data: "" });
    fireEvent.keyDown(textbox, { key: "Backspace", code: "Backspace" });

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.not.objectContaining({
            "n-1": expect.anything()
          })
        })
      );
    });
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

  it("keeps a visible range selected after bulk indent", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = document.nodes[document.rootId].children;
    const onDocumentChange = vi.fn();
    const onViewChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: c,
          selectionAnchorNodeId: b,
          selectionFocusNodeId: c
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={onViewChange}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Tab",
      code: "Tab"
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            [a]: expect.objectContaining({ children: [b, c] })
          })
        })
      );
      expect(onViewChange).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedNodeId: c,
          selectionAnchorNodeId: b,
          selectionFocusNodeId: c
        })
      );
    });
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

  it("moves the active node with alt arrow shortcuts", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    const [a, b, c] = document.nodes[document.rootId].children;
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: b
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "ArrowUp",
      code: "ArrowUp",
      altKey: true
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            [document.rootId]: expect.objectContaining({ children: [b, a, c] })
          })
        })
      );
    });
  });

  it("moves a selected range with alt arrow shortcuts", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C", "D"]);
    const [a, b, c, d] = document.nodes[document.rootId].children;
    const onDocumentChange = vi.fn();
    const onViewChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: c,
          selectionAnchorNodeId: b,
          selectionFocusNodeId: c
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={onViewChange}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "ArrowDown",
      code: "ArrowDown",
      altKey: true
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            [document.rootId]: expect.objectContaining({ children: [a, d, b, c] })
          })
        })
      );
      expect(onViewChange).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedNodeId: c,
          selectionAnchorNodeId: b,
          selectionFocusNodeId: c
        })
      );
    });
  });

  it("adds multi cursors and clears range selection with mod alt arrows", async () => {
    const document = makeDocumentWithTexts(["A", "Bee"]);
    const [a, b] = document.nodes[document.rootId].children;
    const onViewChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: a,
          selectionAnchorNodeId: a,
          selectionFocusNodeId: b
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={onViewChange}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "ArrowDown",
      code: "ArrowDown",
      altKey: true,
      metaKey: true
    });
    await waitFor(() => {
      expect(onViewChange).toHaveBeenCalledWith(
        expect.objectContaining({
          selectionAnchorNodeId: undefined,
          selectionFocusNodeId: undefined,
          cursors: [
            { nodeId: a, offset: 1 },
            { nodeId: b, offset: 1 }
          ]
        })
      );
    });
  });

  it("applies typed text to every multi cursor", async () => {
    const document = makeDocumentWithTexts(["A", "B"]);
    const [a, b] = document.nodes[document.rootId].children;
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{
          ...createInitialView(document),
          selectedNodeId: a,
          cursors: [
            { nodeId: a, offset: 1 },
            { nodeId: b, offset: 1 }
          ]
        }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "x",
      code: "KeyX"
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            [a]: expect.objectContaining({ text: "Ax" }),
            [b]: expect.objectContaining({ text: "Bx" })
          })
        })
      );
    });
  });

  it("focuses search with mod f and navigates to the next result", async () => {
    const document = makeDocumentWithTexts(["Alpha", "Beta target"]);
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
    fireEvent.keyDown(window, { key: "f", code: "KeyF", metaKey: true });
    expect(screen.getByRole("searchbox", { name: "Search outline" })).toHaveFocus();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search outline" }), "target");
    await userEvent.click(screen.getByRole("button", { name: "Next search result" }));
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ selectedNodeId: "n-2" }));
  });

  it("renders flat search results without changing the document structure", async () => {
    const document = makeDocumentWithTexts(["Alpha", "Beta target", "Gamma"]);
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    await userEvent.type(screen.getByRole("searchbox", { name: "Search outline" }), "target");
    await userEvent.click(screen.getByRole("button", { name: "Flat" }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta target")).toBeInTheDocument();
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("applies and clears a tag filter", async () => {
    const document = makeDocumentWithTexts(["Alpha #phase9", "Beta"]);
    render(
      <Outliner
        document={document}
        view={{ ...createInitialView(document), selectedNodeId: "n-2" }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    await userEvent.click(screen.getByLabelText("Tags").querySelector("button")!);
    expect(screen.getByRole("searchbox", { name: "Search outline" })).toHaveValue("#phase9");
    expect(screen.getByRole("searchbox", { name: "Search outline" })).toHaveValue("#phase9");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("searchbox", { name: "Search outline" })).toHaveValue("");
  });

  it("stores metadata when choosing an internal link candidate", async () => {
    const document = makeDocumentWithTexts(["Source [[Tar", "Target"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-1" });
      return (
        <>
          <Outliner
            document={currentDocument}
            view={view}
            createId={() => "new"}
            now={() => 1}
            onDocumentChange={setCurrentDocument}
            onViewChange={setView}
          />
          <div data-testid="source-links">{JSON.stringify(currentDocument.nodes["n-1"].links ?? [])}</div>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Target" }));
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Source [[Target]]");
    expect(screen.getByTestId("source-links")).toHaveTextContent('"targetNodeId":"n-2"');
  });

  it("renders markdown-like source richly only for inactive rows", () => {
    const document = makeDocumentWithTexts(["**Bold** ==Bright==", "**Source**"]);
    render(
      <Outliner
        document={document}
        view={{ ...createInitialView(document), selectedNodeId: "n-2" }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.getByText("Bright").tagName).toBe("MARK");
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("**Source**");
  });

  it("converts markdown heading shortcuts while editing node text", async () => {
    const document = makeDocumentWithTexts(["#"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>(createInitialView(document));
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
        />
      );
    }
    const { container } = render(<Harness />);
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("#");
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: " ",
      code: "Space"
    });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("");
      expect(container.querySelector(".outline-row-active")).toHaveClass("outline-row-heading-1");
    });
  });

  it("updates node formatting metadata and shows notes", async () => {
    const document = makeDocumentWithTexts(["Formatted", "Other"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-1" });
      return (
        <Outliner
          document={currentDocument}
          view={view}
          createId={() => "new"}
          now={() => 1}
          onDocumentChange={setCurrentDocument}
          onViewChange={setView}
        />
      );
    }
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Heading" }), "2");
    await userEvent.click(screen.getByRole("checkbox", { name: "Numbered node" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Node note" }), "A note");
    await userEvent.click(screen.getByText("Other"));
    expect(screen.getByText("Formatted").closest(".outline-row")).toHaveClass("outline-row-heading-2");
    expect(screen.getByText("A note")).toHaveClass("node-note");
  });

  it("keeps rich metadata while moving nodes", async () => {
    const document = makeDocumentWithTexts(["A", "B"]);
    document.nodes["n-2"] = { ...document.nodes["n-2"], heading: 1, note: "Details" };
    const onDocumentChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={{ ...createInitialView(document), selectedNodeId: "n-2" }}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={onDocumentChange}
        onViewChange={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "ArrowUp",
      code: "ArrowUp",
      altKey: true
    });
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.objectContaining({
            "n-2": expect.objectContaining({ heading: 1, note: "Details" })
          })
        })
      );
    });
  });
});
