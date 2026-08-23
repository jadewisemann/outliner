import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  backspaceAtItemStart,
  duplicateItem,
  indentItems,
  moveItemDown,
  splitItem
} from "../commands";
import { outlineIndexField } from "../outline";

let view: EditorView | null = null;

function editor(doc: string, item = 0, offset: "start" | "end" = "end"): EditorView {
  const state = EditorState.create({ doc, extensions: [outlineIndexField] });
  const target = state.field(outlineIndexField).items[item];
  view = new EditorView({
    parent: document.body,
    state: state.update({
      selection: EditorSelection.cursor(offset === "start" ? target.contentFrom : target.contentTo)
    }).state
  });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

describe("text buffer outline commands", () => {
  it("splits an item with one transaction and keeps its marker", () => {
    const target = editor("- one\n- two");
    expect(splitItem(target)).toBe(true);
    expect(target.state.doc.toString()).toBe("- one\n- \n- two");
  });

  it("indents a selected subtree without rebuilding another model", () => {
    const target = editor("- root\n  - child\n- other");
    expect(indentItems(target)).toBe(true);
    expect(target.state.doc.toString()).toBe("  - root\n    - child\n- other");
  });

  it("applies one structural command to multiple selections", () => {
    const doc = "- a\n- b\n- c";
    const state = EditorState.create({
      doc,
      extensions: [outlineIndexField, EditorState.allowMultipleSelections.of(true)]
    });
    const items = state.field(outlineIndexField).items;
    view = new EditorView({
      parent: document.body,
      state: state.update({
        selection: EditorSelection.create([
          EditorSelection.cursor(items[0].contentFrom),
          EditorSelection.cursor(items[2].contentFrom)
        ])
      }).state
    });

    expect(indentItems(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("  - a\n- b\n  - c");
  });

  it("moves an item and all descendants as one text block", () => {
    const target = editor("- a\n  - child\n- b");
    expect(moveItemDown(target)).toBe(true);
    expect(target.state.doc.toString()).toBe("- b\n- a\n  - child");
  });

  it("duplicates a subtree", () => {
    const target = editor("- a\n  - child\n- b");
    expect(duplicateItem(target)).toBe(true);
    expect(target.state.doc.toString()).toBe("- a\n  - child\n- a\n  - child\n- b");
  });

  it("joins the preceding visible row at the start of an item", () => {
    const target = editor("- one\n- two", 1, "start");
    expect(backspaceAtItemStart(target)).toBe(true);
    expect(target.state.doc.toString()).toBe("- onetwo");
  });
});
