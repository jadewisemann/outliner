import { useMemo } from "react";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineRow } from "./OutlineRow";
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
  onDocumentChange: (document: OutlineDocument) => void;
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

  const selectNode = (nodeId: NodeId) => {
    onViewChange({ ...view, selectedNodeId: nodeId });
  };

  const commitDocument = (next: OutlineDocument, selectedNodeId = view.selectedNodeId) => {
    onDocumentChange(next);
    onViewChange({ ...view, selectedNodeId });
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

  const updateText = (nodeId: NodeId, text: string) => {
    onDocumentChange(updateNodeText(document, nodeId, text, now));
  };

  const indent = (nodeId: NodeId) => {
    commitDocument(indentNode(document, nodeId, now), nodeId);
  };

  const outdent = (nodeId: NodeId) => {
    commitDocument(outdentNode(document, nodeId, now), nodeId);
  };

  const removeEmpty = (nodeId: NodeId) => {
    const result = removeEmptyNodeOrPromoteChildren(document, nodeId, now);
    onDocumentChange(result.document);
    onViewChange({ ...view, selectedNodeId: result.selectedNodeId });
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

  const toggle = (nodeId: NodeId) => {
    commitDocument(toggleCollapse(document, nodeId, now), nodeId);
  };

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
              onSelect={() => selectNode(item.id)}
              onTextChange={(text) => updateText(item.id, text)}
              onCreateAfter={(offset) => createAfter(item.id, offset)}
              onIndent={() => indent(item.id)}
              onOutdent={() => outdent(item.id)}
              onRemoveEmpty={() => removeEmpty(item.id)}
              onMoveSelection={(direction) => moveSelection(direction, item.id)}
              onToggleCollapse={() => toggle(item.id)}
              onZoom={() => zoom(item.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
