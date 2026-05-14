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
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { OutlineNode } from "../domain/outlineTypes";

type OutlineRowProps = {
  node: OutlineNode;
  depth: number;
  active: boolean;
  selected: boolean;
  hasBulkSelection: boolean;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onCreateAfter: (offset?: number) => void;
  onPasteText: (offset: number, text: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onExtendSelection: (direction: "previous" | "next") => void;
  onToggleCollapse: () => void;
  onCopySelection: () => string | undefined;
  onZoom: () => void;
};

export function OutlineRow(props: OutlineRowProps) {
  const { node, depth, active, selected, onSelect, onToggleCollapse, onZoom } = props;
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={`outline-row ${active ? "outline-row-active" : ""} ${selected ? "outline-row-selected" : ""}`}
      data-node-id={node.id}
      data-node-text={node.text}
      style={{ "--depth": depth } as CSSProperties}
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
        {active ? <ActiveRowEditor {...props} /> : <span className="plain-row-text">{node.text || "\u00a0"}</span>}
      </div>
    </div>
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
  onExtendSelection,
  onCopySelection,
  hasBulkSelection
}: OutlineRowProps) {
  const skipInitialChangeRef = useRef(true);
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
    <LexicalComposer key={`${node.id}:${node.text}`} initialConfig={initialConfig}>
      <PlainTextPlugin
        contentEditable={<ContentEditable className="lexical-editor" aria-label="Outline node text" />}
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
        onExtendSelection={onExtendSelection}
        onPasteText={onPasteText}
        onCopySelection={onCopySelection}
        hasBulkSelection={hasBulkSelection}
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
  onExtendSelection,
  onPasteText,
  onCopySelection,
  hasBulkSelection
}: {
  nodeText: string;
  onCreateAfter: (offset?: number) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onExtendSelection: (direction: "previous" | "next") => void;
  onPasteText: (offset: number, text: string) => void;
  onCopySelection: () => string | undefined;
  hasBulkSelection: boolean;
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
      () => {
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
      () => {
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
    return () => {
      unregisterEnter();
      unregisterTab();
      unregisterBackspace();
      unregisterDelete();
      unregisterUp();
      unregisterDown();
      unregisterPaste();
      unregisterCopy();
    };
  }, [
    editor,
    hasBulkSelection,
    nodeText,
    onCopySelection,
    onCreateAfter,
    onExtendSelection,
    onIndent,
    onMoveSelection,
    onOutdent,
    onPasteText,
    onRemoveEmpty
  ]);

  return null;
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
