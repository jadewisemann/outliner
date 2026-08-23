import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import {
  itemAtSelection,
  outlineIndexField,
  selectedRoots,
  siblingOf,
  type OutlineItem
} from "./outline";

function itemContent(view: EditorView, item: OutlineItem): string {
  return view.state.doc.sliceString(item.contentFrom, item.contentTo);
}

function freshPrefix(item: OutlineItem): string {
  const marker = `${item.indentText}${item.markerText} `;
  return item.marker === "task" ? `${marker}[ ] ` : marker;
}

export const splitItem: Command = (view) => {
  if (view.composing) return false;
  const selection = view.state.selection.main;
  const index = view.state.field(outlineIndexField);
  const itemIndex = itemAtSelection(view.state);
  if (!selection.empty || itemIndex === null) return false;
  const item = index.items[itemIndex];
  const line = view.state.doc.lineAt(selection.head);
  if (line.number !== item.line || selection.head < item.contentFrom) return false;

  const content = itemContent(view, item);
  if (content.length === 0) {
    if (item.depth > 0) {
      const remove = item.indentText.startsWith("\t") ? 1 : Math.min(2, item.indentText.length);
      view.dispatch({ changes: { from: item.from, to: item.from + remove } });
    } else {
      view.dispatch({ changes: { from: item.from, to: item.contentFrom, insert: "" } });
    }
    return true;
  }

  const before = view.state.doc.sliceString(item.contentFrom, selection.head);
  const after = view.state.doc.sliceString(selection.head, item.contentTo);
  const prefix = freshPrefix(item);
  const replacement = `${before}\n${prefix}${after}`;
  const cursor = item.contentFrom + before.length + 1 + prefix.length;
  view.dispatch({
    changes: { from: item.contentFrom, to: item.contentTo, insert: replacement },
    selection: EditorSelection.cursor(cursor),
    scrollIntoView: true,
    userEvent: "input"
  });
  return true;
};

export const backspaceAtItemStart: Command = (view) => {
  if (view.composing) return false;
  const selection = view.state.selection.main;
  const index = view.state.field(outlineIndexField);
  const itemIndex = itemAtSelection(view.state);
  if (!selection.empty || itemIndex === null) return false;
  const item = index.items[itemIndex];
  if (selection.head !== item.contentFrom) return false;

  if (itemIndex === 0) {
    view.dispatch({ changes: { from: item.from, to: item.contentFrom } });
    return true;
  }

  if (item.depth > 0 && index.items[itemIndex - 1].depth < item.depth) {
    return changeIndent(view, -1);
  }

  const previous = index.items[itemIndex - 1];
  const content = itemContent(view, item);
  const separatorFrom = previous.to;
  view.dispatch({
    changes: { from: separatorFrom, to: item.contentTo, insert: content },
    selection: EditorSelection.cursor(separatorFrom),
    scrollIntoView: true,
    userEvent: "delete.backward"
  });
  return true;
};

function linesInRange(view: EditorView, from: number, to: number): number[] {
  const lines: number[] = [];
  let line = view.state.doc.lineAt(from);
  const last = view.state.doc.lineAt(Math.max(from, to - 1)).number;
  while (line.number <= last) {
    lines.push(line.from);
    if (line.number === view.state.doc.lines) break;
    line = view.state.doc.line(line.number + 1);
  }
  return lines;
}

export function changeIndent(view: EditorView, direction: -1 | 1): boolean {
  const index = view.state.field(outlineIndexField);
  const roots = selectedRoots(view.state);
  if (roots.length === 0) return false;
  const changes: ChangeSpec[] = [];

  for (const rootIndex of roots) {
    const root = index.items[rootIndex];
    if (direction < 0 && root.depth === 0) continue;
    for (const lineFrom of linesInRange(view, root.subtreeFrom, root.subtreeTo)) {
      if (direction > 0) {
        changes.push({ from: lineFrom, insert: "  " });
      } else {
        const line = view.state.doc.lineAt(lineFrom);
        const leading = /^\t|^ {1,2}/.exec(line.text)?.[0] ?? "";
        if (leading) changes.push({ from: lineFrom, to: lineFrom + leading.length });
      }
    }
  }

  if (changes.length === 0) return true;
  view.dispatch({ changes, userEvent: direction > 0 ? "input.indent" : "input.dedent" });
  return true;
}

