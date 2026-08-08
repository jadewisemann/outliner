import { memo, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { renderInline, renderNote, sourceOffset } from "../inline";
import type { Row as RowModel } from "../../types";
import type { Choice } from "../useOutline";
import { Editable, type FocusHint } from "./Editable";

export type DropPosition = "before" | "after" | "child";

export type RowApi = {
  setText(id: string, text: string): void;
  setNote(id: string, note: string): void;
  onTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): void;
  onNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): void;
  onPaste(event: ClipboardEvent<HTMLTextAreaElement>, row: RowModel): void;
  pickCompletion(id: string, choice: Choice): void;
  hoverCompletion(index: number): void;
  toggleCollapse(id: string): void;
  toggleDone(id: string): void;
  zoom(id: string): void;
  focusText(id: string, caret: number | "end"): void;
  focusNote(id: string): void;
  pointerSelect(event: MouseEvent, row: RowModel): void;
  clearSelection(): void;
  openTag(tag: string): void;
  openDocByTitle(title: string): void;
  openItem(id: string): void;
  resolveItem(id: string): string | null;
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
  completion: { items: Choice[]; index: number } | null;
  hideNotes: boolean;
  drop: DropPosition | null;
  api: RowApi;
};

function RowView({ row, active, selected, focusHint, noteFocusHint, completion, hideNotes, drop, api }: Props) {
  const { node } = row;
  const hasChildren = node.children.length > 0;
  const editingNote = noteFocusHint !== null;

  return (
    <div
      className={[
        "row",
        selected ? "row-selected" : "",
        active ? "row-active" : "",
        node.done ? "row-done" : "",
        node.heading > 0 ? `row-h${node.heading}` : "",
        node.quote ? "row-quote" : "",
        node.color > 0 ? `row-c${node.color}` : "",
        node.bookmarked ? "row-bookmarked" : "",
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

      {row.numbered ? <span className="row-number">{row.index + 1}.</span> : null}
      <button
        type="button"
        className={`row-bullet${node.collapsed && hasChildren ? " row-bullet-collapsed" : ""}${
          row.numbered ? " row-bullet-numbered" : ""
        }`}
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
          {row.checklist ? (
            <input
              type="checkbox"
              className="row-check"
              checked={node.done}
              tabIndex={-1}
              aria-label="완료 표시"
              onChange={() => api.toggleDone(row.id)}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : null}
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
                renderInline(node.text, {
                  onTagClick: api.openTag,
                  onDocLinkClick: api.openDocByTitle,
                  onItemLinkClick: api.openItem,
                  resolveItem: api.resolveItem,
                  showImages: true
                })
              )}
            </div>
          )}
          {node.collapsed && hasChildren ? <span className="row-count">{node.children.length}</span> : null}
        </div>

        {completion ? (
          <ul className="row-complete" role="listbox" aria-label="자동 완성">
            {completion.items.map((item, index) => (
              <li key={item.insert}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === completion.index}
                  className={index === completion.index ? "row-complete-active" : ""}
                  tabIndex={-1}
                  // Taking focus would close the keyboard and lose the caret,
                  // so the choice is made before focus can move.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    api.pickCompletion(row.id, item);
                  }}
                  onMouseEnter={() => api.hoverCompletion(index)}
                >
                  <span className="row-complete-label">{item.label}</span>
                  {item.hint ? <span className="row-complete-hint">{item.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {hideNotes || (node.note === "" && !noteFocusHint) ? null : editingNote ? (
          <Editable
            value={node.note}
            className="row-note"
            ariaLabel="메모"
            placeholder="메모"
            focusHint={noteFocusHint}
            onChange={(note) => api.setNote(row.id, note)}
            onKeyDown={(event, element) => api.onNoteKeyDown(event, element, row)}
          />
        ) : (
          // Same swap as the row itself: source while being written, rendered
          // otherwise, so a code block reads as one without an editor for it.
          <div
            className="row-note row-note-rendered"
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              api.focusNote(row.id);
            }}
          >
            {renderNote(node.note, {
              onTagClick: api.openTag,
              onDocLinkClick: api.openDocByTitle,
              onItemLinkClick: api.openItem,
              resolveItem: api.resolveItem,
              showImages: true
            })}
          </div>
        )}
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
