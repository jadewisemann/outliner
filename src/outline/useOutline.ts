import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject
} from "react";
import type { Store } from "../store";
import { COLOR_ACTIONS, matches, type Action, type Keymap } from "../shared/keymap";
import { labelOf } from "../search/links";
import { MAX_ATTACHMENT_BYTES, attachmentUrl, nameFor, rememberUpload } from "../sync/api/attachments";
import { type Color, type Id, type Node, type Row as RowModel } from "../types";
import type { DropPosition, RowApi } from "./components/Row";
import type { MenuSpot } from "./components/RowMenu";
import { writeField } from "./components/Editable";
import { autoFormat, isUrl, linkTo, toggleLink, toggleWrap, type Selection, type WrapKind } from "./markdown";
import {
  appendChild,
  bulkRemove,
  duplicate,
  indent,
  insertOutlineText,
  mergeIntoPrevious,
  moveVertically,
  outdent,
  parentOf,
  patchNode,
  rowAfter,
  rowBefore,
  splitAt
} from "./tree";
import { useCompletion, type Completion } from "./useCompletion";
import { useLive } from "./useLive";
import { useRowDrag } from "./useRowDrag";
import { useRowMenu } from "./useRowMenu";
import { useRowSelection } from "./useRowSelection";
import { useVirtualRows } from "./useVirtualRows";

// Row.tsx and the palette reach these through here, from before they moved.
export type { Choice, Completion } from "./useCompletion";

/** Enough to put back a markdown prefix the editor swallowed one keystroke ago. */
type AutoUndo = { rowId: Id; prefix: string; node?: Partial<Node>; parentId?: Id; parent?: Partial<Node> };

const WRAP_ACTIONS: [Action, WrapKind][] = [
  ["bold", "bold"],
  ["italic", "italic"],
  ["code", "code"],
  ["strike", "strike"],
  ["highlight", "highlight"]
];

/**
 * Checkbox and numbering are the *list's*, so they toggle on the parent — the
 * same asymmetry the row menu and the palette already work with
 * (docs/design/editing.md). Colour is the row's own.
 */
const LIST_FLAGS: [Action, (parent: Node) => Partial<Node>][] = [
  ["checklist", (parent) => ({ checklist: !parent.checklist })],
  ["numbered", (parent) => ({ numbered: !parent.numbered })]
];



/** The edits a phone cannot reach, since it has no Tab key and no ⌘⇧↑↓. */
export type Nudge = {
  indent(): void;
  outdent(): void;
  move(direction: -1 | 1): void;
};

export type OutlineView = {
  containerRef: RefObject<HTMLDivElement>;
  nudge: Nudge;
  rows: RowModel[];
  window: { start: number; end: number; padTop: number; padBottom: number };
  activeId: Id | null;
  swipe: (id: Id, direction: 1 | -1) => void;
  selected: Set<Id>;
  focus: Store["focus"];
  noteFocus: { id: Id; seq: number } | null;
  completion: Completion | null;
  menu: MenuSpot | null;
  closeMenu(): void;
  dropSpot: { id: Id; position: DropPosition } | null;
  api: RowApi;
  containerProps: {
    onFocus(event: FocusEvent<HTMLDivElement>): void;
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
    onDragEnd(): void;
  };
  onTailMouseDown(event: MouseEvent): void;
};

/**
 * Everything the outline does — selection, keyboard, drag & drop, zoom — as
 * one hook. The component renders what comes out of here and nothing else.
 *
 * Handlers live for the lifetime of the component (a new `api` object per
 * keystroke would defeat the memo on every row), so the latest rows, doc and
 * selection are read through refs rather than baked into closures.
 */
