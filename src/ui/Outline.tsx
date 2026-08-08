import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject
} from "react";
import type { Store } from "../core/store";
import {
  appendChild,
  bulkIndent,
  bulkMove,
  bulkOutdent,
  bulkRemove,
  bulkSetCollapsed,
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
} from "../core/tree";
import type { Id, Row as RowModel } from "../core/types";
import { Row, type DropPosition, type RowApi } from "./Row";
import { useVirtualRows } from "./useVirtualRows";

type Props = {
  store: Store;
  /** The scrolling element the row window is measured against. */
  scrollRef: RefObject<HTMLElement>;
  onTagClick: (tag: string) => void;
  onDocLinkClick: (title: string) => void;
};

export function Outline({ store, scrollRef, onTagClick, onDocLinkClick }: Props) {
  const { doc, view, rows, focus, edit, setView, requestFocus } = store;
  const [selection, setSelection] = useState<Id[]>([]);
  const [noteFocus, setNoteFocus] = useState<{ id: Id; seq: number } | null>(null);
  const [dropSpot, setDropSpot] = useState<{ id: Id; position: DropPosition } | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<Id | null>(null);
  const dragId = useRef<Id | null>(null);
  const dropRef = useRef<{ id: Id; position: DropPosition } | null>(null);
  const noteSeq = useRef(0);

  // Handlers live for the lifetime of the component, so the latest rows and
  // selection are read through refs rather than baked into their closures.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const zoomRef = useRef(view.zoomId);
  zoomRef.current = view.zoomId;
  const docRef = useRef(doc);
  docRef.current = doc;

  const enterSelection = useCallback((ids: Id[]) => {
    setSelection(ids);
    if (ids.length > 0) container.current?.focus({ preventScroll: true });
  }, []);

  const focusNote = useCallback((id: Id) => {
    noteSeq.current += 1;
    setNoteFocus({ id, seq: noteSeq.current });
  }, []);

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
      const leaving = event.key === "Escape" || (event.key === "ArrowUp" && atStart) || (event.key === "Backspace" && atStart && element.value === "");
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

  const api = useMemo<RowApi>(
    () => ({
      setText(id, text) {
        edit((current) => patchNode(current, id, { text }), { coalesceKey: `text:${id}` });
      },
      setNote(id, note) {
        edit((current) => patchNode(current, id, { note }), { coalesceKey: `note:${id}` });
      },
      onTextKeyDown,
      onNoteKeyDown,
      onPaste(event, row) {
        const text = event.clipboardData.getData("text/plain");
        if (!text.includes("\n")) return;
        event.preventDefault();
        edit((current) => insertOutlineText(current, row.id, text));
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
    [edit, onTextKeyDown, onNoteKeyDown, zoom, requestFocus, focusNote, enterSelection, onTagClick, onDocLinkClick]
  );

  const selected = useMemo(() => new Set(selection), [selection]);
  const activeId = selection.length > 0 ? null : focus?.id ?? null;
  const bounds = useVirtualRows(rows, scrollRef, container, activeId);

  return (
    <div
      className="outline"
      ref={container}
      role="tree"
      aria-label="아웃라인"
      // Tabbable, so the outline is reachable without a mouse. Focusing it
      // with nothing selected puts the caret back where the reader left off.
      tabIndex={0}
      onFocus={(event) => {
        if (event.target !== event.currentTarget || selection.length > 0) return;
        const landing = rows.find((row) => row.id === view.focusId) ?? rows[0];
        if (landing) requestFocus(landing.id);
      }}
      onKeyDown={onContainerKeyDown}
      onDragEnd={() => {
        dragId.current = null;
        dropRef.current = null;
        setDropSpot(null);
      }}
    >
      {bounds.padTop > 0 ? <div style={{ height: bounds.padTop }} /> : null}
      {rows.slice(bounds.start, bounds.end).map((row) => (
        <Row
          key={row.id}
          row={row}
          active={row.id === activeId}
          selected={selected.has(row.id)}
          focusHint={row.id === focus?.id ? { caret: focus.caret, seq: focus.seq } : null}
          noteFocusHint={row.id === noteFocus?.id ? { caret: "end", seq: noteFocus.seq } : null}
          drop={dropSpot?.id === row.id ? dropSpot.position : null}
          api={api}
        />
      ))}
      {bounds.padBottom > 0 ? <div style={{ height: bounds.padBottom }} /> : null}
      <div
        className="outline-tail"
        onMouseDown={(event) => {
          event.preventDefault();
          setSelection([]);
          edit((current) => appendChild(current, zoomRef.current));
        }}
      />
    </div>
  );
}

/** Inclusive visible-row range between two ids, in document order. */
function rangeBetween(rows: RowModel[], from: Id, to: Id): Id[] {
  const start = rows.findIndex((row) => row.id === from);
  const end = rows.findIndex((row) => row.id === to);
  if (start === -1 || end === -1) return [to];
  const [low, high] = start <= end ? [start, end] : [end, start];
  return rows.slice(low, high + 1).map((row) => row.id);
}
