import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Id, Row } from "../types";

/** Below this many rows, rendering everything is cheaper than managing a window. */
const VIRTUAL_THRESHOLD = 250;

const ESTIMATE = 28;
const OVERSCAN = 10;

export type RowWindow = {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
};

/**
 * Renders only the rows near the viewport once a document gets long.
 *
 * Row heights vary (notes, wrapped text, headings), so measured heights of
 * rows that have been on screen are remembered and everything else uses an
 * estimate. Being wrong about an unmeasured row only shifts the scrollbar
 * slightly; it is corrected the moment that row is rendered.
 */
export function useVirtualRows(
  rows: Row[],
  scrollRef: RefObject<HTMLElement>,
  contentRef: RefObject<HTMLElement>,
  pinned: Id | null
): RowWindow {
  const [heights, setHeights] = useState<Record<Id, number>>({});
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const measured = useRef(heights);
  measured.current = heights;

  const virtual = rows.length > VIRTUAL_THRESHOLD;

  const offsets = useMemo(() => {
    const out = new Float64Array(rows.length + 1);
    for (let index = 0; index < rows.length; index += 1) {
      out[index + 1] = out[index] + (heights[rows[index].id] ?? ESTIMATE);
    }
    return out;
  }, [rows, heights]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!virtual || !scroller) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      const content = contentRef.current;
      if (!content) return;
      // Where the row list starts inside the scrolling element.
      const origin = content.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setViewport({ top: scroller.scrollTop - origin, height: scroller.clientHeight });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [virtual, scrollRef, contentRef, rows.length]);

  const bounds = useMemo<RowWindow>(() => {
    if (!virtual) return { start: 0, end: rows.length, padTop: 0, padBottom: 0 };

    const start = Math.max(0, indexAtOffset(offsets, viewport.top) - OVERSCAN);
    const end = Math.min(rows.length, indexAtOffset(offsets, viewport.top + Math.max(viewport.height, 1)) + OVERSCAN + 1);
    return { start, end, padTop: offsets[start], padBottom: offsets[rows.length] - offsets[end] };
  }, [virtual, rows, offsets, viewport]);

  // A focus request can land on a row far outside the window — a search hit, or
  // an undo. Scrolling to it brings it into the window on the next frame;
  // widening the window to reach it would mount every row in between.
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!virtual || !pinned || !scroller || !content) return;
    const at = rows.findIndex((row) => row.id === pinned);
    if (at === -1 || (at >= bounds.start && at < bounds.end)) return;

    const origin = content.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = origin + offsets[at] - scroller.clientHeight / 3;
  }, [virtual, pinned, rows, bounds, offsets, scrollRef, contentRef]);

  // Record the real height of everything currently rendered.
  // Heights are keyed by node id; without this they would accumulate for every
  // row ever rendered, across every document visited in the session.
  const rowCount = rows.length;
  useEffect(() => {
    setHeights((previous) => {
      const live = new Set(rows.map((row) => row.id));
      const kept = Object.keys(previous).filter((id) => live.has(id));
      if (kept.length === Object.keys(previous).length) return previous;
      return Object.fromEntries(kept.map((id) => [id, previous[id]]));
    });
    // Deliberately keyed on the row count: pruning on every keystroke would
    // cost more than the entries it reclaims.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);

  const onRendered = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    let changed: Record<Id, number> | null = null;
    for (const element of content.querySelectorAll<HTMLElement>("[data-node-id]")) {
      const id = element.dataset.nodeId;
      const height = element.offsetHeight;
      if (!id || !height || measured.current[id] === height) continue;
      (changed ??= {})[id] = height;
    }
    if (changed) setHeights((previous) => ({ ...previous, ...changed }));
  }, [contentRef]);

  useLayoutEffect(() => {
    if (virtual) onRendered();
  });

  return bounds;
}

/** Index of the last offset at or before `position`. */
function indexAtOffset(offsets: Float64Array, position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] < position) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}
