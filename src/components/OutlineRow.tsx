import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  COPY_COMMAND,
  type EditorState
} from "lexical";
import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { OutlineNode } from "../domain/outlineTypes";
import type { CursorTextEdit } from "../domain/multiCursor";
import { extractTags } from "../domain/searchSelectors";
import { renderInlineMarkdown, renderMarkdownLikeText } from "../domain/richText";
import { matchesKeyBinding, type PreferenceSettings } from "../app/preferences";

type OutlineRowProps = {
  node: OutlineNode;
  depth: number;
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  hasCursor: boolean;
  hasBulkSelection: boolean;
  hasMultiCursor: boolean;
  spellcheck: boolean;
  autoFocus: boolean;
  showNotes: boolean;
  noteEditing: boolean;
  focusOffset?: number;
  focusRequestKey?: number;
  keymap: PreferenceSettings["keymap"];
  onSelect: () => void;
  onSelectTag: (tag: string) => void;
  onTextChange: (text: string) => void;
  onNoteChange: (note: string) => void;
  onCreateAfter: (offset?: number) => void;
  onCreateSibling: () => void;
  onPasteText: (offset: number, text: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelectionWithOffset: (direction: "previous" | "next", offset: number) => void;
  onCursorHorizontalChange: (offset: number) => void;
  onMoveNode: (direction: "previous" | "next") => void;
  onExtendSelection: (direction: "previous" | "next") => void;
  onAddCursor: (direction: "previous" | "next", offset: number) => void;
  onApplyTextToCursors: (edit: CursorTextEdit) => void;
  onClearPowerSelection: () => void;
  onToggleCollapse: () => void;
  onCopySelection: () => string | undefined;
  onZoom: () => void;
  onFocusNote: () => void;
  onFocusText: () => void;
  onRender?: (nodeId: string) => void;
};

function OutlineRowComponent(props: OutlineRowProps) {
  const {
    node,
    depth,
    active,
    selected,
    highlighted,
    hasCursor,
    noteEditing,
    onSelect,
    onToggleCollapse,
    onZoom
  } = props;
  props.onRender?.(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={`outline-row ${active ? "outline-row-active" : ""} ${selected ? "outline-row-selected" : ""} ${
        highlighted ? "outline-row-highlighted" : ""
      } ${node.heading ? `outline-row-heading-${node.heading}` : ""} ${hasCursor ? "outline-row-cursor" : ""}`}
      data-node-id={node.id}
      data-node-text={node.text}
      style={{ "--depth": depth, "--node-color": node.color ?? "inherit" } as CSSProperties}
    >
      <button
        className="collapse-button"
        type="button"
        aria-label={node.collapsed ? "Expand node" : "Collapse node"}
        disabled={!hasChildren}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapse();
        }}
      >
        {hasChildren ? (node.collapsed ? ">" : "v") : ""}
      </button>
      <button
        className="bullet-button"
        type="button"
        aria-label="Zoom into node"
        onClick={(event) => {
          event.stopPropagation();
          onZoom();
        }}
      />
      <div className="row-editor" onClick={onSelect}>
        {active ? (
          <>
            <ActiveRowEditor {...props} />
            {noteEditing ? (
              <div className="node-note-row">
                <SharedTextEditor
                  editorKey={`note-${node.id}`}
                  text={node.note ?? ""}
                  className="node-note-editor"
                  aria-label="Node note"
                  spellCheck={props.spellcheck}
                  placeholder="Note"
                  autoFocus
                  onTextChange={props.onNoteChange}
                >
                  <NoteKeyboardPlugin
                    keymap={props.keymap}
                    onFocusText={props.onFocusText}
                    onMoveSelectionWithOffset={props.onMoveSelectionWithOffset}
                  />
                </SharedTextEditor>
              </div>
            ) : null}
            {!noteEditing && props.showNotes && node.note ? <NotePreview note={node.note} /> : null}
          </>
        ) : (
          <PlainRowText node={node} showNotes={props.showNotes} onSelectTag={props.onSelectTag} />
        )}
      </div>
    </div>
  );
}

