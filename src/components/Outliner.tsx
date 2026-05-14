import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineRow } from "./OutlineRow";
import {
  bulkDeleteNodes,
  bulkIndentNodes,
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
  outdentNode,
  removeEmptyNodeOrPromoteChildren,
  splitNode,
  toggleCollapse,
  updateNodeText,
  zoomInto,
  zoomToAncestor
} from "../domain/outline";
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
};

export function Outliner({
  document,
  view,
  createId,
  now,
  onDocumentChange,
  onViewChange
}: OutlinerProps) {
  const visibleNodes = useMemo(() => getVisibleNodes(document, view.zoomNodeId), [document, view.zoomNodeId]);
  const selectedNodeIds = useMemo(() => {
    if (!view.selectionAnchorNodeId || !view.selectionFocusNodeId) {
      return [];
    }
    return selectVisibleRange(document, view.zoomNodeId, view.selectionAnchorNodeId, view.selectionFocusNodeId);
  }, [document, view.selectionAnchorNodeId, view.selectionFocusNodeId, view.zoomNodeId]);
  const hasBulkSelection = selectedNodeIds.length > 1;

  const selectNode = (nodeId: NodeId) => {
    onViewChange({
      ...view,
      selectedNodeId: nodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined
    });
  };

  const commitDocument = (next: OutlineDocument, selectedNodeId = view.selectedNodeId) => {
    onDocumentChange(next);
    onViewChange({
      ...view,
      selectedNodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined
    });
  };

  const createAfter = (nodeId: NodeId, offset?: number) => {
    const node = document.nodes[nodeId];
    const result =
      typeof offset === "number"
        ? splitNode(document, nodeId, offset, createId, now)
        : createNodeAfter(document, nodeId, createId, now);
    commitDocument(result.document, result.nodeId);
    if (!node || typeof offset !== "number") {
      return;
    }
  };

  const pasteText = (nodeId: NodeId, offset: number, text: string) => {
    const result = insertNodesFromText(document, nodeId, offset, text, createId, now);
    commitDocument(result.document, result.selectedNodeId);
  };

  const updateText = (nodeId: NodeId, text: string) => {
    onDocumentChange((current) => updateNodeText(current, nodeId, text, now));
  };

  const indent = (nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkIndentNodes(document, selectedNodeIds, now), nodeId);
      return;
    }
    commitDocument(indentNode(document, nodeId, now), nodeId);
  };

  const outdent = (nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkOutdentNodes(document, selectedNodeIds, now), nodeId);
      return;
    }
    commitDocument(outdentNode(document, nodeId, now), nodeId);
  };

  const removeEmpty = (nodeId: NodeId) => {
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
  };

  const moveSelection = (direction: "previous" | "next", nodeId: NodeId) => {
    const nextId =
      direction === "previous"
        ? getPreviousVisibleNode(document, view.zoomNodeId, nodeId)
        : getNextVisibleNode(document, view.zoomNodeId, nodeId);
    if (nextId) {
      selectNode(nextId);
    }
  };

  const extendSelection = (direction: "previous" | "next", nodeId: NodeId) => {
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
  };

  const toggle = (nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkToggleCollapse(document, selectedNodeIds, !document.nodes[nodeId].collapsed, now), nodeId);
      return;
    }
    commitDocument(toggleCollapse(document, nodeId, now), nodeId);
  };

  const copySelection = () => (hasBulkSelection ? serializeNodesForClipboard(document, selectedNodeIds) : undefined);

  const zoom = (nodeId: NodeId) => {
    onViewChange(zoomInto(view, document, nodeId));
  };

  const navigate = (nodeId: NodeId) => {
    onViewChange(zoomToAncestor(view, document, nodeId));
  };

  const ensureNode = () => {
    const result = ensureEditableNode(document, createId, now);
    onDocumentChange(result.document);
    onViewChange({ ...view, selectedNodeId: result.nodeId });
  };

  return (
    <section className="outliner-panel">
      <Breadcrumb document={document} zoomNodeId={view.zoomNodeId} onNavigate={navigate} />
      <div className="outline-list" role="tree" aria-label="Outline">
        {visibleNodes.length === 0 ? (
          <button className="empty-node-button" type="button" onClick={ensureNode}>
            Start writing
          </button>
        ) : (
          visibleNodes.map((item) => (
            <OutlineRow
              key={item.id}
              node={item.node}
              depth={item.depth}
              active={view.selectedNodeId === item.id}
              selected={selectedNodeIds.includes(item.id)}
              hasBulkSelection={hasBulkSelection}
              onSelect={() => selectNode(item.id)}
              onTextChange={(text) => updateText(item.id, text)}
              onCreateAfter={(offset) => createAfter(item.id, offset)}
              onPasteText={(offset, text) => pasteText(item.id, offset, text)}
              onIndent={() => indent(item.id)}
              onOutdent={() => outdent(item.id)}
              onRemoveEmpty={() => removeEmpty(item.id)}
              onMoveSelection={(direction) => moveSelection(direction, item.id)}
              onExtendSelection={(direction) => extendSelection(direction, item.id)}
              onToggleCollapse={() => toggle(item.id)}
              onCopySelection={copySelection}
              onZoom={() => zoom(item.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
