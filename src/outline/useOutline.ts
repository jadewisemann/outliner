import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject
} from "react";
import type { Store } from "../store";
import { labelOf } from "../search/links";
import { allTags } from "../search/search";
import { docList, type Id, type Node, type Row as RowModel } from "../types";
import type { DropPosition, RowApi } from "./components/Row";
import { writeField } from "./components/Editable";
import {
  applyCompletion,
  autoFormat,
  completionAt,
  fuzzy,
  isUrl,
  linkTo,
  toggleLink,
  toggleWrap,
  type Selection,
  type Trigger,
  type WrapKind
} from "./markdown";
import {
  appendChild,
  bulkIndent,
  bulkMove,
  bulkOutdent,
  bulkRemove,
  bulkSetCollapsed,
  duplicate,
  indent,
  insertOutlineText,
  mergeIntoPrevious,
  moveVertically,
  outdent,
  parentOf,
  patchNode,
  reparent,
  rowAfter,
  rowBefore,
  splitAt,
  toOutlineText,
  topLevel
} from "./tree";
import { useVirtualRows } from "./useVirtualRows";

/** One offer from `[[` or `#`: what it reads as, and what it writes. */
export type Choice = { label: string; insert: string; hint?: string };

/** What `[[` or `#` is offering right now, and where it will be inserted. */
export type Completion = { rowId: Id; trigger: Trigger; items: Choice[]; index: number };

/** Enough to put back a markdown prefix the editor swallowed one keystroke ago. */
type AutoUndo = { rowId: Id; prefix: string; node?: Partial<Node>; parentId?: Id; parent?: Partial<Node> };

const WRAP_KEYS: Record<string, WrapKind> = { b: "bold", i: "italic", e: "code" };
const SHIFT_WRAP_KEYS: Record<string, WrapKind> = { x: "strike", h: "highlight" };
const COMPLETION_LIMIT = 8;

/** The edits a phone cannot reach, since it has no Tab key and no ⌘⇧↑↓. */
export type Nudge = {
  indent(): void;
  outdent(): void;
  move(direction: -1 | 1): void;
};

export type OutlineView = {
  containerRef: RefObject<HTMLDivElement>;
  nudge: Nudge;
  rows: RowModel[];
  window: { start: number; end: number; padTop: number; padBottom: number };
  activeId: Id | null;
  selected: Set<Id>;
  focus: Store["focus"];
  noteFocus: { id: Id; seq: number } | null;
  completion: Completion | null;
  dropSpot: { id: Id; position: DropPosition } | null;
  api: RowApi;
  containerProps: {
    onFocus(event: FocusEvent<HTMLDivElement>): void;
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
    onDragEnd(): void;
  };
  onTailMouseDown(event: MouseEvent): void;
};

/**
 * Everything the outline does — selection, keyboard, drag & drop, zoom — as
 * one hook. The component renders what comes out of here and nothing else.
 *
 * Handlers live for the lifetime of the component (a new `api` object per
 * keystroke would defeat the memo on every row), so the latest rows, doc and
 * selection are read through refs rather than baked into closures.
 */
