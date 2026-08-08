import { memo, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { renderInline, sourceOffset } from "../inline";
import type { Row as RowModel } from "../../types";
import { Editable, type FocusHint } from "./Editable";

export type DropPosition = "before" | "after" | "child";

export type RowApi = {
  setText(id: string, text: string): void;
  setNote(id: string, note: string): void;
  onTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): void;
  onNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): void;
  onPaste(event: ClipboardEvent<HTMLTextAreaElement>, row: RowModel): void;
  toggleCollapse(id: string): void;
  toggleDone(id: string): void;
  zoom(id: string): void;
  focusText(id: string, caret: number | "end"): void;
  pointerSelect(event: MouseEvent, row: RowModel): void;
  clearSelection(): void;
  openTag(tag: string): void;
  openDocByTitle(title: string): void;
  dragStart(event: DragEvent, id: string): void;
  dragOver(event: DragEvent, row: RowModel): void;
  drop(event: DragEvent): void;
};

type Props = {
  row: RowModel;
  active: boolean;
  selected: boolean;
  focusHint: FocusHint;
  noteFocusHint: FocusHint;
  drop: DropPosition | null;
  api: RowApi;
};

function RowView({ row, active, selected, focusHint, noteFocusHint, drop, api }: Props) {
  const { node } = row;
  const hasChildren = node.children.length > 0;

  return (
    <div
      className={[
        "row",
        selected ? "row-selected" : "",
        active ? "row-active" : "",
        node.done ? "row-done" : "",
        node.heading > 0 ? `row-h${node.heading}` : "",
        drop ? `row-drop-${drop}` : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--depth": row.depth } as React.CSSProperties}
      data-node-id={row.id}
      onMouseDown={(event) => api.pointerSelect(event, row)}
      onDragOver={(event) => api.dragOver(event, row)}
      onDrop={api.drop}
    >
      <button
        type="button"
        className={`row-arrow${hasChildren ? "" : " row-arrow-empty"}${node.collapsed ? " row-arrow-collapsed" : ""}`}
        aria-label={node.collapsed ? "펼치기" : "접기"}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          if (hasChildren) api.toggleCollapse(row.id);
        }}
      >
        ▸
      </button>

      <button
        type="button"
        className={`row-bullet${node.collapsed && hasChildren ? " row-bullet-collapsed" : ""}`}
        aria-label={`${node.text || "빈 항목"} 확대`}
        tabIndex={-1}
        draggable
        onDragStart={(event) => api.dragStart(event, row.id)}
        onClick={(event) => {
          event.stopPropagation();
          api.zoom(row.id);
        }}
      />

      <div className="row-body">
        <div className="row-line">
          <input
            type="checkbox"
            className="row-check"
            checked={node.done}
            tabIndex={-1}
            aria-label="완료 표시"
            onChange={() => api.toggleDone(row.id)}
            onMouseDown={(event) => event.stopPropagation()}
          />
          {active ? (
            <Editable
              value={node.text}
              className="row-text row-input"
              ariaLabel="항목 텍스트"
              placeholder={row.depth === 0 && row.index === 0 ? "입력을 시작하세요" : ""}
              focusHint={focusHint}
              onChange={(text) => api.setText(row.id, text)}
              onKeyDown={(event, element) => api.onTextKeyDown(event, element, row)}
              onPaste={(event) => api.onPaste(event, row)}
            />
          ) : (
            <div
              className="row-text row-rendered"
              onMouseDown={(event) => {
                if (event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                api.clearSelection();
                api.focusText(row.id, caretFromPoint(event, node.text));
              }}
            >
              {node.text === "" ? (
                <span className="row-empty">&nbsp;</span>
              ) : (
                renderInline(node.text, { onTagClick: api.openTag, onDocLinkClick: api.openDocByTitle })
              )}
            </div>
          )}
          {node.collapsed && hasChildren ? <span className="row-count">{node.children.length}</span> : null}
        </div>

        {node.note !== "" || noteFocusHint ? (
          <Editable
            value={node.note}
            className="row-note"
            ariaLabel="메모"
            placeholder="메모"
            focusHint={noteFocusHint}
            onChange={(note) => api.setNote(row.id, note)}
            onKeyDown={(event, element) => api.onNoteKeyDown(event, element, row)}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Best-effort caret placement from a click on rendered (formatted) text. */
function caretFromPoint(event: MouseEvent, text: string): number | "end" {
  const target = event.target as HTMLElement;
  const range =
    typeof document.caretRangeFromPoint === "function"
      ? document.caretRangeFromPoint(event.clientX, event.clientY)
      : null;
  if (!range || !target) return "end";
  const container = target.closest(".row-rendered");
  if (!container) return "end";

  // Count the rendered characters that precede the click.
  let before = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current === range.startContainer) return sourceOffset(text, before + range.startOffset);
    before += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return "end";
}

export const Row = memo(RowView);
