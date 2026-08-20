import { useDeferredValue, useMemo } from "react";
import { renderInline } from "../outline/inline";
import { backlinks, labelOf } from "../search/links";
import type { Store } from "../store";
import type { Id } from "../types";

/**
 * What points here.
 *
 * Shown for whatever is currently in view — the zoomed row, or the document
 * when nothing is zoomed — because "what refers to this" is a question about
 * the thing being read, and the thing being read is the zoom target.
 *
 * Dynalist has no equivalent. It is close to free here: the reverse index
 * falls out of the same walk that already resolves `((id))` labels.
 */
export function Backlinks({ store, onOpen }: { store: Store; onOpen: (id: Id) => void }) {
  const { workspace, doc, view } = store;
  // One pass over every row in every document, and `workspace` changes on each
  // keystroke — deferring keeps it off the typing path, like the tag cloud.
  const settled = useDeferredValue(workspace);
  const index = useMemo(() => backlinks(settled), [settled]);

  const target = view.zoomId === doc.rootId ? doc.id : view.zoomId;
  const sources = index.get(target) ?? [];
  if (sources.length === 0) return null;

  return (
    <section className="backlinks" aria-label="여기를 가리키는 곳">
      <h2>
        여기를 가리키는 곳 <em>{sources.length}</em>
      </h2>
      <ul>
        {sources.map((source) => (
          <li key={`${source.docId}:${source.nodeId}`}>
            <button type="button" onClick={() => onOpen(source.nodeId)}>
              <span className="backlink-text">
                {renderInline(source.text, { resolveItem: (id) => labelOf(settled, id), inert: true })}
              </span>
              <span className="backlink-where">{source.docTitle}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
