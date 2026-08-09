import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * A modal that behaves like one: Escape closes it, Tab stays inside it, focus
 * lands in it on open and returns where it was on close.
 *
 * Without the trap, keystrokes fall through to the outline behind the overlay
 * and quietly edit the document the user cannot see.
 */
export function Panel({
  className,
  label,
  onClose,
  children
}: {
  className: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    // The panel itself, not its first focusable: autofocusing the close button
    // put a focus ring on `×` every time a panel opened, which reads as an
    // error state. Anything that wants the caret asks for it (the search
    // input autofocuses itself).
    panel.current?.focus({ preventScroll: true });
    return () => restore?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`panel ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const stops = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
          if (stops.length === 0) return;
          const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
          if (document.activeElement !== edge) return;
          event.preventDefault();
          (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
        }}
      >
        {children}
      </div>
    </div>
  );
}
