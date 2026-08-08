import type { Nudge } from "../useOutline";

type Props = {
  /** The row being edited, or null when nothing is. */
  activeId: string | null;
  nudge: Nudge;
  inset: number;
};

const BUTTONS: { label: string; title: string; run: (nudge: Nudge) => void }[] = [
  { label: "⇤", title: "내어쓰기", run: (nudge) => nudge.outdent() },
  { label: "⇥", title: "들여쓰기", run: (nudge) => nudge.indent() },
  { label: "↑", title: "위로 이동", run: (nudge) => nudge.move(-1) },
  { label: "↓", title: "아래로 이동", run: (nudge) => nudge.move(1) }
];

/**
 * The four things a phone cannot otherwise do. Everything else on the row —
 * the checkbox, the bullet, collapsing — is already a tap away, so it stays
 * off the bar and out of the way of the text.
 */
export function TouchBar({ activeId, nudge, inset }: Props) {
  if (!activeId) return null;
  return (
    <div className="touch-bar" role="toolbar" aria-label="편집 도구" style={{ bottom: inset }}>
      {BUTTONS.map((button) => (
        <button
          key={button.label}
          type="button"
          title={button.title}
          aria-label={button.title}
          tabIndex={-1}
          // Taking focus would close the keyboard and lose the caret, so the
          // press is swallowed before it can move it.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => button.run(nudge)}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