export const indentItems: Command = (view) => changeIndent(view, 1);
export const outdentItems: Command = (view) => changeIndent(view, -1);

type Block = { body: string; separator: string };

function block(view: EditorView, item: OutlineItem): Block {
  const text = view.state.doc.sliceString(item.subtreeFrom, item.subtreeTo);
  const separator = /(?:\r?\n(?:[ \t]*\r?\n)*)$/.exec(text)?.[0] ?? "";
  return { body: separator ? text.slice(0, -separator.length) : text, separator };
}

function swapBlocks(view: EditorView, firstIndex: number, secondIndex: number, movedIndex: number): boolean {
  const index = view.state.field(outlineIndexField);
  const first = index.items[firstIndex];
  const second = index.items[secondIndex];
  const firstBlock = block(view, first);
  const secondBlock = block(view, second);
  const between = firstBlock.separator || "\n";
  const tail = secondBlock.separator;
  const replacement = `${secondBlock.body}${between}${firstBlock.body}${tail}`;
  const moved = index.items[movedIndex];
  const offset = view.state.selection.main.head - moved.from;
  const movedFrom = movedIndex === secondIndex
    ? first.from
    : first.from + secondBlock.body.length + between.length;

  view.dispatch({
    changes: { from: first.from, to: second.subtreeTo, insert: replacement },
    selection: EditorSelection.cursor(movedFrom + offset),
    scrollIntoView: true,
    userEvent: "move"
  });
  return true;
}

export const moveItemUp: Command = (view) => {
  const index = view.state.field(outlineIndexField);
  const itemIndex = itemAtSelection(view.state);
  if (itemIndex === null) return false;
  const previous = siblingOf(index, itemIndex, -1);
  if (previous === null) return false;
  return swapBlocks(view, previous, itemIndex, itemIndex);
};

export const moveItemDown: Command = (view) => {
  const index = view.state.field(outlineIndexField);
  const itemIndex = itemAtSelection(view.state);
  if (itemIndex === null) return false;
  const next = siblingOf(index, itemIndex, 1);
  if (next === null) return false;
  return swapBlocks(view, itemIndex, next, itemIndex);
};

export const duplicateItem: Command = (view) => {
  const index = view.state.field(outlineIndexField);
  const itemIndex = itemAtSelection(view.state);
  if (itemIndex === null) return false;
  const item = index.items[itemIndex];
  const copy = block(view, item);
  const insertion = item.subtreeTo === view.state.doc.length
    ? `${copy.separator ? "" : "\n"}${copy.body}`
    : `${copy.body}${copy.separator || "\n"}`;
  const from = item.subtreeTo;
  const duplicateFrom = from + (item.subtreeTo === view.state.doc.length && !copy.separator ? 1 : 0);
  view.dispatch({
    changes: { from, insert: insertion },
    selection: EditorSelection.cursor(duplicateFrom + (view.state.selection.main.head - item.from)),
    scrollIntoView: true,
    userEvent: "input.duplicate"
  });
  return true;
};

export const deleteItem: Command = (view) => {
  const index = view.state.field(outlineIndexField);
  const roots = selectedRoots(view.state);
  if (roots.length === 0) return false;
  const changes: ChangeSpec[] = roots.map((rootIndex) => {
    const item = index.items[rootIndex];
    let from = item.subtreeFrom;
    if (item.subtreeTo === view.state.doc.length && from > 0 && view.state.doc.sliceString(from - 1, from) === "\n") {
      from -= 1;
    }
    return { from, to: item.subtreeTo };
  });
  view.dispatch({ changes, userEvent: "delete" });
  return true;
};
