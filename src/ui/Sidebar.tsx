import { useState } from "react";
import { allTags } from "../core/search";
import type { Store } from "../core/store";
import type { Id } from "../core/types";

type Props = {
  store: Store;
  onTagClick: (tag: string) => void;
};

export function Sidebar({ store, onTagClick }: Props) {
  const { workspace, docs } = store;
  const [renaming, setRenaming] = useState<Id | null>(null);
  const tags = allTags(workspace).slice(0, 20);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">문서</span>
        <button type="button" className="ghost" title="새 문서" onClick={() => docs.create()}>
          +
        </button>
      </div>

      <nav className="doc-list">
        {workspace.docOrder.map((id, index) => {
          const doc = workspace.docs[id];
          if (!doc) return null;
          const active = id === workspace.activeDocId;
          return (
            <div
              key={id}
              className={`doc-item${active ? " doc-item-active" : ""}`}
              draggable={renaming !== id}
              onDragStart={(event) => event.dataTransfer.setData("text/doc-index", String(index))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const from = Number(event.dataTransfer.getData("text/doc-index"));
                if (!Number.isNaN(from) && from !== index) docs.reorder(from, index);
              }}
            >
              {renaming === id ? (
                <input
                  className="doc-rename"
                  autoFocus
                  defaultValue={doc.title}
                  onBlur={(event) => {
                    docs.rename(id, event.target.value.trim() || "Untitled");
                    setRenaming(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <>
                  <button type="button" className="doc-open" onClick={() => docs.select(id)} onDoubleClick={() => setRenaming(id)}>
                    {doc.title}
                  </button>
                  <button
                    type="button"
                    className="ghost doc-remove"
                    title="문서 삭제"
                    onClick={() => {
                      if (workspace.docOrder.length > 1 && confirm(`"${doc.title}" 문서를 삭제할까요?`)) docs.remove(id);
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
      </nav>

      {tags.length > 0 ? (
        <div className="tag-cloud">
          <span className="sidebar-title">태그</span>
          <div className="tag-cloud-items">
            {tags.map(({ tag, count }) => (
              <button key={tag} type="button" className="tag-chip" onClick={() => onTagClick(tag)}>
                {tag}
                <em>{count}</em>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
