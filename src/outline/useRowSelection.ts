import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import type { Store } from "../store";
import type { Id, Row as RowModel } from "../types";
import type { RowApi } from "./components/Row";
import {
  bulkIndent,
  bulkMove,
  bulkOutdent,
  bulkRemove,
  bulkSetCollapsed,
  rowAfter,
  rowBefore,
  toOutlineText,
  topLevel
} from "./tree";
import type { LiveRef } from "./useLive";

/**
 * Whole-row selection: the rows that are lit, the anchor a shift-range grows
 * from, and the keyboard that works on them while the container has focus.
 * Entering a selection moves focus to the container, so those keys land here
 * and not in a row's textarea.
 */
export function useRowSelection(
  live: LiveRef,
  edit: Store["edit"],
  requestFocus: Store["requestFocus"],
  containerRef: RefObject<HTMLDivElement>
): {
  selection: Id[];
  selected: Set<Id>;
  select(id: Id): void;
  clear(): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  api: Pick<RowApi, "pointerSelect" | "clearSelection">;
} {
  const [selection, setSelection] = useState<Id[]>([]);
  const anchor = useRef<Id | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const enterSelection = useCallback(
    (ids: Id[]) => {
      setSelection(ids);
      if (ids.length > 0) containerRef.current?.focus({ preventScroll: true });
    },
    [containerRef]
  );

  /** One row, selected from scratch — the anchor a later shift-range grows from. */
  const select = useCallback(
    (id: Id) => {
      anchor.current = id;
      enterSelection([id]);
    },
    [enterSelection]
  );

  const clear = useCallback(() => setSelection([]), []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const chosen = selectionRef.current;
      if (chosen.length === 0 || (event.target as HTMLElement).tagName === "TEXTAREA") return;
      const mod = event.metaKey || event.ctrlKey;
      const visible = live.current.rows;
      const zoomId = live.current.zoomId;
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
        const now = live.current.doc;
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
        const now = live.current.doc;
        const collapsing = chosen.some((id) => now.nodes[id]?.children.length && !now.nodes[id].collapsed);
        edit((current) => bulkSetCollapsed(current, chosen, collapsing), { transient: true });
      }
    },
    [live, edit, enterSelection, requestFocus]
  );

  const api = useMemo(
    () => ({
      pointerSelect(event: MouseEvent, row: RowModel) {
        if (event.shiftKey) {
          event.preventDefault();
          enterSelection(rangeBetween(live.current.rows, anchor.current ?? row.id, row.id));
          return;
        }
        if (selectionRef.current.length > 0) setSelection([]);
        anchor.current = row.id;
      },
      clearSelection() {
        setSelection([]);
      }
    }),
    [live, enterSelection]
  );

  const selected = useMemo(() => new Set(selection), [selection]);

  return { selection, selected, select, clear, onKeyDown, api };
}

/** Inclusive visible-row range between two ids, in document order. */
function rangeBetween(rows: RowModel[], from: Id, to: Id): Id[] {
  const start = rows.findIndex((row) => row.id === from);
  const end = rows.findIndex((row) => row.id === to);
  if (start === -1 || end === -1) return [to];
  const [low, high] = start <= end ? [start, end] : [end, start];
  return rows.slice(low, high + 1).map((row) => row.id);
}