export function useOutline(
  store: Store,
  scrollRef: RefObject<HTMLElement>,
  onTagClick: (tag: string) => void,
  onDocLinkClick: (title: string) => void,
  onItemLinkClick: (id: Id) => void
): OutlineView {
  const { doc, view, rows, focus, edit, setView, requestFocus } = store;

  const [selection, setSelection] = useState<Id[]>([]);
  const [noteFocus, setNoteFocus] = useState<{ id: Id; seq: number } | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [dropSpot, setDropSpot] = useState<{ id: Id; position: DropPosition } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<Id | null>(null);
  const dragId = useRef<Id | null>(null);
  const dropRef = useRef<{ id: Id; position: DropPosition } | null>(null);
  const noteSeq = useRef(0);
  const autoUndo = useRef<AutoUndo | null>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const zoomRef = useRef(view.zoomId);
  zoomRef.current = view.zoomId;
  const docRef = useRef(doc);
  docRef.current = doc;
  const workspaceRef = useRef(store.workspace);
  workspaceRef.current = store.workspace;
  const completionRef = useRef(completion);
  completionRef.current = completion;

  /* ---------------------------------------------------------------- */
  /* writing into the focused field                                    */
  /* ---------------------------------------------------------------- */

  /**
   * A formatting shortcut has to write the DOM itself: the field is
   * uncontrolled while it has focus, so waiting for the store to come back
   * round would lose the caret and fight the IME.
   */
  const applyText = useCallback(
    (element: HTMLTextAreaElement, id: Id, next: Selection, coalesceKey?: string) => {
      writeField(element, next.text, next.start, next.end);
      edit((current) => patchNode(current, id, { text: next.text }), { coalesceKey });
    },
    [edit]
  );

  /* ---------------------------------------------------------------- */
  /* completion                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * `[[` offers documents *and* rows, because "link to the thing I mean" is
   * one intent — but they are written differently, so each offer carries the
   * literal text it will insert.
   */
  const candidates = useCallback((trigger: Trigger): Choice[] => {
    const workspace = workspaceRef.current;
    const pool: Choice[] = [];

    if (trigger.kind === "tag") {
      for (const entry of allTags(workspace)) pool.push({ label: entry.tag, insert: entry.tag });
    } else {
      for (const entry of docList(workspace)) {
        if (entry.kind === "doc") pool.push({ label: entry.title, insert: `[[${entry.title}]]`, hint: "문서" });
      }
      for (const entry of docList(workspace)) {
        if (entry.kind === "folder") continue;
        for (const node of Object.values(entry.nodes)) {
          if (node.id === entry.rootId || node.text.trim() === "") continue;
          pool.push({ label: node.text, insert: `((${node.id}))`, hint: entry.title });
        }
      }
    }

    const term = trigger.kind === "tag" ? `#${trigger.query}` : trigger.query;
    return pool
      .map((choice) => ({ choice, match: fuzzy(choice.label, term) }))
      .filter((entry) => entry.match !== null)
      .sort((a, b) => b.match!.score - a.match!.score)
      .slice(0, COMPLETION_LIMIT)
      .map((entry) => entry.choice);
  }, []);

  /**
   * Recomputed from the live field rather than from the store: the store lags
   * a keystroke behind and does not know where the caret is.
   */
  const refreshCompletion = useCallback(
    (rowId: Id) => {
      const element = document.activeElement;
      if (!(element instanceof HTMLTextAreaElement) || element.selectionStart !== element.selectionEnd) {
        setCompletion(null);
        return;
      }
      const trigger = completionAt(element.value, element.selectionStart);
      const items = trigger ? candidates(trigger) : [];
      setCompletion(trigger && items.length > 0 ? { rowId, trigger, items, index: 0 } : null);
    },
    [candidates]
  );

  const acceptCompletion = useCallback(
    (element: HTMLTextAreaElement, rowId: Id, choice: Choice) => {
      const open = completionRef.current;
      if (!open) return;
      applyText(element, rowId, applyCompletion(element.value, element.selectionStart, open.trigger, choice.insert));
      setCompletion(null);
    },
    [applyText]
  );

  /* ---------------------------------------------------------------- */
  /* selection                                                         */
  /* ---------------------------------------------------------------- */

  const enterSelection = useCallback((ids: Id[]) => {
    setSelection(ids);
    if (ids.length > 0) containerRef.current?.focus({ preventScroll: true });
  }, []);

  const focusNote = useCallback((id: Id) => {
    noteSeq.current += 1;
    setNoteFocus({ id, seq: noteSeq.current });
  }, []);

  /* ---------------------------------------------------------------- */
  /* zoom                                                              */
  /* ---------------------------------------------------------------- */

  const zoom = useCallback(
    (id: Id) => {
      setSelection([]);
      setView({ zoomId: id });
      // An empty target gets its editable row from the store's own guard.
      const first = docRef.current.nodes[id]?.children[0];
      if (first) requestFocus(first);
    },
    [setView, requestFocus]
  );

  const zoomOut = useCallback(() => {
    const current = zoomRef.current;
    const now = docRef.current;
    if (current === now.rootId) return;
    setView({ zoomId: parentOf(now, current) ?? now.rootId });
    requestFocus(current);
  }, [setView, requestFocus]);

  /* ---------------------------------------------------------------- */
  /* keyboard inside a row                                             */
  /* ---------------------------------------------------------------- */

  const onTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel) => {
      const mod = event.metaKey || event.ctrlKey;
      const caret = element.selectionStart;
      const noRange = element.selectionStart === element.selectionEnd;
      const zoomId = zoomRef.current;
      const stop = () => event.preventDefault();
      const format = (next: Selection) => {
        stop();
        applyText(element, row.id, next);
      };

      // The completion list owns the arrows and Enter while it is open, the
      // way it does in an editor. Everything below is unreachable until it
      // closes, which is why this runs first.
      const open = completionRef.current;
      if (open && open.rowId === row.id) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          stop();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setCompletion({ ...open, index: (open.index + step + open.items.length) % open.items.length });
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          stop();
          acceptCompletion(element, row.id, open.items[open.index]);
          return;
        }
        if (event.key === "Escape") {
          stop();
          setCompletion(null);
          return;
        }
      }

      // One Backspace puts back a prefix the editor swallowed. Without it the
      // only way out of an unwanted heading is to notice which key did it.
      const swallowed = autoUndo.current;
      if (event.key === "Backspace" && noRange && caret === 0 && swallowed?.rowId === row.id) {
        stop();
        autoUndo.current = null;
        const restored = swallowed.prefix + element.value;
        writeField(element, restored, swallowed.prefix.length);
        edit((current) => {
          const reverted = patchNode(current, row.id, { text: restored, ...swallowed.node });
          return swallowed.parentId && swallowed.parent
            ? patchNode(reverted, swallowed.parentId, swallowed.parent)
            : reverted;
        });
        return;
      }
      if (event.key !== "Backspace") autoUndo.current = null;

      if (mod && !event.shiftKey && WRAP_KEYS[event.key.toLowerCase()]) {
        format(toggleWrap(element.value, element.selectionStart, element.selectionEnd, WRAP_KEYS[event.key.toLowerCase()]));
        return;
      }
      if (mod && event.shiftKey && SHIFT_WRAP_KEYS[event.key.toLowerCase()]) {
        format(
          toggleWrap(element.value, element.selectionStart, element.selectionEnd, SHIFT_WRAP_KEYS[event.key.toLowerCase()])
        );
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        format(toggleLink(element.value, element.selectionStart, element.selectionEnd));
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "d") {
        stop();
        edit((current) => duplicate(current, row.id));
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "k") {
        stop();
        edit((current) => bulkRemove(current, zoomId, [row.id]));
        return;
      }
      if (mod && (event.key === "]" || event.key === "[")) {
        stop();
        edit((current) => (event.key === "[" ? outdent(current, row.id, zoomId) : indent(current, row.id)));
        return;
      }

      // Markdown as you type. Fires on the space that completes the prefix,
      // and the space itself is never inserted — it was punctuation, not text.
      if (event.key === " " && noRange) {
        const applied = autoFormat(element.value, caret);
        if (applied) {
          stop();
          const node = docRef.current.nodes[row.id];
          const parentId = applied.parent ? node?.parent ?? undefined : undefined;
          autoUndo.current = {
            rowId: row.id,
            prefix: applied.prefix,
            node: applied.node ? { heading: node?.heading ?? 0 } : undefined,
            parentId,
            parent: parentId ? pick(docRef.current.nodes[parentId], applied.parent!) : undefined
          };
          writeField(element, applied.text, 0);
          edit((current) => {
            const patched = patchNode(current, row.id, { text: applied.text, ...applied.node });
            return parentId ? patchNode(patched, parentId, applied.parent!) : patched;
          });
          setCompletion(null);
          return;
        }
      }

      if (mod && event.shiftKey && event.code === "Period") {
        stop();
        zoom(row.id);
        return;
      }
      if (mod && event.shiftKey && event.code === "Comma") {
        stop();
        zoomOut();
        return;
      }
      if (mod && event.code === "Period") {
        stop();
        edit((current) => patchNode(current, row.id, { collapsed: !row.node.collapsed }), { transient: true });
        return;
      }
      if (mod && (event.key === "ArrowUp" || event.key === "ArrowDown") && event.shiftKey) {
        stop();
        edit((current) => moveVertically(current, row.id, event.key === "ArrowUp" ? -1 : 1));
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        stop();
        focusNote(row.id);
        return;
      }
      if (event.key === "Enter" && mod) {
        stop();
        edit((current) => patchNode(current, row.id, { done: !row.node.done }));
        return;
      }
      if (event.key === "Enter") {
        stop();
        edit((current) => splitAt(current, row.id, caret));
        return;
      }
      if (event.key === "Tab") {
        stop();
        edit((current) => (event.shiftKey ? outdent(current, row.id, zoomId) : indent(current, row.id)));
        return;
      }
      if (event.key === "Backspace" && noRange && caret === 0) {
        stop();
        edit((current) => mergeIntoPrevious(current, zoomId, row.id));
        return;
      }
      if (event.key === "Delete" && noRange && caret === element.value.length) {
        const next = rowAfter(rowsRef.current, row.id);
        if (!next) return;
        stop();
        edit((current) => mergeIntoPrevious(current, zoomId, next.id));
        return;
      }
      if (event.key === "ArrowUp" || (event.key === "ArrowLeft" && noRange && caret === 0)) {
        const previous = rowBefore(rowsRef.current, row.id);
        if (!previous) return;
        stop();
        requestFocus(previous.id, event.key === "ArrowUp" ? Math.min(caret, previous.node.text.length) : "end");
        return;
      }
      if (event.key === "ArrowDown" || (event.key === "ArrowRight" && noRange && caret === element.value.length)) {
        const next = rowAfter(rowsRef.current, row.id);
        if (!next) return;
        stop();
        requestFocus(next.id, event.key === "ArrowDown" ? Math.min(caret, next.node.text.length) : 0);
        return;
      }
      if (event.key === "Escape") {
        stop();
        element.blur();
        anchor.current = row.id;
        enterSelection([row.id]);
      }
    },
    [edit, requestFocus, focusNote, enterSelection, zoom, zoomOut]
  );

  const onNoteKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel) => {
      const atStart = element.selectionStart === 0 && element.selectionEnd === 0;
      const leaving =
        event.key === "Escape" ||
        (event.key === "ArrowUp" && atStart) ||
        (event.key === "Backspace" && atStart && element.value === "");
      if (!leaving) return;
      event.preventDefault();
      setNoteFocus(null);
      requestFocus(row.id);
    },
    [requestFocus]
  );

  /* ---------------------------------------------------------------- */
  /* keyboard while rows are selected                                  */
  /* ---------------------------------------------------------------- */

  const onContainerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const chosen = selectionRef.current;
      if (chosen.length === 0 || (event.target as HTMLElement).tagName === "TEXTAREA") return;
      const mod = event.metaKey || event.ctrlKey;
      const visible = rowsRef.current;
      const zoomId = zoomRef.current;
      const stop = () => event.preventDefault();

      if (event.key === "Escape" || event.key === "Enter") {
        stop();
        setSelection([]);
        requestFocus(chosen[chosen.length - 1]);
        return;
      }
      if (mod && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        stop();
        edit((current) => bulkMove(current, zoomId, chosen, event.key === "ArrowUp" ? -1 : 1));
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        stop();
        const up = event.key === "ArrowUp";
        const edge = (up ? rowBefore : rowAfter)(visible, chosen[up ? 0 : chosen.length - 1]);
        if (!edge) return;
        if (event.shiftKey) {
          enterSelection(rangeBetween(visible, anchor.current ?? chosen[0], edge.id));
        } else {
          anchor.current = edge.id;
          enterSelection([edge.id]);
        }
        return;
      }
      if (event.key === "Tab") {
        stop();
        edit((current) => (event.shiftKey ? bulkOutdent(current, zoomId, chosen) : bulkIndent(current, zoomId, chosen)));
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        stop();
        setSelection([]);
        edit((current) => bulkRemove(current, zoomId, chosen));
        return;
      }
      if (mod && (event.key === "c" || event.key === "x")) {
        stop();
        const now = docRef.current;
        void navigator.clipboard?.writeText(toOutlineText(now, topLevel(now, zoomId, chosen)));
        if (event.key === "x") {
          setSelection([]);
          edit((current) => bulkRemove(current, zoomId, chosen));
        }
        return;
      }
      if (mod && event.key === "a") {
        stop();
        enterSelection(visible.map((row) => row.id));
        return;
      }
      if (event.key === " ") {
        stop();
        const now = docRef.current;
        const collapsing = chosen.some((id) => now.nodes[id]?.children.length && !now.nodes[id].collapsed);
        edit((current) => bulkSetCollapsed(current, chosen, collapsing), { transient: true });
      }
    },
    [edit, enterSelection, requestFocus]
  );

  /* ---------------------------------------------------------------- */
  /* the same edits, without a keyboard                                */
  /* ---------------------------------------------------------------- */

  // Whichever row is being edited, read at press time — the bar is rendered
  // once and must not close over a row that has since changed.
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const nudge = useMemo<Nudge>(() => {
    const target = () => focusRef.current?.id ?? null;
    return {
      indent() {
        const id = target();
        if (id) edit((current) => indent(current, id));
      },
      outdent() {
        const id = target();
        if (id) edit((current) => outdent(current, id, zoomRef.current));
      },
      move(direction) {
        const id = target();
        if (id) edit((current) => moveVertically(current, id, direction));
      }
    };
  }, [edit]);

  /* ---------------------------------------------------------------- */
  /* the api handed to every row                                       */
  /* ---------------------------------------------------------------- */

  const api = useMemo<RowApi>(
    () => ({
      setText(id, text) {
        edit((current) => patchNode(current, id, { text }), { coalesceKey: `text:${id}` });
        refreshCompletion(id);
      },
      setNote(id, note) {
        edit((current) => patchNode(current, id, { note }), { coalesceKey: `note:${id}` });
      },
      onTextKeyDown,
      onNoteKeyDown,
      onPaste(event, row) {
        const text = event.clipboardData.getData("text/plain");
        const element = event.currentTarget;
        // A url dropped onto selected text links it instead of replacing it.
        if (isUrl(text) && element.selectionStart !== element.selectionEnd) {
          event.preventDefault();
          applyText(element, row.id, linkTo(element.value, element.selectionStart, element.selectionEnd, text.trim()));
          return;
        }
        if (!text.includes("\n")) return;
        event.preventDefault();
        edit((current) => insertOutlineText(current, row.id, text));
      },
      pickCompletion(id, choice) {
        const element = document.activeElement;
        if (element instanceof HTMLTextAreaElement) acceptCompletion(element, id, choice);
      },
      hoverCompletion(index) {
        setCompletion((open) => (open ? { ...open, index } : open));
      },
      toggleCollapse(id) {
        edit((current) => patchNode(current, id, { collapsed: !current.nodes[id]?.collapsed }), { transient: true });
      },
      toggleDone(id) {
        edit((current) => patchNode(current, id, { done: !current.nodes[id]?.done }));
      },
      zoom,
      focusText(id, caret) {
        setNoteFocus(null);
        setCompletion(null);
        requestFocus(id, caret);
      },
      pointerSelect(event: MouseEvent, row) {
        if (event.shiftKey) {
          event.preventDefault();
          enterSelection(rangeBetween(rowsRef.current, anchor.current ?? row.id, row.id));
          return;
        }
        if (selectionRef.current.length > 0) setSelection([]);
        anchor.current = row.id;
      },
      clearSelection() {
        setSelection([]);
      },
      openTag: onTagClick,
      openDocByTitle: onDocLinkClick,
      openItem: onItemLinkClick,
      resolveItem: (id) => labelOf(workspaceRef.current, id),
      dragStart(event: DragEvent, id) {
        dragId.current = id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      },
      dragOver(event: DragEvent, row) {
        if (!dragId.current) return;
        event.preventDefault();
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = (event.clientY - box.top) / box.height;
        const indented = event.clientX - box.left > 40 + row.depth * 22;
        const next = { id: row.id, position: (ratio < 0.35 ? "before" : indented ? "child" : "after") as DropPosition };
        if (dropRef.current?.id !== next.id || dropRef.current.position !== next.position) {
          dropRef.current = next;
          setDropSpot(next);
        }
      },
      drop(event: DragEvent) {
        event.preventDefault();
        const source = dragId.current;
        const spot = dropRef.current;
        dragId.current = null;
        dropRef.current = null;
        setDropSpot(null);
        if (!source || !spot || source === spot.id) return;
        const target = rowsRef.current.find((row) => row.id === spot.id);
        if (!target) return;
        edit((current) =>
          spot.position === "child"
            ? reparent(current, source, spot.id, 0)
            : reparent(current, source, target.parentId, target.index + (spot.position === "after" ? 1 : 0))
        );
      }
    }),
    [
      edit,
      onTextKeyDown,
      onNoteKeyDown,
      zoom,
      requestFocus,
      enterSelection,
      onTagClick,
      onDocLinkClick,
      onItemLinkClick,
      applyText,
      refreshCompletion,
      acceptCompletion
    ]
  );

  /* ---------------------------------------------------------------- */

  const selected = useMemo(() => new Set(selection), [selection]);
  const pin = selection.length > 0 ? null : focus;
  const activeId = pin?.id ?? null;
  const window = useVirtualRows(rows, scrollRef, containerRef, pin);

  return {
    containerRef,
    nudge,
    rows,
    window,
    activeId,
    selected,
    focus,
    noteFocus,
    completion,
    dropSpot,
    api,
    containerProps: {
      onFocus(event) {
        // Focusing the container with nothing selected puts the caret back
        // where the reader left off.
        if (event.target !== event.currentTarget || selectionRef.current.length > 0) return;
        const landing = rowsRef.current.find((row) => row.id === view.focusId) ?? rowsRef.current[0];
        if (landing) requestFocus(landing.id);
      },
      onKeyDown: onContainerKeyDown,
      onDragEnd() {
        dragId.current = null;
        dropRef.current = null;
        setDropSpot(null);
      }
    },
    onTailMouseDown(event) {
      event.preventDefault();
      setSelection([]);
      edit((current) => appendChild(current, zoomRef.current));
    }
  };
}

/** The values a patch is about to overwrite, so one Backspace can put them back. */
function pick(node: Node | undefined, patch: Partial<Node>): Partial<Node> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) out[key] = node?.[key as keyof Node];
  return out as Partial<Node>;
}

/** Inclusive visible-row range between two ids, in document order. */
function rangeBetween(rows: RowModel[], from: Id, to: Id): Id[] {
  const start = rows.findIndex((row) => row.id === from);
  const end = rows.findIndex((row) => row.id === to);
  if (start === -1 || end === -1) return [to];
  const [low, high] = start <= end ? [start, end] : [end, start];
  return rows.slice(low, high + 1).map((row) => row.id);
}
