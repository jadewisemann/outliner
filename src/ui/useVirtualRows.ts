import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Id, Row } from "../core/types";

/** Below this many rows, rendering everything is cheaper than managing a window. */
export const VIRTUAL_THRESHOLD = 250;

const ESTIMATE = 28;
const OVERSCAN = 10;

export type Window = {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
  virtual: boolean;
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
): Window & { onRendered: () => void } {
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

  const window_ = useMemo<Window>(() => {
    if (!virtual) return { start: 0, end: rows.length, padTop: 0, padBottom: 0, virtual: false };

    let start = search(offsets, viewport.top) - OVERSCAN;
    let end = search(offsets, viewport.top + Math.max(viewport.height, 1)) + OVERSCAN;
    start = Math.max(0, start);
    end = Math.min(rows.length, end + 1);

    // The focused row must exist in the DOM even when it is off screen, or the
    // caret would vanish after a jump from search.
    if (pinned) {
      const at = rows.findIndex((row) => row.id === pinned);
      if (at !== -1) {
        start = Math.min(start, at);
        end = Math.max(end, at + 1);
      }
    }
    return { start, end, padTop: offsets[start], padBottom: offsets[rows.length] - offsets[end], virtual: true };
  }, [virtual, rows, offsets, viewport, pinned]);

  // Record the real height of everything currently rendered.
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

  return { ...window_, onRendered };
}

/** Index of the last offset at or before `position`. */
function search(offsets: Float64Array, position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] < position) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}
