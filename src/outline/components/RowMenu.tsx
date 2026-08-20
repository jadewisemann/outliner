import { useEffect, useRef } from "react";
import type { Color, Row as RowModel } from "../../types";
import type { RowApi } from "./Row";

export type MenuSpot = { row: RowModel; x: number; y: number };

const COLORS: [Color, string][] = [
  [1, "#c1543c"],
  [2, "#c08a2e"],
  [3, "#4f8f3f"],
  [4, "#2f7fa8"],
  [5, "#7a5bb5"],
  [6, "#8a8a84"]
];

/**
 * Right-click on a bullet.
 *
 * Everything here is also a palette command — this is the pointer's way in,
 * not a second set of features. It exists because colour and list style are
 * the two things people reach for while their hand is already on the mouse.
 */
export function RowMenu({ spot, api, onClose, onMove }: {
  spot: MenuSpot;
  api: RowApi;
  onClose: () => void;
  onMove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { row } = spot;
  const { node } = row;

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Capture, so a click that lands on a row does not also edit it.
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const act = (run: () => void) => () => {
    run();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="row-menu"
      role="menu"
      // Offset below the pointer so the menu does not cover the row it is
      // about to act on, and clamped so it stays on screen.
      style={{ left: Math.min(spot.x, window.innerWidth - 190), top: Math.min(spot.y + 8, window.innerHeight - 312) }}
    >
      <div className="row-menu-colors">
        {COLORS.map(([color, swatch]) => (
          <button
            key={color}
            type="button"
            aria-label={`색 ${color}`}
            className={node.color === color ? "row-menu-color row-menu-color-on" : "row-menu-color"}
            style={{ background: swatch }}
            onClick={act(() => api.setColor(row.id, color))}
          />
        ))}
        <button
          type="button"
          aria-label="색 지우기"
          className="row-menu-color row-menu-color-none"
          onClick={act(() => api.setColor(row.id, 0))}
        >
          ×
        </button>
      </div>

      <button type="button" role="menuitem" onClick={act(() => api.toggleQuote(row.id))}>
        {node.quote ? "인용 해제" : "인용으로"}
      </button>
      <button type="button" role="menuitem" onClick={act(() => api.toggleChecklist(row.id))}>
        {row.checklist ? "체크리스트 끄기" : "체크리스트로"}
      </button>
      <button type="button" role="menuitem" onClick={act(() => api.toggleNumbered(row.id))}>
        {row.numbered ? "번호 목록 끄기" : "번호 목록으로"}
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={act(() => api.toggleRowBookmark(row.id))}>
        {node.bookmarked ? "즐겨찾기 해제" : "즐겨찾기"}
      </button>
      <button type="button" role="menuitem" onClick={act(() => api.copyItemLink(row.id))}>
        항목 링크 복사
      </button>
      <button type="button" role="menuitem" onClick={act(onMove)}>
        다른 문서로 이동…
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={act(() => api.duplicateRow(row.id))}>
        복제
      </button>
      <button type="button" role="menuitem" className="row-menu-danger" onClick={act(() => api.removeRow(row.id))}>
        삭제
      </button>
    </div>
  );
}
