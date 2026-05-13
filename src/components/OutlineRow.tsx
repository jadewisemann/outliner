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
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type EditorState
} from "lexical";
import { useEffect, type CSSProperties } from "react";
import type { OutlineNode } from "../domain/outlineTypes";

type OutlineRowProps = {
  node: OutlineNode;
  depth: number;
  active: boolean;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onCreateAfter: (offset?: number) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onToggleCollapse: () => void;
  onZoom: () => void;
};

export function OutlineRow(props: OutlineRowProps) {
  const { node, depth, active, onSelect, onToggleCollapse, onZoom } = props;
  const hasChildren = node.children.length > 0;
  return (
    <div className={`outline-row ${active ? "outline-row-active" : ""}`} style={{ "--depth": depth } as CSSProperties}>
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
  onIndent,
  onOutdent,
  onRemoveEmpty,
  onMoveSelection
}: OutlineRowProps) {
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
    <LexicalComposer initialConfig={initialConfig}>
      <PlainTextPlugin
        contentEditable={<ContentEditable className="lexical-editor" aria-label="Outline node text" />}
        placeholder={<span className="editor-placeholder">Type</span>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <OnChangePlugin
        onChange={(editorState: EditorState) => {
          editorState.read(() => {
            onTextChange($getRoot().getTextContent());
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
      />
      <FocusPlugin />
    </LexicalComposer>
  );
}

function KeyboardPlugin({
  nodeText,
  onCreateAfter,
  onIndent,
  onOutdent,
  onRemoveEmpty,
  onMoveSelection
}: {
  nodeText: string;
  onCreateAfter: (offset?: number) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemoveEmpty: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterEnter = editor.registerCommand<KeyboardEvent>(
      KEY_ENTER_COMMAND,
      (event) => {
        event?.preventDefault();
        let offset = nodeText.length;
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            offset = selection.anchor.offset;
          }
        });
        onCreateAfter(offset);
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
        if (nodeText.length === 0) {
          onRemoveEmpty();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterUp = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_UP_COMMAND,
      () => {
        onMoveSelection("previous");
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    const unregisterDown = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        onMoveSelection("next");
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    return () => {
      unregisterEnter();
      unregisterTab();
      unregisterBackspace();
      unregisterUp();
      unregisterDown();
    };
  }, [editor, nodeText, onCreateAfter, onIndent, onMoveSelection, onOutdent, onRemoveEmpty]);

  return null;
}

function FocusPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.focus();
  }, [editor]);
  return null;
}
