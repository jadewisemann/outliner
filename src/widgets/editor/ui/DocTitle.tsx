import type { Store } from "@/entities/workspace";

/**
 * The page's own name, always — not a 13px crumb in the chrome. Zoomed in, the
 * row the outline is zoomed into is the page.
 */
export function DocTitle({ store }: { store: Store }) {
  const { doc, view } = store;
  const zoomed = view.zoomId !== doc.rootId;
  return (
    <div className={`doc-title${zoomed ? " doc-title-zoomed" : ""}`}>
      <h1>{zoomed ? doc.nodes[view.zoomId]?.text || "(빈 항목)" : doc.title}</h1>
    </div>
  );
}
