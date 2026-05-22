import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInitialView, updateNodeLinks, updateNodeText } from "../domain/outline";
import type { OutlineDocument, ViewState } from "../domain/outlineTypes";
import { makeDocumentWithTexts, makeLargeDocument } from "../test/factories";
import { Outliner } from "./Outliner";

function selectContent(element: HTMLElement) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

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

  it("keeps scroll position unchanged when typewriter scroll is disabled", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C", "D", "E"]);
    const [, , targetNodeId] = document.nodes[document.rootId].children;
    let selectTarget: () => void = () => {};
    function Harness() {
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-1" });
      selectTarget = () => setView((current) => ({ ...current, selectedNodeId: targetNodeId }));
      return (
        <Outliner
          document={document}
          view={view}
          createId={() => "new"}
          now={() => 1}
          typewriterScrollEnabled={false}
          typewriterScrollOffsetPx={40}
          onDocumentChange={vi.fn()}
          onViewChange={setView}
        />
      );
    }
    const { container } = render(<Harness />);
    const list = screen.getByRole("tree", { name: "Outline" });
    mockScrollContainer(list, { height: 400, scrollHeight: 1000 });
    mockRowRect(container, targetNodeId, { top: 164, height: 32 });

    act(() => {
      selectTarget();
    });

    await waitFor(() => expect(screen.getByText("C").closest(".outline-row")).toHaveClass("outline-row-active"));
    expect(list.scrollTop).toBe(0);
  });

  it("centers the focused node with the configured typewriter scroll offset", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
    const targetNodeId = document.nodes[document.rootId].children[9];
    let selectTarget: () => void = () => {};
    function Harness() {
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-1" });
      selectTarget = () => setView((current) => ({ ...current, selectedNodeId: targetNodeId }));
      return (
        <Outliner
          document={document}
          view={view}
          createId={() => "new"}
          now={() => 1}
          typewriterScrollEnabled
          typewriterScrollOffsetPx={40}
          onDocumentChange={vi.fn()}
          onViewChange={setView}
        />
      );
    }
    const { container } = render(<Harness />);
    const list = screen.getByRole("tree", { name: "Outline" });
    mockScrollContainer(list, { height: 400, scrollHeight: 1000 });
    mockRowRect(container, targetNodeId, { top: 388, height: 32 });

    act(() => {
      selectTarget();
    });

    await waitFor(() => expect(list.scrollTop).toBe(64));
  });

  it("clamps typewriter scroll to the scrollable range", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    const targetNodeId = document.nodes[document.rootId].children[2];
    let selectTarget: () => void = () => {};
    function Harness() {
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-1" });
      selectTarget = () => setView((current) => ({ ...current, selectedNodeId: targetNodeId }));
      return (
        <Outliner
          document={document}
          view={view}
          createId={() => "new"}
          now={() => 1}
          typewriterScrollEnabled
          typewriterScrollOffsetPx={-40}
          onDocumentChange={vi.fn()}
          onViewChange={setView}
        />
      );
    }
    const { container } = render(<Harness />);
    const list = screen.getByRole("tree", { name: "Outline" });
    mockScrollContainer(list, { height: 400, scrollHeight: 450 });
    mockRowRect(container, targetNodeId, { top: 1200, height: 32 });

    act(() => {
      selectTarget();
    });

    await waitFor(() => expect(list.scrollTop).toBe(50));
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

  it("does not overwrite visible Korean IME text on unrelated rerenders", async () => {
    const document = makeDocumentWithTexts([""]);
    const [nodeId] = document.nodes[document.rootId].children;
    let rerenderParent: () => void = () => {};
    function Harness() {
      const [tick, setTick] = useState(0);
      rerenderParent = () => setTick((value) => value + 1);
      return (
        <div data-testid="rerender-count">{tick}
          <Outliner
            document={document}
            view={{ ...createInitialView(document), selectedNodeId: nodeId }}
            createId={() => "new"}
            now={() => 1}
            onDocumentChange={vi.fn()}
            onViewChange={vi.fn()}
          />
        </div>
      );
    }
    render(<Harness />);
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.compositionStart(textbox);
    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "하"
    });
    act(() => {
      rerenderParent();
    });

    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("하");
    delete (textbox as { textContent?: string }).textContent;
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

  it("stores completed Korean syllables instead of duplicated intermediate jamo", async () => {
    const document = makeDocumentWithTexts([""]);
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
    fireEvent.compositionUpdate(textbox, { data: "낳" });
    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "ㅇ낳"
    });
    fireEvent.compositionEnd(textbox, { data: "않" });
    delete (textbox as { textContent?: string }).textContent;

    await waitFor(() => {
      expect(screen.getByText("않").closest(".outline-row")).toHaveAttribute("data-node-text", "않");
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

  it("creates a same-level sibling below the current node with mod enter", async () => {
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
    expect(screen.queryByRole("textbox", { name: "Node note" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      ctrlKey: true
    });

    await waitFor(() => {
      expect(screen.getByText("Line").closest(".outline-row")).toHaveAttribute("data-node-text", "Line");
      expect(screen.getByRole("tree", { name: "Outline" })).toHaveAttribute("data-visible-count", "2");
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveFocus();
    });
    expect(screen.getAllByRole("textbox", { name: "Outline node text" })).toHaveLength(1);
  });

  it("inserts a line break inside the current node with alt enter", async () => {
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
    const { container } = render(<Harness />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      altKey: true
    });

    await waitFor(() => {
      expect(container.querySelector(".outline-row-active")).toHaveAttribute("data-node-text", "Line\n");
      expect(screen.getByRole("tree", { name: "Outline" })).toHaveAttribute("data-visible-count", "1");
    });
  });

  it("renders the first internal line break immediately after alt enter", async () => {
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
    const editor = screen.getByRole("textbox", { name: "Outline node text" });
    fireEvent.keyDown(editor, {
      key: "Enter",
      code: "Enter",
      altKey: true
    });

    await waitFor(() => {
      expect(screen.getByText("Line").closest(".outline-row")).toHaveAttribute("data-node-text", "Line\n");
      expect(editor.querySelector("br")).not.toBeNull();
    });
  });

  it("persists the first alt enter line break without a second keypress", async () => {
    const document = makeDocumentWithTexts(["Line"]);
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
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      altKey: true
    });

    await waitFor(() => {
      expect(
        onDocumentChange.mock.calls
          .map(([change]) => (typeof change === "function" ? change(document) : change))
          .some((next) => next.nodes["n-1"].text === "Line\n")
      ).toBe(true);
    });
  });

  it("commits Korean IME text in a markdown heading source without losing the marker", async () => {
    const document = makeDocumentWithTexts([""]);
    document.nodes["n-1"] = { ...document.nodes["n-1"], heading: 1 };
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
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.compositionStart(textbox);
    fireEvent.compositionUpdate(textbox, { data: "하" });
    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "# 하"
    });
    fireEvent.compositionEnd(textbox, { data: "한" });
    delete (textbox as { textContent?: string }).textContent;

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("# 한");
      expect(container.querySelector(".outline-row-active")).toHaveClass("outline-row-heading-1");
      expect(container.querySelector(".outline-row-active")).toHaveAttribute("data-node-text", "한");
    });
  });

  it("clears heading metadata when a Korean heading source marker is removed", async () => {
    const document = makeDocumentWithTexts(["한국어"]);
    document.nodes["n-1"] = { ...document.nodes["n-1"], heading: 2 };
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
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "한국어"
    });
    fireEvent.compositionEnd(textbox, { data: "" });
    delete (textbox as { textContent?: string }).textContent;

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("한국어");
      expect(container.querySelector(".outline-row-active")).not.toHaveClass("outline-row-heading-2");
      expect(container.querySelector(".outline-row-active")).toHaveAttribute("data-node-text", "한국어");
    });
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
    const { container } = render(<Harness />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      shiftKey: true
    });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Node note" })).toHaveFocus();
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Node note" }), {
      key: "Enter",
      code: "Enter",
      shiftKey: true
    });
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "Node note" })).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveFocus();
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter"
    });
    await waitFor(() => {
      expect(container.querySelector('[data-node-id="n-1"]')).toHaveAttribute("data-node-text", "With note");
      expect(screen.getByRole("tree", { name: "Outline" })).toHaveAttribute("data-visible-count", "2");
    });
  });

  it("moves between sibling nodes with arrow keys while editing a node note", async () => {
    const document = makeDocumentWithTexts(["First", "Second"]);
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
    const firstNoteEditor = await screen.findByRole("textbox", { name: "Node note" });

    fireEvent.keyDown(firstNoteEditor, { key: "ArrowDown", code: "ArrowDown" });

    await waitFor(() => {
      const nodeEditor = screen.getByRole("textbox", { name: "Outline node text" });
      expect(nodeEditor).toHaveTextContent("Second");
      expect(nodeEditor).toHaveFocus();
      expect(screen.queryByRole("textbox", { name: "Node note" })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      shiftKey: true
    });
    const secondNoteEditor = await screen.findByRole("textbox", { name: "Node note" });

    fireEvent.keyDown(secondNoteEditor, { key: "ArrowUp", code: "ArrowUp" });

    await waitFor(() => {
      const nodeEditor = screen.getByRole("textbox", { name: "Outline node text" });
      expect(nodeEditor).toHaveTextContent("First");
      expect(nodeEditor).toHaveFocus();
      expect(screen.queryByRole("textbox", { name: "Node note" })).not.toBeInTheDocument();
    });
  });

  it("preserves horizontal cursor intent while moving through shorter nodes", async () => {
    const document = makeDocumentWithTexts(["abcd", "xy", "0123456789"]);
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
    const editor = screen.getByRole("textbox", { name: "Outline node text" });
    expect(editor).toHaveTextContent("abcd");

    fireEvent.keyDown(editor, { key: "ArrowDown", code: "ArrowDown" });
    await waitFor(() => {
      const activeEditor = screen.getByRole("textbox", { name: "Outline node text" });
      expect(activeEditor).toHaveTextContent("xy");
      expect(activeEditor).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "ArrowDown",
      code: "ArrowDown"
    });
    await waitFor(() => {
      const activeEditor = screen.getByRole("textbox", { name: "Outline node text" });
      expect(activeEditor).toHaveTextContent("0123456789");
      expect(activeEditor).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter"
    });

    await waitFor(() => {
      expect(screen.getByText("0123").closest(".outline-row")).toHaveAttribute("data-node-text", "0123");
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("456789");
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

  it("does not render a persistent search box in the outliner surface", async () => {
    const document = makeDocumentWithTexts(["Alpha", "Beta target"]);
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
    expect(screen.queryByRole("searchbox", { name: "Search outline" })).not.toBeInTheDocument();
  });

  it("commits final Korean IME text while editing a node note", async () => {
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
    const noteEditor = await screen.findByRole("textbox", { name: "Node note" });

    fireEvent.compositionStart(noteEditor);
    fireEvent.compositionUpdate(noteEditor, { data: "메" });
    Object.defineProperty(noteEditor, "textContent", {
      configurable: true,
      get: () => "메"
    });
    fireEvent.compositionEnd(noteEditor, { data: "메모" });
    delete (noteEditor as { textContent?: string }).textContent;
    fireEvent.keyDown(noteEditor, { key: "Enter", code: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("메모")).toHaveClass("node-note");
      expect(screen.queryByRole("textbox", { name: "Node note" })).not.toBeInTheDocument();
    });
  });

  it("keeps Korean composition text visible while editing a node note", async () => {
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
    const noteEditor = await screen.findByRole("textbox", { name: "Node note" });

    fireEvent.compositionStart(noteEditor);
    fireEvent.compositionUpdate(noteEditor, { data: "하" });
    Object.defineProperty(noteEditor, "textContent", {
      configurable: true,
      get: () => "하"
    });

    expect(noteEditor).toHaveTextContent("하");
    delete (noteEditor as { textContent?: string }).textContent;
  });

  it("accumulates multiple Korean IME syllables while editing a node note", async () => {
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
    const noteEditor = await screen.findByRole("textbox", { name: "Node note" });

    fireEvent.compositionStart(noteEditor);
    fireEvent.compositionUpdate(noteEditor, { data: "하" });
    Object.defineProperty(noteEditor, "textContent", {
      configurable: true,
      get: () => "하"
    });
    fireEvent.compositionEnd(noteEditor, { data: "한" });
    delete (noteEditor as { textContent?: string }).textContent;
    fireEvent.compositionStart(noteEditor);
    fireEvent.compositionUpdate(noteEditor, { data: "그" });
    Object.defineProperty(noteEditor, "textContent", {
      configurable: true,
      get: () => "한그"
    });
    fireEvent.compositionEnd(noteEditor, { data: "글" });
    delete (noteEditor as { textContent?: string }).textContent;
    fireEvent.keyDown(noteEditor, { key: "Enter", code: "Enter", shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("한글")).toHaveClass("node-note");
    });
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
    expect(screen.getAllByRole("button", { name: "#phase9" })[0]).toHaveClass("toolbar-button-active");
    await userEvent.click(screen.getAllByRole("button", { name: "#phase9" })[0]);
    expect(screen.getAllByRole("button", { name: "#phase9" })[0]).not.toHaveClass("toolbar-button-active");
  });

  it("stores typed hash tags as node metadata and removes them from node text", async () => {
    const document = makeDocumentWithTexts(["Alpha"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>(createInitialView(document));
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
          <div data-testid="node-state">{JSON.stringify(currentDocument.nodes["n-1"])}</div>
        </>
      );
    }
    render(<Harness />);
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });
    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "Alpha #asd"
    });
    fireEvent.compositionEnd(textbox, { data: "" });
    delete (textbox as { textContent?: string }).textContent;

    await waitFor(() => {
      expect(screen.getByTestId("node-state")).toHaveTextContent('"text":"Alpha"');
      expect(screen.getByTestId("node-state")).toHaveTextContent('"tags":["#asd"]');
      expect(screen.getByRole("button", { name: "#asd" })).toBeInTheDocument();
    });
  });

  it("shows a todo checkbox only when the text starts with todo source markers", async () => {
    const document = makeDocumentWithTexts(["Task"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>(createInitialView(document));
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
          <div data-testid="node-state">{JSON.stringify(currentDocument.nodes["n-1"])}</div>
        </>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Mark node complete" })).not.toBeInTheDocument();
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    Object.defineProperty(textbox, "textContent", {
      configurable: true,
      get: () => "[] Task"
    });
    fireEvent.compositionEnd(textbox, { data: "" });
    delete (textbox as { textContent?: string }).textContent;

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark node complete" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("[] Task");
      expect(screen.getByTestId("node-state")).toHaveTextContent('"completed":false');
    });
  });

  it("edits completed todo nodes with the [*] source marker", async () => {
    const document = makeDocumentWithTexts(["Task"]);
    document.nodes["n-1"] = { ...document.nodes["n-1"], completed: true };
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
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("[*] Task");
    await userEvent.click(screen.getByRole("button", { name: "Mark node incomplete" }));
    expect(container.querySelector('[data-node-id="n-1"]')).not.toHaveClass("outline-row-completed");
    expect(screen.getByRole("button", { name: "Mark node complete" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("[] Task");
  });

  it("expands ctrl+a from text to node, siblings, and parent selection", async () => {
    const document = makeDocumentWithTexts(["Parent", "Sibling"]);
    document.nodes["n-1"] = { ...document.nodes["n-1"], children: ["n-3"] };
    document.nodes["n-3"] = {
      id: "n-3",
      text: "Child",
      children: [],
      collapsed: false,
      createdAt: 1,
      updatedAt: 1
    };
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-3" });
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
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });
    selectContent(textbox);

    fireEvent.keyDown(textbox, { key: "a", code: "KeyA", ctrlKey: true });
    await waitFor(() => expect(container.querySelector('[data-node-id="n-3"]')).toHaveClass("outline-row-selected"));

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), { key: "a", code: "KeyA", ctrlKey: true });
    await waitFor(() => {
      expect(container.querySelector('[data-node-id="n-3"]')).toHaveClass("outline-row-selected");
      expect(container.querySelector('[data-node-id="n-1"]')).not.toHaveClass("outline-row-selected");
    });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), { key: "a", code: "KeyA", ctrlKey: true });
    await waitFor(() => expect(container.querySelector('[data-node-id="n-1"]')).toHaveClass("outline-row-selected"));
  });

  it("selects and deletes the current line with ctrl+l and ctrl+shift+k", async () => {
    const document = makeDocumentWithTexts(["A", "B", "C"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-2" });
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
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });

    fireEvent.keyDown(textbox, { key: "l", code: "KeyL", ctrlKey: true });
    await waitFor(() => expect(container.querySelector('[data-node-id="n-2"]')).toHaveClass("outline-row-selected"));

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "K",
      code: "KeyK",
      ctrlKey: true,
      shiftKey: true
    });
    await waitFor(() => {
      expect(screen.queryByText("B")).not.toBeInTheDocument();
      expect(screen.getByText("C")).toBeInTheDocument();
    });
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
    await userEvent.click(screen.getByRole("option", { name: "Target" }));
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Source [[Target]]");
    expect(screen.getByTestId("source-links")).toHaveTextContent('"targetNodeId":"n-2"');
  });

  it("moves focus into internal link candidates with ArrowDown and back to the node with ArrowUp", async () => {
    const document = makeDocumentWithTexts(["Previous", "Source [[Tar", "Target Alpha", "Target Beta"]);
    function Harness() {
      const [currentDocument, setCurrentDocument] = useState<OutlineDocument>(document);
      const [view, setView] = useState<ViewState>({ ...createInitialView(document), selectedNodeId: "n-2" });
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
    textbox.focus();
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Target Alpha" })).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("option", { name: "Target Alpha" }), { key: "ArrowDown" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Target Beta" })).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("option", { name: "Target Beta" }), { key: "ArrowUp" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Target Alpha" })).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("option", { name: "Target Alpha" }), { key: "ArrowUp" });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), { key: "ArrowUp" });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Previous");
      expect(screen.queryByRole("listbox", { name: "Internal link candidates" })).not.toBeInTheDocument();
    });
  });

  it("keeps typing into the node while an internal link candidate has focus", async () => {
    const document = makeDocumentWithTexts(["Source [[Tar", "Tarot", "Targ Match"]);
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
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });
    textbox.focus();
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Tarot" })).toHaveFocus();
    });

    fireEvent.keyDown(screen.getByRole("option", { name: "Tarot" }), { key: "g" });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Source [[Targ");
      expect(screen.getByRole("option", { name: "Targ Match" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Tarot" })).not.toBeInTheDocument();
    });
  });

  it("inserts the first internal link candidate with Enter", async () => {
    const document = makeDocumentWithTexts(["Source [[Tar", "Target"]);
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
    const textbox = screen.getByRole("textbox", { name: "Outline node text" });
    textbox.focus();
    fireEvent.keyDown(textbox, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Source [[Target]]");
    });
  });

  it("opens stored internal links from inactive rows", async () => {
    const baseDocument = makeDocumentWithTexts(["See [[Target]]", "Target"]);
    const document = updateNodeLinks(
      baseDocument,
      "n-1",
      [{ source: "[[Target]]", targetNodeId: "n-2", label: "Target" }],
      () => 1
    );
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
    await userEvent.click(screen.getByText("Target"));
    await userEvent.click(screen.getByRole("button", { name: "Target" }));
    expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("Target");
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

  it("shows markdown heading markers while editing heading nodes", async () => {
    const document = makeDocumentWithTexts(["Title"]);
    document.nodes["n-1"] = { ...document.nodes["n-1"], heading: 1 };
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
      expect(screen.getByRole("textbox", { name: "Outline node text" })).toHaveTextContent("# Title");
      expect(container.querySelector(".outline-row-active")).toHaveClass("outline-row-heading-1");
    });
  });

  it("uses the global note visibility setting for note previews", async () => {
    const document = makeDocumentWithTexts(["With note"]);
    document.nodes["n-1"] = { ...document.nodes["n-1"], note: "A note" };
    const { rerender } = render(
      <Outliner
        document={document}
        view={{ ...createInitialView(document), selectedNodeId: undefined }}
        createId={() => "new"}
        now={() => 1}
        showNotes={false}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );

    expect(screen.queryByText("A note")).not.toBeInTheDocument();

    rerender(
      <Outliner
        document={document}
        view={{ ...createInitialView(document), selectedNodeId: undefined }}
        createId={() => "new"}
        now={() => 1}
        showNotes={true}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );

    expect(screen.getByText("A note")).toHaveClass("node-note");
    expect(screen.queryByRole("textbox", { name: "Node note" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("checkbox", { name: "Numbered node" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Outline node text" }), {
      key: "Enter",
      code: "Enter",
      shiftKey: true
    });
    const noteEditor = screen.getByRole("textbox", { name: "Node note" });
    Object.defineProperty(noteEditor, "textContent", {
      configurable: true,
      get: () => "A note"
    });
    fireEvent.compositionEnd(noteEditor, { data: "" });
    delete (noteEditor as { textContent?: string }).textContent;
    await userEvent.click(screen.getByText("Other"));
    expect(screen.getByText("Formatted").closest(".outline-row")).toHaveClass("outline-row-heading-2");
    await waitFor(() => {
      expect(screen.getByText("A note")).toHaveClass("node-note");
    });
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

function mockScrollContainer(element: HTMLElement, options: { height: number; scrollHeight: number }) {
  Object.defineProperty(element, "clientHeight", { configurable: true, value: options.height });
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: options.scrollHeight });
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 100 + options.height,
    left: 0,
    right: 800,
    width: 800,
    height: options.height,
    x: 0,
    y: 100,
    toJSON: () => ({})
  });
}

function mockRowRect(container: HTMLElement, nodeId: string, options: { top: number; height: number }) {
  const row = container.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  if (!row) {
    throw new Error(`Missing row for ${nodeId}`);
  }
  vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => {
    const scrollTop = row.parentElement?.scrollTop ?? 0;
    const top = options.top - scrollTop;
    return {
      top,
      bottom: top + options.height,
      left: 0,
      right: 800,
      width: 800,
      height: options.height,
      x: 0,
      y: top,
      toJSON: () => ({})
    };
  });
}