export const OutlineRow = memo(OutlineRowComponent, (previous, next) => {
  return (
    previous.node === next.node &&
    previous.depth === next.depth &&
    previous.active === next.active &&
    previous.selected === next.selected &&
    previous.highlighted === next.highlighted &&
    previous.hasCursor === next.hasCursor &&
    previous.hasBulkSelection === next.hasBulkSelection &&
    previous.hasMultiCursor === next.hasMultiCursor &&
    previous.spellcheck === next.spellcheck &&
    previous.autoFocus === next.autoFocus &&
    previous.showNotes === next.showNotes &&
    previous.noteEditing === next.noteEditing
  );
});

function PlainRowText({
  node,
  showNotes,
  onSelectTag
}: {
  node: OutlineNode;
  showNotes: boolean;
  onSelectTag: (tag: string) => void;
}) {
  const { text } = node;
  const tags = extractTags(text);
  if (tags.length === 0) {
    return <RichRowText node={node} content={renderMarkdownLikeText(text)} showNotes={showNotes} />;
  }
  const parts: JSX.Element[] = [];
  let cursor = 0;
  for (const tag of tags) {
    if (tag.start > cursor) {
      parts.push(<span key={`text-${cursor}`}>{renderInlineMarkdown(text.slice(cursor, tag.start))}</span>);
    }
    parts.push(
      <button
        key={`${tag.source}-${tag.start}`}
        className="inline-tag"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelectTag(tag.source);
        }}
      >
        {tag.source}
      </button>
    );
    cursor = tag.end;
  }
  if (cursor < text.length) {
    parts.push(<span key={`text-${cursor}`}>{renderInlineMarkdown(text.slice(cursor))}</span>);
  }
  return <RichRowText node={node} content={parts.length > 0 ? parts : "\u00a0"} showNotes={showNotes} />;
}

function RichRowText({ node, content, showNotes }: { node: OutlineNode; content: ReactNode; showNotes: boolean }) {
  return (
    <span className="plain-row-text">
      <span>{content}</span>
      {showNotes && node.note ? <NotePreview note={node.note} /> : null}
    </span>
  );
}

function NotePreview({ note }: { note: string }) {
  return (
    <span className="node-note-row node-note-preview">
      <span className="node-note">{renderMarkdownLikeText(note)}</span>
    </span>
  );
}

function ActiveRowEditor({
  node,
  onTextChange,
  onCreateAfter,
  onCreateSibling,
  onPasteText,
  onIndent,
  onOutdent,
  onRemoveEmpty,
  onMoveSelectionWithOffset,
  onCursorHorizontalChange,
  onMoveNode,
  onExtendSelection,
  onAddCursor,
  onApplyTextToCursors,
  onClearPowerSelection,
  onCopySelection,
  onFocusNote,
  keymap,
  hasBulkSelection,
  hasMultiCursor,
  spellcheck,
  autoFocus,
  noteEditing,
  focusOffset,
  focusRequestKey
}: OutlineRowProps) {
  return (
    <SharedTextEditor
      editorKey={`row-${node.id}`}
      text={toEditorText(node)}
      className="lexical-editor"
      aria-label="Outline node text"
      spellCheck={spellcheck}
      placeholder="Type"
      autoFocus={autoFocus && !noteEditing}
      focusOffset={focusOffset}
      focusRequestKey={focusRequestKey}
      onTextChange={onTextChange}
    >
      <KeyboardPlugin
        nodeText={node.text}
        editorText={toEditorText(node)}
        onCreateAfter={onCreateAfter}
        onCreateSibling={onCreateSibling}
        onIndent={onIndent}
        onOutdent={onOutdent}
        onRemoveEmpty={onRemoveEmpty}
        onMoveSelectionWithOffset={onMoveSelectionWithOffset}
        onCursorHorizontalChange={onCursorHorizontalChange}
        onMoveNode={onMoveNode}
        onExtendSelection={onExtendSelection}
        onAddCursor={onAddCursor}
        onApplyTextToCursors={onApplyTextToCursors}
        onClearPowerSelection={onClearPowerSelection}
        onPasteText={onPasteText}
        onCopySelection={onCopySelection}
        onFocusNote={onFocusNote}
        keymap={keymap}
        hasBulkSelection={hasBulkSelection}
        hasMultiCursor={hasMultiCursor}
      />
    </SharedTextEditor>
  );
}

