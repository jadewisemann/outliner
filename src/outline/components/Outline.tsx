import type { RefObject } from "react";
import type { Store } from "../../store";
import { useOutline } from "../useOutline";
import { useTouchBar } from "../useTouchBar";
import { Row } from "./Row";
import { TouchBar } from "./TouchBar";

type Props = {
  store: Store;
  /** The scrolling element the row window is measured against. */
  scrollRef: RefObject<HTMLElement>;
  onTagClick: (tag: string) => void;
  onDocLinkClick: (title: string) => void;
};

/** Pure rendering; every behaviour lives in `useOutline`. */
export function Outline({ store, scrollRef, onTagClick, onDocLinkClick }: Props) {
  const outline = useOutline(store, scrollRef, onTagClick, onDocLinkClick);
  const { rows, window, focus, noteFocus, completion, dropSpot } = outline;
  const touch = useTouchBar();

  return (
    <div
      className="outline"
      ref={outline.containerRef}
      role="tree"
      aria-label="아웃라인"
      tabIndex={0}
      {...outline.containerProps}
    >
      {window.padTop > 0 ? <div style={{ height: window.padTop }} /> : null}
      {rows.slice(window.start, window.end).map((row) => (
        <Row
          key={row.id}
          row={row}
          active={row.id === outline.activeId}
          selected={outline.selected.has(row.id)}
          focusHint={row.id === focus?.id ? { caret: focus.caret, seq: focus.seq } : null}
          noteFocusHint={row.id === noteFocus?.id ? { caret: "end", seq: noteFocus.seq } : null}
          completion={completion?.rowId === row.id ? completion : null}
          hideNotes={store.view.hideNotes}
          drop={dropSpot?.id === row.id ? dropSpot.position : null}
          api={outline.api}
        />
      ))}
      {window.padBottom > 0 ? <div style={{ height: window.padBottom }} /> : null}
      <div className="outline-tail" onMouseDown={outline.onTailMouseDown} />
      {touch.coarse ? <TouchBar activeId={outline.activeId} nudge={outline.nudge} inset={touch.inset} /> : null}
    </div>
  );
}
