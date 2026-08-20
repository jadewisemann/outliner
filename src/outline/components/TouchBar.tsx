import type { ReactNode } from "react";
import type { Nudge } from "../useOutline";

type Props = {
  /** The row being edited, or null when nothing is. */
  activeId: string | null;
  nudge: Nudge;
  inset: number;
};

/** Drawn inline so the bar stays dependency-free; sized to read at 40px keys. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const BUTTONS: { icon: ReactNode; title: string; run: (nudge: Nudge) => void }[] = [
  {
    title: "내어쓰기",
    icon: (
      <Icon>
        <path d="M4.5 5v10" />
        <path d="M16 10H8" />
        <path d="M11.5 6.5 8 10l3.5 3.5" />
      </Icon>
    ),
    run: (nudge) => nudge.outdent()
  },
  {
    title: "들여쓰기",
    icon: (
      <Icon>
        <path d="M15.5 5v10" />
        <path d="M4 10h8" />
        <path d="M8.5 6.5 12 10l-3.5 3.5" />
      </Icon>
    ),
    run: (nudge) => nudge.indent()
  },
  {
    title: "위로 이동",
    icon: (
      <Icon>
        <path d="M10 15.5V5" />
        <path d="M5.5 9.5 10 5l4.5 4.5" />
      </Icon>
    ),
    run: (nudge) => nudge.move(-1)
  },
  {
    title: "아래로 이동",
    icon: (
      <Icon>
        <path d="M10 4.5V15" />
        <path d="M5.5 10.5 10 15l4.5-4.5" />
      </Icon>
    ),
    run: (nudge) => nudge.move(1)
  }
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
          key={button.title}
          type="button"
          title={button.title}
          aria-label={button.title}
          tabIndex={-1}
          // Taking focus would close the keyboard and lose the caret, so the
          // press is swallowed before it can move it.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => button.run(nudge)}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
}