function SharedTextEditor({
  editorKey,
  text,
  className,
  "aria-label": ariaLabel,
  spellCheck,
  placeholder,
  autoFocus,
  focusOffset,
  focusRequestKey,
  onTextChange,
  children
}: {
  editorKey: string;
  text: string;
  className: string;
  "aria-label": string;
  spellCheck: boolean;
  placeholder: string;
  autoFocus?: boolean;
  focusOffset?: number;
  focusRequestKey?: number;
  onTextChange: (text: string) => void;
  children?: ReactNode;
}) {
  const skipInitialChangeRef = useRef(true);
  const composingRef = useRef(false);
  const lastCompositionTextRef = useRef("");
  const initialConfig = {
    namespace: `outline-${editorKey}`,
    onError(error: Error) {
      throw error;
    },
    editorState: () => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(text));
      root.append(paragraph);
    },
    theme: {
      paragraph: "lexical-paragraph"
    }
  };

  return (
    <LexicalComposer key={editorKey} initialConfig={initialConfig}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            className={className}
            aria-label={ariaLabel}
            spellCheck={spellCheck}
            tabIndex={0}
            onClick={(event) => event.stopPropagation()}
            onCompositionStart={() => {
              composingRef.current = true;
              lastCompositionTextRef.current = "";
            }}
            onCompositionUpdate={(event) => {
              lastCompositionTextRef.current = (event.nativeEvent as CompositionEvent).data;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              const finalCompositionText = (event.nativeEvent as CompositionEvent).data;
              const previousCompositionText = lastCompositionTextRef.current;
              const currentText = event.currentTarget.textContent || "";
              const nextText =
                finalCompositionText && previousCompositionText && currentText.endsWith(previousCompositionText)
                  ? `${currentText.slice(0, -previousCompositionText.length)}${finalCompositionText}`
                  : currentText || finalCompositionText || "";
              lastCompositionTextRef.current = "";
              if (nextText !== text) {
                onTextChange(nextText);
              }
            }}
          />
        }
        placeholder={<span className="editor-placeholder">{placeholder}</span>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <SyncInitialTextPlugin text={text} />
      <OnChangePlugin
        onChange={(editorState: EditorState) => {
          editorState.read(() => {
            const nextText = $getRoot().getTextContent();
            if (skipInitialChangeRef.current) {
              skipInitialChangeRef.current = false;
              return;
            }
            if (composingRef.current) {
              return;
            }
            onTextChange(nextText);
          });
        }}
      />
      {children}
      {autoFocus ? <FocusPlugin offset={focusOffset} requestKey={focusRequestKey} /> : null}
    </LexicalComposer>
  );
}

function SyncInitialTextPlugin({ text }: { text: string }) {
  const [editor] = useLexicalComposerContext();
  useLayoutEffect(() => {
    editor.update(() => {
      if ($getRoot().getTextContent() === text) {
        return;
      }
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(text));
      root.append(paragraph);
    });
  }, [editor, text]);
  return null;
}

