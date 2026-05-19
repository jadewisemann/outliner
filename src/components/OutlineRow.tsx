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
  $isRangeSelection,
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
import { renderInlineMarkdown } from "../domain/richText";

type OutlineRowProps = {
  node: OutlineNode;
  depth: number;
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  hasCursor: boolean;
  hasBulkSelection: boolean;
  hasMultiCursor: boolean;
  onSelect: () => void;
  onSelectTag: (tag: string) => void;
  onTextChange: (text: string) => void;
  onCreateAfter: (offset?: number) => void;
  onPasteText: (offset: number, text: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onMoveNode: (direction: "previous" | "next") => void;
  onExtendSelection: (direction: "previous" | "next") => void;
  onAddCursor: (direction: "previous" | "next", offset: number) => void;
  onApplyTextToCursors: (edit: CursorTextEdit) => void;
  onClearPowerSelection: () => void;
  onToggleCollapse: () => void;
  onCopySelection: () => string | undefined;
  onZoom: () => void;
  onRender?: (nodeId: string) => void;
};

function OutlineRowComponent(props: OutlineRowProps) {
  const { node, depth, active, selected, highlighted, hasCursor, onSelect, onSelectTag, onToggleCollapse, onZoom } = props;
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
          <ActiveRowEditor {...props} />
        ) : (
          <PlainRowText node={node} onSelectTag={onSelectTag} />
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
    previous.hasMultiCursor === next.hasMultiCursor
  );
});

function PlainRowText({ node, onSelectTag }: { node: OutlineNode; onSelectTag: (tag: string) => void }) {
  const { text } = node;
  const tags = extractTags(text);
  if (tags.length === 0) {
    return <RichRowText node={node} content={renderInlineMarkdown(text)} />;
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
  return <RichRowText node={node} content={parts.length > 0 ? parts : "\u00a0"} />;
}

function RichRowText({ node, content }: { node: OutlineNode; content: ReactNode }) {
  return (
    <span className={`plain-row-text ${node.numbered ? "plain-row-numbered" : ""}`}>
      <span>{content}</span>
      {node.note && node.noteVisible !== false ? <span className="node-note">{renderInlineMarkdown(node.note)}</span> : null}
    </span>
  );
}

function ActiveRowEditor({
  node,
  onTextChange,
  onCreateAfter,
  onPasteText,
  onIndent,
  onOutdent,
  onRemoveEmpty,
  onMoveSelection,
  onMoveNode,
  onExtendSelection,
  onAddCursor,
  onApplyTextToCursors,
  onClearPowerSelection,
  onCopySelection,
  hasBulkSelection,
  hasMultiCursor
}: OutlineRowProps) {
  const skipInitialChangeRef = useRef(true);
  const composingRef = useRef(false);
  const lastCompositionTextRef = useRef("");
  const initialConfig = {
    namespace: `outline-row-${node.id}`,
    onError(error: Error) {
      throw error;
    },
    editorState: () => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(node.text));
      root.append(paragraph);
    },
    theme: {
      paragraph: "lexical-paragraph"
    }
  };

  return (
    <LexicalComposer key={node.id} initialConfig={initialConfig}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            className="lexical-editor"
            aria-label="Outline node text"
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
              const text =
                finalCompositionText && previousCompositionText && currentText.endsWith(previousCompositionText)
                  ? `${currentText.slice(0, -previousCompositionText.length)}${finalCompositionText}`
                  : currentText || finalCompositionText || "";
              lastCompositionTextRef.current = "";
              if (text !== node.text) {
                onTextChange(text);
              }
            }}
          />
        }
        placeholder={<span className="editor-placeholder">Type</span>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <SyncInitialTextPlugin text={node.text} />
      <OnChangePlugin
        onChange={(editorState: EditorState) => {
          editorState.read(() => {
            const text = $getRoot().getTextContent();
            if (skipInitialChangeRef.current) {
              skipInitialChangeRef.current = false;
              return;
            }
            if (composingRef.current) {
              return;
            }
            onTextChange(text);
          });
        }}
      />
      <KeyboardPlugin
        nodeText={node.text}
        onCreateAfter={onCreateAfter}
        onIndent={onIndent}
        onOutdent={onOutdent}
        onRemoveEmpty={onRemoveEmpty}
        onMoveSelection={onMoveSelection}
        onMoveNode={onMoveNode}
        onExtendSelection={onExtendSelection}
        onAddCursor={onAddCursor}
        onApplyTextToCursors={onApplyTextToCursors}
        onClearPowerSelection={onClearPowerSelection}
        onPasteText={onPasteText}
        onCopySelection={onCopySelection}
        hasBulkSelection={hasBulkSelection}
        hasMultiCursor={hasMultiCursor}
      />
      <FocusPlugin />
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
  onCreateAfter,
  onIndent,
  onOutdent,
  onRemoveEmpty,
  onMoveSelection,
  onMoveNode,
  onExtendSelection,
  onAddCursor,
  onApplyTextToCursors,
  onClearPowerSelection,
  onPasteText,
  onCopySelection,
  hasBulkSelection,
  hasMultiCursor
}: {
  nodeText: string;
  onCreateAfter: (offset?: number) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onMoveNode: (direction: "previous" | "next") => void;
  onExtendSelection: (direction: "previous" | "next") => void;
  onAddCursor: (direction: "previous" | "next", offset: number) => void;
  onApplyTextToCursors: (edit: CursorTextEdit) => void;
  onClearPowerSelection: () => void;
  onPasteText: (offset: number, text: string) => void;
  onCopySelection: () => string | undefined;
  hasBulkSelection: boolean;
  hasMultiCursor: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const readOffset = () => {
      let offset = nodeText.length;
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
        onMoveSelection("previous");
        return false;
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
        onMoveSelection("next");
        return false;
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
    const rootElement = editor.getRootElement();
    rootElement?.addEventListener("keydown", handleRootKeyDown, { capture: true });
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
    };
  }, [
    editor,
    hasBulkSelection,
    hasMultiCursor,
    nodeText,
    onAddCursor,
    onApplyTextToCursors,
    onClearPowerSelection,
    onCopySelection,
    onCreateAfter,
    onExtendSelection,
    onIndent,
    onMoveNode,
    onMoveSelection,
    onOutdent,
    onPasteText,
    onRemoveEmpty
  ]);

  return null;
}

function isComposingEvent(event?: KeyboardEvent | null): boolean {
  return Boolean(event?.isComposing || event?.key === "Process" || event?.keyCode === 229);
}

function FocusPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const handle = window.setTimeout(() => {
      editor.focus();
    }, 0);
    return () => {
      window.clearTimeout(handle);
    };
  }, [editor]);
  return null;
}