export function useOutline(
  store: Store,
  scrollRef: RefObject<HTMLElement>,
  onTagClick: (tag: string) => void,
  onDocLinkClick: (title: string) => void,
  onItemLinkClick: (id: Id) => void,
  keymap: Keymap
): OutlineView {
  const { doc, view, rows, focus, edit, setView, requestFocus } = store;

  const [noteFocus, setNoteFocus] = useState<{ id: Id; seq: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const noteSeq = useRef(0);
  const autoUndo = useRef<AutoUndo | null>(null);

  const live = useLive({ rows, doc, workspace: store.workspace, zoomId: view.zoomId, focus });
  const drag = useRowDrag(live, edit);
  const rowMenu = useRowMenu(requestFocus);
  const keys = useRef(keymap);
  keys.current = keymap;
  const rowSelection = useRowSelection(live, edit, requestFocus, containerRef, keys);

  /* ---------------------------------------------------------------- */
  /* writing into the focused field                                    */
  /* ---------------------------------------------------------------- */

  /**
   * A formatting shortcut has to write the DOM itself: the field is
   * uncontrolled while it has focus, so waiting for the store to come back
   * round would lose the caret and fight the IME.
   */
  const applyText = useCallback(
    (element: HTMLTextAreaElement, id: Id, next: Selection, coalesceKey?: string) => {
      writeField(element, next.text, next.start, next.end);
      edit((current) => patchNode(current, id, { text: next.text }), { coalesceKey });
    },
    [edit]
  );

  const completions = useCompletion(live, applyText);

  /**
   * Pasting an image uploads it and leaves a reference behind.
   *
   * Only a backend with somewhere to put bytes can do this, and saying so is
   * better than silently dropping the paste — the picture is in the clipboard
   * either way, and the reader needs to know it did not land.
   */
  const attach = useCallback(
    async (file: File, rowId: Id) => {
      const files = store.sync.files;
      if (!files) {
        alert("첨부는 GitHub 저장소를 백엔드로 쓸 때만 됩니다. 동기화 설정에서 연결하세요.");
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        alert(`첨부는 ${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB까지입니다.`);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
      const name = await nameFor(bytes, file.type);
      try {
        await files.put(name, bytes);
      } catch {
        alert("첨부를 올리지 못했습니다.");
        return;
      }
      rememberUpload(name, file);
      const label = file.name.replace(/\.[^.]+$/, "") || "image";
      edit((current) => {
        const node = current.nodes[rowId];
        return node ? patchNode(current, rowId, { text: `${node.text}![${label}](file:${name})` }) : current;
      });
    },
    [edit, store.sync.files]
  );

  const focusNote = useCallback((id: Id) => {
    noteSeq.current += 1;
    setNoteFocus({ id, seq: noteSeq.current });
  }, []);

  /* ---------------------------------------------------------------- */
  /* zoom                                                              */
  /* ---------------------------------------------------------------- */

  const zoom = useCallback(
    (id: Id) => {
      rowSelection.clear();
      setView({ zoomId: id });
      // An empty target gets its editable row from the store's own guard.
      const first = live.current.doc.nodes[id]?.children[0];
      if (first) requestFocus(first);
    },
    [rowSelection.clear, setView, requestFocus]
  );

  const zoomOut = useCallback(() => {
    const current = live.current.zoomId;
    const now = live.current.doc;
    if (current === now.rootId) return;
    setView({ zoomId: parentOf(now, current) ?? now.rootId });
    requestFocus(current);
  }, [setView, requestFocus]);

  /* ---------------------------------------------------------------- */
  /* keyboard inside a row                                             */
  /* ---------------------------------------------------------------- */

  const onTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel) => {
      const mod = event.metaKey || event.ctrlKey;
      const caret = element.selectionStart;
      const noRange = element.selectionStart === element.selectionEnd;
      const zoomId = live.current.zoomId;
      const stop = () => event.preventDefault();
      const format = (next: Selection) => {
        stop();
        applyText(element, row.id, next);
      };

      // The completion list owns the arrows and Enter while it is open, the
      // way it does in an editor. Everything below is unreachable until it
      // closes, which is why this runs first.
      if (completions.onKeyDown(event, element, row)) return;

      // One Backspace puts back a prefix the editor swallowed. Without it the
      // only way out of an unwanted heading is to notice which key did it.
      const swallowed = autoUndo.current;
      if (event.key === "Backspace" && noRange && caret === 0 && swallowed?.rowId === row.id) {
        stop();
        autoUndo.current = null;
        const restored = swallowed.prefix + element.value;
        writeField(element, restored, swallowed.prefix.length);
        edit((current) => {
          const reverted = patchNode(current, row.id, { text: restored, ...swallowed.node });
          return swallowed.parentId && swallowed.parent
            ? patchNode(reverted, swallowed.parentId, swallowed.parent)
            : reverted;
        });
        return;
      }
      if (event.key !== "Backspace") autoUndo.current = null;

      const bound = (action: Action) => matches(event, keys.current[action]);

      for (const [action, wrap] of WRAP_ACTIONS) {
        if (!bound(action)) continue;
        format(toggleWrap(element.value, element.selectionStart, element.selectionEnd, wrap));
        return;
      }
      if (bound("link")) {
        format(toggleLink(element.value, element.selectionStart, element.selectionEnd));
        return;
      }
      if (bound("duplicate")) {
        stop();
        edit((current) => duplicate(current, row.id));
        return;
      }
      if (bound("delete")) {
        stop();
        edit((current) => bulkRemove(current, zoomId, [row.id]));
        return;
      }
      if (bound("indent") || bound("outdent")) {
        stop();
        edit((current) => (bound("outdent") ? outdent(current, row.id, zoomId) : indent(current, row.id)));
        return;
      }

      // The display flags the palette already reached. Without these the
      // keyboard cannot colour a row at all, which is a hole regardless of
      // which preset is loaded.
      for (const [action, patch] of LIST_FLAGS) {
        if (!bound(action)) continue;
        stop();
        const parentId = live.current.doc.nodes[row.id]?.parent;
        if (!parentId) return;
        edit((current) => {
          const parent = current.nodes[parentId];
          return parent ? patchNode(current, parentId, patch(parent)) : current;
        });
        return;
      }
      for (const [action, color] of COLOR_ACTIONS) {
        if (!bound(action)) continue;
        stop();
        edit((current) => patchNode(current, row.id, { color }));
        return;
      }

      // Markdown as you type. Fires on the space that completes the prefix,
      // and the space itself is never inserted — it was punctuation, not text.
      if (event.key === " " && noRange) {
        const applied = autoFormat(element.value, caret);
        if (applied) {
          stop();
          const node = live.current.doc.nodes[row.id];
          const parentId = applied.parent ? node?.parent ?? undefined : undefined;
          autoUndo.current = {
            rowId: row.id,
            prefix: applied.prefix,
            // Whatever the rule is about to overwrite, not a fixed field: a
            // prefix can set a heading, a quote, or a flag on the parent.
            node: applied.node ? pick(node, applied.node) : undefined,
            parentId,
            parent: parentId ? pick(live.current.doc.nodes[parentId], applied.parent!) : undefined
          };
          writeField(element, applied.text, 0);
          edit((current) => {
            const patched = patchNode(current, row.id, { text: applied.text, ...applied.node });
            return parentId ? patchNode(patched, parentId, applied.parent!) : patched;
          });
          completions.clear();
          return;
        }
      }

      if (bound("zoomIn")) {
        stop();
        zoom(row.id);
        return;
      }
      if (bound("zoomOut")) {
        stop();
        zoomOut();
        return;
      }
      if (bound("collapse")) {
        stop();
        edit((current) => patchNode(current, row.id, { collapsed: !row.node.collapsed }), { transient: true });
        return;
      }
      if (bound("moveUp") || bound("moveDown")) {
        stop();
        edit((current) => moveVertically(current, row.id, bound("moveUp") ? -1 : 1, zoomId));
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        stop();
        focusNote(row.id);
        return;
      }
      if (bound("done")) {
        stop();
        edit((current) => patchNode(current, row.id, { done: !row.node.done }));
        return;
      }
      if (event.key === "Enter") {
        stop();
        edit((current) => splitAt(current, row.id, caret));
        return;
      }
      if (event.key === "Tab") {
        stop();
        edit((current) => (event.shiftKey ? outdent(current, row.id, zoomId) : indent(current, row.id)));
        return;
      }
      if (event.key === "Backspace" && noRange && caret === 0) {
        stop();
        edit((current) => mergeIntoPrevious(current, zoomId, row.id));
        return;
      }
      if (event.key === "Delete" && noRange && caret === element.value.length) {
        const next = rowAfter(live.current.rows, row.id);
        if (!next) return;
        stop();
        edit((current) => mergeIntoPrevious(current, zoomId, next.id));
        return;
      }
      if (event.key === "ArrowUp" || (event.key === "ArrowLeft" && noRange && caret === 0)) {
        const previous = rowBefore(live.current.rows, row.id);
        if (!previous) return;
        stop();
        requestFocus(previous.id, event.key === "ArrowUp" ? Math.min(caret, previous.node.text.length) : "end");
        return;
      }
      if (event.key === "ArrowDown" || (event.key === "ArrowRight" && noRange && caret === element.value.length)) {
        const next = rowAfter(live.current.rows, row.id);
        if (!next) return;
        stop();
        requestFocus(next.id, event.key === "ArrowDown" ? Math.min(caret, next.node.text.length) : 0);
        return;
      }
      // ⌘A climbs out of the text once the text is already all held, and hands
      // the ladder to `useRowSelection`: this row, then the list it sits in,
      // then the list that one sits in. An empty row has nothing to hold, so
      // the first press leaves it straight away.
      if (mod && event.key === "a" && element.selectionStart === 0 && element.selectionEnd === element.value.length) {
        stop();
        element.blur();
        rowSelection.select(row.id);
        return;
      }
      if (event.key === "Escape") {
        stop();
        element.blur();
        rowSelection.select(row.id);
      }
    },
    [edit, requestFocus, focusNote, rowSelection.select, zoom, zoomOut, completions.onKeyDown, completions.clear]
  );

  const onNoteKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel) => {
      const atStart = element.selectionStart === 0 && element.selectionEnd === 0;
      const leaving =
        event.key === "Escape" ||
        (event.key === "ArrowUp" && atStart) ||
        (event.key === "Backspace" && atStart && element.value === "");
      if (!leaving) return;
      event.preventDefault();
      setNoteFocus(null);
      requestFocus(row.id);
    },
    [requestFocus]
  );

  /* ---------------------------------------------------------------- */
  /* the same edits, without a keyboard                                */
  /* ---------------------------------------------------------------- */

  /** The same two edits a swipe asks for, on a row named by the gesture. */
  const swipe = useCallback(
    (id: Id, direction: 1 | -1) => {
      edit((current) => (direction === 1 ? indent(current, id) : outdent(current, id, live.current.zoomId)));
    },
    [edit]
  );

  // Whichever row is being edited, read at press time — the bar is rendered
  // once and must not close over a row that has since changed.
  const nudge = useMemo<Nudge>(() => {
    const target = () => live.current.focus?.id ?? null;
    return {
      indent() {
        const id = target();
        if (id) edit((current) => indent(current, id));
      },
      outdent() {
        const id = target();
        if (id) edit((current) => outdent(current, id, live.current.zoomId));
      },
      move(direction) {
        const id = target();
        if (id) edit((current) => moveVertically(current, id, direction, live.current.zoomId));
      }
    };
  }, [edit]);

  /* ---------------------------------------------------------------- */
  /* the api handed to every row                                       */
  /* ---------------------------------------------------------------- */

  const api = useMemo<RowApi>(
    () => ({
      setText(id, text) {
        edit((current) => patchNode(current, id, { text }), { coalesceKey: `text:${id}` });
        completions.refresh(id);
      },
      setNote(id, note) {
        edit((current) => patchNode(current, id, { note }), { coalesceKey: `note:${id}` });
      },
      onTextKeyDown,
      onNoteKeyDown,
      onPaste(event, row) {
        const file = [...event.clipboardData.files].find((each) => each.type.startsWith("image/"));
        if (file) {
          event.preventDefault();
          void attach(file, row.id);
          return;
        }
        const text = event.clipboardData.getData("text/plain");
        const element = event.currentTarget;
        // A url dropped onto selected text links it instead of replacing it.
        if (isUrl(text) && element.selectionStart !== element.selectionEnd) {
          event.preventDefault();
          applyText(element, row.id, linkTo(element.value, element.selectionStart, element.selectionEnd, text.trim()));
          return;
        }
        if (!text.includes("\n")) return;
        event.preventDefault();
        edit((current) => insertOutlineText(current, row.id, text));
      },
      toggleCollapse(id) {
        edit((current) => patchNode(current, id, { collapsed: !current.nodes[id]?.collapsed }), { transient: true });
      },
      toggleDone(id) {
        edit((current) => patchNode(current, id, { done: !current.nodes[id]?.done }));
      },
      zoom,
      focusText(id, caret) {
        setNoteFocus(null);
        completions.clear();
        requestFocus(id, caret);
      },
      focusNote,
      setColor(id, color: Color) {
        edit((current) => patchNode(current, id, { color }));
      },
      toggleQuote(id) {
        edit((current) => patchNode(current, id, { quote: !current.nodes[id]?.quote }));
      },
      // The flag belongs to the list, so these two act on the row's parent.
      toggleChecklist(id) {
        const parentId = live.current.doc.nodes[id]?.parent;
        if (parentId) edit((current) => patchNode(current, parentId, { checklist: !current.nodes[parentId]?.checklist }));
      },
      toggleNumbered(id) {
        const parentId = live.current.doc.nodes[id]?.parent;
        if (parentId) edit((current) => patchNode(current, parentId, { numbered: !current.nodes[parentId]?.numbered }));
      },
      toggleRowBookmark(id) {
        edit((current) => patchNode(current, id, { bookmarked: !current.nodes[id]?.bookmarked }));
      },
      copyItemLink(id) {
        void navigator.clipboard?.writeText(`((${id}))`);
      },
      duplicateRow(id) {
        edit((current) => duplicate(current, id));
      },
      removeRow(id) {
        edit((current) => bulkRemove(current, live.current.zoomId, [id]));
      },
      openTag: onTagClick,
      openDocByTitle: onDocLinkClick,
      openItem: onItemLinkClick,
      resolveItem: (id) => labelOf(live.current.workspace, id),
      resolveFile: (name) => attachmentUrl(store.sync.files, name),
      ...completions.api,
      ...rowSelection.api,
      ...rowMenu.api,
      ...drag.api
    }),
    [
      edit,
      onTextKeyDown,
      onNoteKeyDown,
      zoom,
      requestFocus,
      onTagClick,
      onDocLinkClick,
      onItemLinkClick,
      focusNote,
      applyText,
      attach,
      store.sync.files,
      completions.refresh,
      completions.clear,
      completions.api,
      rowSelection.api,
      rowMenu.api,
      drag.api
    ]
  );

  /* ---------------------------------------------------------------- */

  const pin = rowSelection.selection.length > 0 ? null : focus;
  const activeId = pin?.id ?? null;
  const window = useVirtualRows(rows, scrollRef, containerRef, pin);

  return {
    containerRef,
    nudge,
    rows,
    window,
    activeId,
    swipe,
    selected: rowSelection.selected,
    focus,
    noteFocus,
    completion: completions.completion,
    menu: rowMenu.menu,
    closeMenu: rowMenu.closeMenu,
    dropSpot: drag.dropSpot,
    api,
    containerProps: {
      onFocus(event) {
        // Focusing the container with nothing selected puts the caret back
        // where the reader left off.
        if (event.target !== event.currentTarget || rowSelection.selection.length > 0) return;
        const landing = live.current.rows.find((row) => row.id === view.focusId) ?? live.current.rows[0];
        if (landing) requestFocus(landing.id);
      },
      onKeyDown: rowSelection.onKeyDown,
      onDragEnd: drag.onDragEnd
    },
    onTailMouseDown(event) {
      event.preventDefault();
      rowSelection.clear();
      edit((current) => appendChild(current, live.current.zoomId));
    }
  };
}

/** The values a patch is about to overwrite, so one Backspace can put them back. */
function pick(node: Node | undefined, patch: Partial<Node>): Partial<Node> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) out[key] = node?.[key as keyof Node];
  return out as Partial<Node>;
}
