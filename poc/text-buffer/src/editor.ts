import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  foldService,
  syntaxHighlighting,
  toggleFold
} from "@codemirror/language";
import { EditorSelection, EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  lineNumbers,
  rectangularSelection,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";
import {
  backspaceAtItemStart,
  deleteItem,
  duplicateItem,
  indentItems,
  moveItemDown,
  moveItemUp,
  outdentItems,
  splitItem
} from "./commands";
import { childRange, itemAtSelection, outlineIndexField, type OutlineItem } from "./outline";

export type CompositionEventRecord = {
  type: "compositionstart" | "compositionupdate" | "compositionend" | "beforeinput" | "input";
  data: string | null;
  inputType: string | null;
  composing: boolean;
  at: number;
};

type Zoom = { anchor: number };
type ZoomValue = { zoom: Zoom | null; decorations: DecorationSet };

export const setZoom = StateEffect.define<Zoom | null>();

function zoomDecorations(state: EditorState, zoom: Zoom | null): DecorationSet {
  if (!zoom) return Decoration.none;
  const index = state.field(outlineIndexField);
  const itemIndex = index.items.findIndex((item) => item.from <= zoom.anchor && zoom.anchor <= item.to);
  if (itemIndex < 0) return Decoration.none;
  const item = index.items[itemIndex];
  const children = childRange(index, itemIndex);
  if (!children) return Decoration.none;
  const ranges = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (line.from < children.from || line.from >= children.to) {
      ranges.push(Decoration.line({ attributes: { class: "cm-poc-hidden-line" } }).range(line.from));
    }
  }
  return Decoration.set(ranges, true);
}

