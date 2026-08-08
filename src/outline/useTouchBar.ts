import { useEffect, useState } from "react";

/**
 * Where to put a bar that has to sit on top of the software keyboard.
 *
 * A phone has no Tab key, so indenting — the one thing an outline is for — is
 * otherwise unreachable. The bar only exists where that is true: a coarse
 * pointer, and a row actually being edited.
 *
 * `position: fixed` pins to the layout viewport, which the keyboard covers, so
 * the offset comes from `visualViewport` — the part of the page still visible.
 */
export function useTouchBar(): { coarse: boolean; inset: number } {
  const [coarse, setCoarse] = useState(
    () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches
  );
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!coarse || !viewport) return;
    const measure = () => {
      // Rounded, or a fractional scale leaves a hairline of page under the bar.
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [coarse]);

  return { coarse, inset };
}