function KeyboardPlugin({
  nodeText,
  editorText,
  onCreateAfter,
  onCreateSibling,
  onIndent,
  onOutdent,
  onRemoveEmpty,
  onMoveSelectionWithOffset,
  onCursorHorizontalChange,
  onMoveNode,
  onExtendSelection,
  onAddCursor,
  onApplyTextToCursors,
  onClearPowerSelection,
  onPasteText,
  onCopySelection,
  onFocusNote,
  keymap,
  hasBulkSelection,
  hasMultiCursor
}: {
  nodeText: string;
  editorText: string;
  onCreateAfter: (offset?: number) => void;
  onCreateSibling: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelectionWithOffset: (direction: "previous" | "next", offset: number) => void;
  onCursorHorizontalChange: (offset: number) => void;
  onMoveNode: (direction: "previous" | "next") => void;
  onExtendSelection: (direction: "previous" | "next") => void;
  onAddCursor: (direction: "previous" | "next", offset: number) => void;
  onApplyTextToCursors: (edit: CursorTextEdit) => void;
  onClearPowerSelection: () => void;
  onPasteText: (offset: number, text: string) => void;
  onCopySelection: () => string | undefined;
  onFocusNote: () => void;
  keymap: PreferenceSettings["keymap"];
  hasBulkSelection: boolean;
  hasMultiCursor: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const readOffset = () => {
      let offset = editorText.length;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          offset = selection.anchor.offset;
        }
      });
      return offset;
    };
    const unregisterEnter = editor.registerCommand<KeyboardEvent>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (isComposingEvent(event)) {
          return false;
        }
        if (event && matchesKeyBinding(event, keymap.focusNodeNote)) {
          event.preventDefault();
          onFocusNote();
          return true;
        }
        if (event && matchesKeyBinding(event, keymap.createSiblingNode)) {
          event.preventDefault();
          onCreateSibling();
          return true;
        }
        event?.preventDefault();
        onCreateAfter(readOffset());
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterTab = editor.registerCommand<KeyboardEvent>(
      KEY_TAB_COMMAND,
      (event) => {
        event?.preventDefault();
        if (event?.shiftKey) {
          onOutdent();
        } else {
          onIndent();
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterBackspace = editor.registerCommand<KeyboardEvent>(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (isComposingEvent(event)) {
          return false;
        }
        if (hasMultiCursor) {
          event?.preventDefault();
          onApplyTextToCursors({ type: "backspace" });
          return true;
        }
        if (hasBulkSelection || nodeText.length === 0) {
          onRemoveEmpty();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterDelete = editor.registerCommand<KeyboardEvent>(
      KEY_DELETE_COMMAND,
      (event) => {
        if (isComposingEvent(event)) {
          return false;
        }
        if (hasMultiCursor) {
          event?.preventDefault();
          onApplyTextToCursors({ type: "delete" });
          return true;
        }
        if (hasBulkSelection) {
          onRemoveEmpty();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterUp = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (event?.shiftKey) {
          event.preventDefault();
          onExtendSelection("previous");
          return true;
        }
        event?.preventDefault();
        onMoveSelectionWithOffset("previous", readOffset());
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterDown = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (event?.shiftKey) {
          event.preventDefault();
          onExtendSelection("next");
          return true;
        }
        event?.preventDefault();
        onMoveSelectionWithOffset("next", readOffset());
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterPaste = editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text.includes("\n")) {
          return false;
        }
        event.preventDefault();
        onPasteText(readOffset(), text);
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterCopy = editor.registerCommand<ClipboardEvent>(
      COPY_COMMAND,
      (event) => {
        const text = onCopySelection();
        if (!text) {
          return false;
        }
        event.preventDefault();
        event.clipboardData?.setData("text/plain", text);
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
    const handleRootKeyDown = (event: KeyboardEvent) => {
      if (isComposingEvent(event)) {
        return;
      }
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (event.metaKey || event.ctrlKey) {
          onAddCursor("previous", readOffset());
        } else {
          onMoveNode("previous");
        }
        return;
      }
      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (event.metaKey || event.ctrlKey) {
          onAddCursor("next", readOffset());
        } else {
          onMoveNode("next");
        }
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          onOutdent();
        } else {
          onIndent();
        }
        return;
      }
      if (matchesKeyBinding(event, keymap.createSiblingNode)) {
        event.preventDefault();
        event.stopPropagation();
        onCreateSibling();
        return;
      }
      if (event.key === "Escape" && (hasMultiCursor || hasBulkSelection)) {
        event.preventDefault();
        event.stopPropagation();
        onClearPowerSelection();
        return;
      }
      if (hasMultiCursor && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        onApplyTextToCursors({ type: "insert", text: event.key });
      }
    };
    const handleRootKeyUp = (event: KeyboardEvent) => {
      if (isComposingEvent(event)) {
        return;
      }
      const textEditKey = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (["ArrowLeft", "ArrowRight", "Home", "End", "Backspace", "Delete"].includes(event.key) || textEditKey) {
        onCursorHorizontalChange(readOffset());
      }
    };
    const handlePointerUp = () => {
      onCursorHorizontalChange(readOffset());
    };
    const rootElement = editor.getRootElement();
    rootElement?.addEventListener("keydown", handleRootKeyDown, { capture: true });
    rootElement?.addEventListener("keyup", handleRootKeyUp);
    rootElement?.addEventListener("pointerup", handlePointerUp);
    rootElement?.addEventListener("mouseup", handlePointerUp);
    return () => {
      unregisterEnter();
      unregisterTab();
      unregisterBackspace();
      unregisterDelete();
      unregisterUp();
      unregisterDown();
      unregisterPaste();
      unregisterCopy();
      rootElement?.removeEventListener("keydown", handleRootKeyDown, { capture: true });
      rootElement?.removeEventListener("keyup", handleRootKeyUp);
      rootElement?.removeEventListener("pointerup", handlePointerUp);
      rootElement?.removeEventListener("mouseup", handlePointerUp);
    };
  }, [
    editor,
    hasBulkSelection,
    hasMultiCursor,
    nodeText,
    editorText,
    onAddCursor,
    onApplyTextToCursors,
    onClearPowerSelection,
    onCopySelection,
    onCreateAfter,
    onCreateSibling,
    onCursorHorizontalChange,
    onFocusNote,
    keymap,
    onExtendSelection,
    onIndent,
    onMoveNode,
    onMoveSelectionWithOffset,
    onOutdent,
    onPasteText,
    onRemoveEmpty
  ]);

  return null;
}

function isComposingEvent(event?: KeyboardEvent | null): boolean {
  return Boolean(event?.isComposing || event?.key === "Process" || event?.keyCode === 229);
}

function toEditorText(node: OutlineNode): string {
  return node.heading ? `${"#".repeat(node.heading)} ${node.text}` : node.text;
}

function NoteKeyboardPlugin({
  keymap,
  onFocusText,
  onMoveSelectionWithOffset
}: {
  keymap: PreferenceSettings["keymap"];
  onFocusText: () => void;
  onMoveSelectionWithOffset: (direction: "previous" | "next", offset: number) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const readOffset = () => {
      let offset = 0;
      editor.getEditorState().read(() => {
        offset = $getRoot().getTextContent().length;
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          offset = selection.anchor.offset;
        }
      });
      return offset;
    };
    const handleRootKeyDown = (event: KeyboardEvent) => {
      if (isComposingEvent(event)) {
        return;
      }
      if (matchesKeyBinding(event, keymap.focusNodeNote)) {
        event.preventDefault();
        event.stopPropagation();
        onFocusText();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        onMoveSelectionWithOffset("previous", readOffset());
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        onMoveSelectionWithOffset("next", readOffset());
      }
    };
    const rootElement = editor.getRootElement();
    rootElement?.addEventListener("keydown", handleRootKeyDown, { capture: true });
    return () => {
      rootElement?.removeEventListener("keydown", handleRootKeyDown, { capture: true });
    };
  }, [editor, keymap, onFocusText, onMoveSelectionWithOffset]);

  return null;
}

function FocusPlugin({ offset, requestKey }: { offset?: number; requestKey?: number }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let attempts = 0;
    let handle = 0;
    const focus = () => {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        attempts += 1;
        if (attempts < 8) {
          handle = window.setTimeout(focus, 16);
        }
        return;
      }
      let selected = false;
      rootElement.focus();
      if (typeof offset === "number") {
        editor.update(() => {
          const root = $getRoot();
          const paragraph = root.getFirstChild();
          const textNode = $isElementNode(paragraph) ? paragraph.getFirstChild() : undefined;
          if (textNode && $isTextNode(textNode)) {
            const safeOffset = Math.max(0, Math.min(offset, textNode.getTextContentSize()));
            textNode.select(safeOffset, safeOffset);
            selected = true;
            return;
          }
          if ($isElementNode(paragraph)) {
            paragraph.select(0, 0);
            selected = true;
          }
        });
      } else {
        editor.focus();
        selected = true;
      }
      attempts += 1;
      if (!selected && attempts < 8) {
        handle = window.setTimeout(focus, 16);
      }
    };
    handle = window.setTimeout(focus, 0);
    return () => {
      window.clearTimeout(handle);
    };
  }, [editor, offset, requestKey]);
  return null;
}
