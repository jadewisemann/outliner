import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineRow } from "./OutlineRow";
import {
  bulkDeleteNodes,
  bulkIndentNodes,
  bulkMoveNodesDown,
  bulkMoveNodesUp,
  bulkOutdentNodes,
  bulkToggleCollapse,
  insertNodesFromText,
  selectVisibleRange,
  serializeNodesForClipboard
} from "../domain/bulkOutline";
import {
  createNodeAfter,
  ensureEditableNode,
  indentNode,
  moveNodeDown,
  moveNodeUp,
  outdentNode,
  removeEmptyNodeOrPromoteChildren,
  splitNode,
  toggleCollapse,
  updateNodeText,
  zoomInto,
  zoomToAncestor
} from "../domain/outline";
import {
  addCursorAbove,
  addCursorBelow,
  applyTextToCursors,
  clearCursors,
  type CursorTextEdit
} from "../domain/multiCursor";
import {
  getNextVisibleNode,
  getPreviousVisibleNode,
  getVisibleNodes
} from "../domain/outlineSelectors";
import type { Clock, IdGenerator, NodeId, OutlineDocument, ViewState } from "../domain/outlineTypes";

type OutlinerProps = {
  document: OutlineDocument;
  view: ViewState;
  createId: IdGenerator;
  now: Clock;
  onDocumentChange: Dispatch<SetStateAction<OutlineDocument>>;
  onViewChange: (view: ViewState) => void;
  onRenderRow?: (nodeId: NodeId) => void;
};

const ROW_HEIGHT = 32;
const VIRTUALIZATION_THRESHOLD = 300;
const VIRTUAL_OVERSCAN = 12;
const FALLBACK_VIEWPORT_HEIGHT = 640;

