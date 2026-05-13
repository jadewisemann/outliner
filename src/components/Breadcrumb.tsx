import type { NodeId, OutlineDocument } from "../domain/outlineTypes";
import { getBreadcrumbPath } from "../domain/outlineSelectors";

type BreadcrumbProps = {
  document: OutlineDocument;
  zoomNodeId: NodeId;
  onNavigate: (nodeId: NodeId) => void;
};

export function Breadcrumb({ document, zoomNodeId, onNavigate }: BreadcrumbProps) {
  const path = getBreadcrumbPath(document, zoomNodeId);
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {path.map((nodeId, index) => {
        const node = document.nodes[nodeId];
        const label = nodeId === document.rootId ? "Root" : node.text || "Untitled";
        return (
          <span key={nodeId} className="breadcrumb-segment">
            {index > 0 ? <span className="breadcrumb-separator">/</span> : null}
            <button type="button" onClick={() => onNavigate(nodeId)}>
              {label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