export const zoomField = StateField.define<ZoomValue>({
  create: () => ({ zoom: null, decorations: Decoration.none }),
  update: (value, transaction) => {
    let zoom = value.zoom && transaction.docChanged
      ? { anchor: transaction.changes.mapPos(value.zoom.anchor, 1) }
      : value.zoom;
    for (const effect of transaction.effects) {
      if (effect.is(setZoom)) zoom = effect.value;
    }
    return { zoom, decorations: zoomDecorations(transaction.state, zoom) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

function itemLabel(view: EditorView, item: OutlineItem): string {
  return view.state.doc
    .sliceString(item.contentFrom, item.contentTo)
    .replace(/(?:\^ol-[\w-]+|<!--\s*outliner:id=[\w-]+\s*-->)\s*$/, "")
    .trim() || "빈 항목";
}

export function zoomIn(view: EditorView): boolean {
  const index = view.state.field(outlineIndexField);
  const itemIndex = itemAtSelection(view.state);
  if (itemIndex === null) return false;
  const children = childRange(index, itemIndex);
  if (!children) return false;
  const firstChild = index.items[itemIndex + 1];
  view.dispatch({
    effects: setZoom.of({ anchor: index.items[itemIndex].from }),
    selection: EditorSelection.cursor(firstChild.contentFrom),
    scrollIntoView: true
  });
  return true;
}

export function zoomOut(view: EditorView): boolean {
  const value = view.state.field(zoomField);
  if (!value.zoom) return false;
  const index = view.state.field(outlineIndexField);
  const item = index.items.find((candidate) => candidate.from <= value.zoom!.anchor && value.zoom!.anchor <= candidate.to);
  view.dispatch({
    effects: setZoom.of(null),
    selection: item ? EditorSelection.cursor(item.contentFrom) : undefined,
    scrollIntoView: true
  });
  return true;
}

export function zoomTitle(view: EditorView): string | null {
  const value = view.state.field(zoomField);
  if (!value.zoom) return null;
  const item = view.state.field(outlineIndexField).items.find(
    (candidate) => candidate.from <= value.zoom!.anchor && value.zoom!.anchor <= candidate.to
  );
  return item ? itemLabel(view, item) : null;
}

class MarkerWidget extends WidgetType {
  constructor(
    readonly itemFrom: number,
    readonly taskFrom: number | null,
    readonly taskTo: number | null,
    readonly marker: string,
    readonly done: boolean,
    readonly hasChildren: boolean
  ) {
    super();
  }

  eq(other: MarkerWidget): boolean {
    return this.itemFrom === other.itemFrom && this.taskFrom === other.taskFrom && this.taskTo === other.taskTo &&
      this.marker === other.marker && this.done === other.done && this.hasChildren === other.hasChildren;
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = this.taskFrom === null ? "cm-outline-marker" : "cm-outline-marker cm-outline-check";
    button.textContent = this.taskFrom === null ? this.marker : (this.done ? "✓" : "");
    button.setAttribute("aria-label", this.taskFrom === null ? "항목 확대" : "완료 상태 전환");
    if (this.done) button.dataset.checked = "true";
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (this.taskFrom !== null && this.taskTo !== null) {
        view.dispatch({ changes: { from: this.taskFrom, to: this.taskTo, insert: this.done ? "[ ]" : "[x]" } });
        return;
      }
      if (!this.hasChildren) return;
      const index = view.state.field(outlineIndexField);
      const itemIndex = index.items.findIndex((item) => item.from === this.itemFrom);
      if (itemIndex < 0) return;
      const firstChild = index.items[itemIndex + 1];
      view.dispatch({
        effects: setZoom.of({ anchor: this.itemFrom }),
        selection: EditorSelection.cursor(firstChild.contentFrom),
        scrollIntoView: true
      });
    });
    return button;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function firstItemAtOrAfter(items: readonly OutlineItem[], position: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (items[middle].to < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

function visibleOutlineDecorations(view: EditorView): DecorationSet {
  const index = view.state.field(outlineIndexField);
  const ranges = [];
  for (const visible of view.visibleRanges) {
    for (let cursor = firstItemAtOrAfter(index.items, visible.from); cursor < index.items.length; cursor += 1) {
      const item = index.items[cursor];
      if (item.from > visible.to) break;
      const hasChildren = index.items[cursor + 1]?.parent === cursor;
      const marker = item.marker === "number" ? item.markerText : "";
      ranges.push(
        Decoration.line({
          attributes: {
            class: `cm-outline-line cm-outline-${item.marker}`,
            style: `--outline-depth: ${item.depth}`
          }
        }).range(item.from)
      );
      if (item.contentFrom > item.from) {
        ranges.push(
          Decoration.replace({
            widget: new MarkerWidget(item.from, item.taskFrom, item.taskTo, marker, item.done, hasChildren),
            inclusive: false
          }).range(item.from, item.contentFrom)
        );
      }
    }
  }
  return Decoration.set(ranges, true);
}

const outlineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = visibleOutlineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = visibleOutlineDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

function compositionExtension(record: (event: CompositionEventRecord) => void): Extension {
  const add = (event: Event, view: EditorView) => {
    const composition = event as CompositionEvent;
    const input = event as InputEvent;
    record({
      type: event.type as CompositionEventRecord["type"],
      data: composition.data ?? input.data ?? null,
      inputType: input.inputType ?? null,
      composing: view.composing || input.isComposing,
      at: performance.now()
    });
    return false;
  };
  return EditorView.domEventHandlers({
    compositionstart: add,
    compositionupdate: add,
    compositionend: add,
    beforeinput: add,
    input: add
  });
}

const outlineFold = foldService.of((state, from) => {
  const index = state.field(outlineIndexField);
  const itemIndex = index.byLine.get(state.doc.lineAt(from).number);
  if (itemIndex === undefined) return null;
  const children = childRange(index, itemIndex);
  return children && children.to > children.from ? { from: state.doc.line(index.items[itemIndex].line).to, to: children.to } : null;
});

const pocKeymap = keymap.of([
  { key: "Enter", run: splitItem },
  { key: "Backspace", run: backspaceAtItemStart },
  { key: "Tab", run: indentItems },
  { key: "Shift-Tab", run: outdentItems },
  { key: "Alt-Shift-ArrowUp", run: moveItemUp },
  { key: "Alt-Shift-ArrowDown", run: moveItemDown },
  { key: "Mod-Shift-d", run: duplicateItem },
  { key: "Mod-Shift-Backspace", run: deleteItem },
  { key: "Mod-.", run: toggleFold },
  { key: "Mod-]", run: zoomIn },
  { key: "Mod-[", run: zoomOut },
  ...historyKeymap,
  ...foldKeymap,
  ...defaultKeymap
]);

export type TextBufferEditorOptions = {
  parent: HTMLElement;
  doc: string;
  onComposition: (event: CompositionEventRecord) => void;
  onUpdate?: (update: ViewUpdate) => void;
};

export function createTextBufferEditor(options: TextBufferEditorOptions): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        outlineIndexField,
        zoomField,
        outlineFold,
        foldGutter(),
        outlineDecorations,
        pocKeymap,
        compositionExtension(options.onComposition),
        options.onUpdate ? EditorView.updateListener.of(options.onUpdate) : []
      ]
    })
  });
}
