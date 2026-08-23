import { StateField, Text, type EditorState } from "@codemirror/state";

export type OutlineMarker = "bullet" | "number" | "task";

export type OutlineItem = {
  id: string | null;
  from: number;
  to: number;
  line: number;
  depth: number;
  parent: number | null;
  subtreeFrom: number;
  subtreeTo: number;
  marker: OutlineMarker;
  markerText: string;
  indentText: string;
  contentFrom: number;
  contentTo: number;
  taskFrom: number | null;
  taskTo: number | null;
  done: boolean;
};

export type OutlineIndex = {
  items: OutlineItem[];
  byLine: ReadonlyMap<number, number>;
  parseMs: number;
};

const LIST_LINE = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)(?:\[([ xX])\]([ \t]+))?(.*)$/;
const BLOCK_ID = /(?:\^ol-([\w-]+)|<!--\s*outliner:id=([\w-]+)\s*-->)\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;

function indentationColumns(value: string): number {
  let columns = 0;
  for (const char of value) columns += char === "\t" ? 2 : 1;
  return columns;
}

function asText(input: Text | string): Text {
  return typeof input === "string" ? Text.of(input.split("\n")) : input;
}

/** Parse only the Outline Markdown list subset. Everything else stays raw text. */
export function parseOutline(input: Text | string): OutlineIndex {
  const started = performance.now();
  const doc = asText(input);
  const items: OutlineItem[] = [];
  const byLine = new Map<number, number>();
  const parents: number[] = [];
  const openSubtrees: number[] = [];

  let frontMatter = doc.lines > 1 && doc.line(1).text.trim() === "---";
  let fence: { char: string; length: number } | null = null;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const trimmed = line.text.trim();

    if (frontMatter) {
      if (lineNumber > 1 && trimmed === "---") frontMatter = false;
      continue;
    }

    const fenceMatch = FENCE.exec(line.text);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }

    const match = LIST_LINE.exec(line.text);
    if (!match) continue;

    const [, indentText, markerText, markerGap, taskState, taskGap = "", content] = match;
    const depthColumns = indentationColumns(indentText);
    const depth = depthColumns === 0 ? 0 : Math.ceil(depthColumns / 2);
    const marker = taskState === undefined ? (/^\d/.test(markerText) ? "number" : "bullet") : "task";
    const prefixLength = indentText.length + markerText.length + markerGap.length +
      (taskState === undefined ? 0 : 3 + taskGap.length);
    const contentFrom = line.from + prefixLength;
    const idMatch = BLOCK_ID.exec(content);

    while (parents.length > 0 && items[parents[parents.length - 1]].depth >= depth) parents.pop();
    while (openSubtrees.length > 0 && items[openSubtrees[openSubtrees.length - 1]].depth >= depth) {
      items[openSubtrees.pop()!].subtreeTo = line.from;
    }

    const item: OutlineItem = {
      id: idMatch?.[1] ?? idMatch?.[2] ?? null,
      from: line.from,
      to: line.to,
      line: lineNumber,
      depth,
      parent: parents.at(-1) ?? null,
      subtreeFrom: line.from,
      subtreeTo: doc.length,
      marker,
      markerText,
      indentText,
      contentFrom,
      contentTo: line.to,
      taskFrom: taskState === undefined ? null : line.from + indentText.length + markerText.length + markerGap.length,
      taskTo: taskState === undefined ? null : line.from + indentText.length + markerText.length + markerGap.length + 3,
      done: taskState !== undefined && taskState.toLowerCase() === "x"
    };

    const index = items.push(item) - 1;
    byLine.set(lineNumber, index);
    parents.push(index);
    openSubtrees.push(index);
  }

  return { items, byLine, parseMs: performance.now() - started };
}

export const outlineIndexField = StateField.define<OutlineIndex>({
  create: (state) => parseOutline(state.doc),
  update: (value, transaction) => transaction.docChanged ? parseOutline(transaction.newDoc) : value
});

export function itemAtPosition(index: OutlineIndex, position: number): number | null {
  let low = 0;
  let high = index.items.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (index.items[middle].from <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0 || position > index.items[found].subtreeTo) return null;
  return found;
}

export function itemAtSelection(state: EditorState): number | null {
  return itemAtPosition(state.field(outlineIndexField), state.selection.main.head);
}

export function selectedRoots(state: EditorState): number[] {
  const index = state.field(outlineIndexField);
  const selected = new Set<number>();

  for (const range of state.selection.ranges) {
    if (range.empty) {
      const item = itemAtPosition(index, range.head);
      if (item !== null) selected.add(item);
      continue;
    }
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (const item of index.items) {
      if (item.line > endLine) break;
      if (item.line >= startLine) selected.add(index.byLine.get(item.line)!);
    }
  }

  return [...selected]
    .sort((a, b) => index.items[a].from - index.items[b].from)
    .filter((candidate) => {
      let parent = index.items[candidate].parent;
      while (parent !== null) {
        if (selected.has(parent)) return false;
        parent = index.items[parent].parent;
      }
      return true;
    });
}

export function siblingOf(index: OutlineIndex, itemIndex: number, direction: -1 | 1): number | null {
  const item = index.items[itemIndex];
  for (let cursor = itemIndex + direction; cursor >= 0 && cursor < index.items.length; cursor += direction) {
    const candidate = index.items[cursor];
    if (candidate.depth < item.depth) return null;
    if (candidate.depth === item.depth && candidate.parent === item.parent) return cursor;
  }
  return null;
}

export function childRange(index: OutlineIndex, itemIndex: number): { from: number; to: number } | null {
  const item = index.items[itemIndex];
  const next = index.items[itemIndex + 1];
  if (!next || next.parent !== itemIndex) return null;
  return { from: item.to + 1, to: item.subtreeTo };
}