function useStableCallback<T extends (...args: never[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}

export function Outliner({
  document,
  view,
  createId,
  now,
  onDocumentChange,
  onViewChange,
  onRenderRow
}: OutlinerProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: FALLBACK_VIEWPORT_HEIGHT });
  const visibleNodes = useMemo(() => getVisibleNodes(document, view.zoomNodeId), [document, view.zoomNodeId]);
  const selectedNodeIds = useMemo(() => {
    if (!view.selectionAnchorNodeId || !view.selectionFocusNodeId) {
      return [];
    }
    return selectVisibleRange(document, view.zoomNodeId, view.selectionAnchorNodeId, view.selectionFocusNodeId);
  }, [document, view.selectionAnchorNodeId, view.selectionFocusNodeId, view.zoomNodeId]);
  const hasBulkSelection = selectedNodeIds.length > 1;
  const hasMultiCursor = (view.cursors?.length ?? 0) > 1;
  const virtualWindow = useMemo(() => {
    if (visibleNodes.length <= VIRTUALIZATION_THRESHOLD) {
      return {
        nodes: visibleNodes,
        start: 0,
        beforeHeight: 0,
        afterHeight: 0,
        totalHeight: visibleNodes.length * ROW_HEIGHT,
        virtualized: false
      };
    }
    const selectedIndex = view.selectedNodeId
      ? visibleNodes.findIndex((item) => item.id === view.selectedNodeId)
      : -1;
    const scrollStart = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const viewportRows = Math.ceil(viewport.height / ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
    const selectedStart =
      selectedIndex >= 0 ? Math.max(0, selectedIndex - Math.floor(viewportRows / 2)) : scrollStart;
    const start = viewport.scrollTop === 0 && selectedIndex >= viewportRows ? selectedStart : scrollStart;
    const end = Math.min(visibleNodes.length, start + viewportRows);
    return {
      nodes: visibleNodes.slice(start, end),
      start,
      beforeHeight: start * ROW_HEIGHT,
      afterHeight: (visibleNodes.length - end) * ROW_HEIGHT,
      totalHeight: visibleNodes.length * ROW_HEIGHT,
      virtualized: true
    };
  }, [view.selectedNodeId, viewport.height, viewport.scrollTop, visibleNodes]);

  const selectNode = useStableCallback((nodeId: NodeId) => {
    onViewChange({
      ...view,
      selectedNodeId: nodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: undefined
    });
  });

  const commitDocument = (
    next: OutlineDocument,
    selectedNodeId = view.selectedNodeId,
    options: { preserveSelection?: boolean } = {}
  ) => {
    onDocumentChange(next);
    onViewChange({
      ...view,
      selectedNodeId,
      selectionAnchorNodeId: options.preserveSelection ? view.selectionAnchorNodeId : undefined,
      selectionFocusNodeId: options.preserveSelection ? view.selectionFocusNodeId : undefined,
      cursors: options.preserveSelection ? view.cursors : undefined
    });
  };

  const createAfter = useStableCallback((nodeId: NodeId, offset?: number) => {
    const node = document.nodes[nodeId];
    const result =
      typeof offset === "number"
        ? splitNode(document, nodeId, offset, createId, now)
        : createNodeAfter(document, nodeId, createId, now);
    commitDocument(result.document, result.nodeId);
    if (!node || typeof offset !== "number") {
      return;
    }
  });

  const pasteText = useStableCallback((nodeId: NodeId, offset: number, text: string) => {
    const result = insertNodesFromText(document, nodeId, offset, text, createId, now);
    commitDocument(result.document, result.selectedNodeId);
  });

  const updateText = useStableCallback((nodeId: NodeId, text: string) => {
    onDocumentChange((current) => updateNodeText(current, nodeId, text, now));
  });

  const indent = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkIndentNodes(document, selectedNodeIds, now), nodeId, { preserveSelection: true });
      return;
    }
    commitDocument(indentNode(document, nodeId, now), nodeId);
  });

  const outdent = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkOutdentNodes(document, selectedNodeIds, now), nodeId, { preserveSelection: true });
      return;
    }
    commitDocument(outdentNode(document, nodeId, now), nodeId);
  });

  const removeEmpty = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      const result = bulkDeleteNodes(document, selectedNodeIds, now);
      onDocumentChange(result.document);
      onViewChange({
        ...view,
        selectedNodeId: result.selectedNodeId,
        selectionAnchorNodeId: undefined,
        selectionFocusNodeId: undefined
      });
      return;
    }
    const result = removeEmptyNodeOrPromoteChildren(document, nodeId, now);
    onDocumentChange(result.document);
    onViewChange({
      ...view,
      selectedNodeId: result.selectedNodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined
    });
  });

  const moveSelection = useStableCallback((direction: "previous" | "next", nodeId: NodeId) => {
    const nextId =
      direction === "previous"
        ? getPreviousVisibleNode(document, view.zoomNodeId, nodeId)
        : getNextVisibleNode(document, view.zoomNodeId, nodeId);
    if (nextId) {
      selectNode(nextId);
    }
  });

  const moveNode = useStableCallback((direction: "previous" | "next", nodeId: NodeId) => {
    if (hasBulkSelection) {
      const nextDocument =
        direction === "previous"
          ? bulkMoveNodesUp(document, selectedNodeIds, view.zoomNodeId, now)
          : bulkMoveNodesDown(document, selectedNodeIds, view.zoomNodeId, now);
      commitDocument(nextDocument, nodeId, { preserveSelection: true });
      return;
    }
    const nextDocument =
      direction === "previous"
        ? moveNodeUp(document, nodeId, view.zoomNodeId, now)
        : moveNodeDown(document, nodeId, view.zoomNodeId, now);
    commitDocument(nextDocument, nodeId);
  });

  const extendSelection = useStableCallback((direction: "previous" | "next", nodeId: NodeId) => {
    const nextId =
      direction === "previous"
        ? getPreviousVisibleNode(document, view.zoomNodeId, nodeId)
        : getNextVisibleNode(document, view.zoomNodeId, nodeId);
    if (!nextId) {
      return;
    }
    const anchor = view.selectionAnchorNodeId ?? view.selectedNodeId ?? nodeId;
    onViewChange({
      ...view,
      selectedNodeId: nextId,
      selectionAnchorNodeId: anchor,
      selectionFocusNodeId: nextId
    });
  });

  const toggle = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkToggleCollapse(document, selectedNodeIds, !document.nodes[nodeId].collapsed, now), nodeId, {
        preserveSelection: true
      });
      return;
    }
    commitDocument(toggleCollapse(document, nodeId, now), nodeId);
  });

  const addCursor = useStableCallback((direction: "previous" | "next", nodeId: NodeId, offset: number) => {
    const cursors =
      direction === "previous"
        ? addCursorAbove(document, view.zoomNodeId, view.cursors, { nodeId, offset })
        : addCursorBelow(document, view.zoomNodeId, view.cursors, { nodeId, offset });
    onViewChange({
      ...view,
      selectedNodeId: nodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors
    });
  });

  const applyCursorEdit = useStableCallback((edit: CursorTextEdit) => {
    if (!view.cursors || view.cursors.length <= 1) {
      return;
    }
    const result = applyTextToCursors(document, view.zoomNodeId, view.cursors, edit, now);
    onDocumentChange(result.document);
    onViewChange({
      ...view,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: result.cursors
    });
  });

  const clearPowerSelection = useStableCallback(() => {
    onViewChange({
      ...view,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: clearCursors()
    });
  });

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = window.document.activeElement as HTMLElement | null;
      if (activeElement?.getAttribute("role") !== "textbox") {
        if (event.key === "Escape" && (hasBulkSelection || hasMultiCursor)) {
          event.preventDefault();
          event.stopPropagation();
          clearPowerSelection();
        }
        return;
      }
      if (event.key === "Tab" && view.selectedNodeId) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          outdent(view.selectedNodeId);
        } else {
          indent(view.selectedNodeId);
        }
        return;
      }
      if (event.key === "Escape" && (hasBulkSelection || hasMultiCursor)) {
        event.preventDefault();
        event.stopPropagation();
        clearPowerSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  });

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }
    setViewport((current) => ({
      ...current,
      height: element.clientHeight || FALLBACK_VIEWPORT_HEIGHT
    }));
  }, [visibleNodes.length]);

  const copySelection = useStableCallback(() =>
    hasBulkSelection ? serializeNodesForClipboard(document, selectedNodeIds) : undefined
  );

  const zoom = useStableCallback((nodeId: NodeId) => {
    onViewChange(zoomInto(view, document, nodeId));
  });

  const navigate = useStableCallback((nodeId: NodeId) => {
    onViewChange(zoomToAncestor(view, document, nodeId));
  });

  const ensureNode = () => {
    const result = ensureEditableNode(document, createId, now);
    onDocumentChange(result.document);
    onViewChange({ ...view, selectedNodeId: result.nodeId });
  };

  return (
    <section className="outliner-panel">
      <Breadcrumb document={document} zoomNodeId={view.zoomNodeId} onNavigate={navigate} />
      <div
        ref={listRef}
        className={`outline-list ${virtualWindow.virtualized ? "outline-list-virtualized" : ""}`}
        role="tree"
        aria-label="Outline"
        data-visible-count={visibleNodes.length}
        data-rendered-count={virtualWindow.nodes.length}
        onScroll={(event) => {
          const element = event.currentTarget;
          setViewport({
            scrollTop: element.scrollTop,
            height: element.clientHeight || FALLBACK_VIEWPORT_HEIGHT
          });
        }}
      >
        {visibleNodes.length === 0 ? (
          <button className="empty-node-button" type="button" onClick={ensureNode}>
            Start writing
          </button>
        ) : (
          <>
            {virtualWindow.beforeHeight > 0 ? (
              <div aria-hidden="true" style={{ height: virtualWindow.beforeHeight }} />
            ) : null}
            {virtualWindow.nodes.map((item) => (
              <OutlineRow
                key={item.id}
                node={item.node}
                depth={item.depth}
                active={view.selectedNodeId === item.id}
                selected={selectedNodeIds.includes(item.id)}
                hasCursor={(view.cursors ?? []).some((cursor) => cursor.nodeId === item.id)}
                hasBulkSelection={hasBulkSelection}
                hasMultiCursor={hasMultiCursor}
                onSelect={() => selectNode(item.id)}
                onTextChange={(text) => updateText(item.id, text)}
                onCreateAfter={(offset) => createAfter(item.id, offset)}
                onPasteText={(offset, text) => pasteText(item.id, offset, text)}
                onIndent={() => indent(item.id)}
                onOutdent={() => outdent(item.id)}
                onRemoveEmpty={() => removeEmpty(item.id)}
                onMoveSelection={(direction) => moveSelection(direction, item.id)}
                onMoveNode={(direction) => moveNode(direction, item.id)}
                onExtendSelection={(direction) => extendSelection(direction, item.id)}
                onAddCursor={(direction, offset) => addCursor(direction, item.id, offset)}
                onApplyTextToCursors={applyCursorEdit}
                onClearPowerSelection={clearPowerSelection}
                onToggleCollapse={() => toggle(item.id)}
                onCopySelection={copySelection}
                onZoom={() => zoom(item.id)}
                onRender={onRenderRow}
              />
            ))}
            {virtualWindow.afterHeight > 0 ? (
              <div aria-hidden="true" style={{ height: virtualWindow.afterHeight }} />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
