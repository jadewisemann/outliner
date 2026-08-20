import { useEffect, type RefObject } from "react";
import type { Id } from "../types";

/** How far sideways before it is a swipe rather than a wobble. */
const THRESHOLD = 44;
/** And how far up or down before it is a scroll instead. */
const DRIFT = 26;

/**
 * Swipe a row sideways to indent or outdent it.
 *
 * The touch bar already covers this, but only while a row is being edited, and
 * reaching for a bar is slower than the gesture once the gesture is known. The
 * two answer different moments: the bar is discoverable, the swipe is fast.
 *
 * Deliberately not `preventDefault`: the browser owns vertical scrolling and
 * the caret, and taking either away to catch a gesture that has not happened
 * yet would break the common case to serve the rare one. The gesture is judged
 * only once it is unambiguous, and it fires at most once per touch.
 */
export function useSwipe(
  container: RefObject<HTMLElement>,
  onSwipe: (id: Id, direction: 1 | -1) => void,
  enabled: boolean
): void {
  useEffect(() => {
    const element = container.current;
    if (!enabled || !element) return;

    let start: { x: number; y: number; id: Id } | null = null;
    let fired = false;

    const rowIdAt = (target: EventTarget | null): Id | null =>
      (target instanceof Element ? target.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId : null) ?? null;

    const onStart = (event: TouchEvent) => {
      fired = false;
      start = null;
      if (event.touches.length !== 1) return;
      const id = rowIdAt(event.target);
      if (!id) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, id };
    };

    const onMove = (event: TouchEvent) => {
      if (!start || fired || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (Math.abs(dy) > DRIFT) {
        // Vertical: this was a scroll, and it stays one for the whole touch.
        start = null;
        return;
      }
      if (Math.abs(dx) < THRESHOLD) return;
      fired = true;
      onSwipe(start.id, dx > 0 ? 1 : -1);
    };

    const clear = () => {
      start = null;
    };

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: true });
    element.addEventListener("touchend", clear, { passive: true });
    element.addEventListener("touchcancel", clear, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", clear);
      element.removeEventListener("touchcancel", clear);
    };
  }, [container, onSwipe, enabled]);
}
