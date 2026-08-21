import { useDeferredValue, useMemo, useState } from "react";
import { reveal } from "../outline/tree";
import { bookmarks } from "../palette/commands";
import { allTags } from "../search/search";
import type { Store } from "../store";
import { docTree, trashed, type Id } from "../types";
import { Icon } from "./Icon";

type Props = {
  store: Store;
  onTagClick: (tag: string) => void;
  /** A saved search opens the search panel rather than a document. */
  onSearch: (query: string) => void;
};

const OPEN_KEY = "outliner:folders";

/** Which folders are open, per device — not something to sync. */
function loadOpen(): Set<Id> {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id): id is Id => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function Sidebar({ store, onTagClick, onSearch }: Props) {
  const { workspace, docs } = store;
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [open, setOpen] = useState<Set<Id>>(loadOpen);
  const [dropTarget, setDropTarget] = useState<{ id: Id; into: boolean } | null>(null);

  // Scans every node in every document, and `docs` gets a new identity on each
  // keystroke — deferring keeps that work off the typing path.
  const settled = useDeferredValue(workspace);
  const tags = useMemo(() => allTags(settled).slice(0, 20), [settled]);
  const pinned = useMemo(() => bookmarks(store), [store]);
  const rows = docTree(workspace, (id) => open.has(id));
  const bin = trashed(workspace);
  const [binOpen, setBinOpen] = useState(false);

  const toggleFolder = (id: Id) => {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode — folders just start closed next time */
      }
      return next;
    });
  };

  const openBookmark = (docId: Id, nodeId: Id | null) => {
    store.docs.select(docId, nodeId ? { zoomId: workspace.docs[docId].rootId } : {});
    if (!nodeId) return;
    store.edit((doc) => reveal(doc, nodeId), { transient: true });
    store.requestFocus(nodeId);
  };

  return (
    <aside className="sidebar">
      {pinned.length > 0 ? (
        <div>
          <span className="sidebar-title">즐겨찾기</span>
          <nav className="doc-list">
            {pinned.map((mark) => (
              <div key={`${mark.docId}:${mark.nodeId ?? ""}`} className="doc-item">
                <button
                  type="button"
                  className="doc-open"
                  onClick={() => openBookmark(mark.docId, mark.nodeId)}
                  title={mark.label || "(빈 항목)"}
                >
                  <span className="doc-icon">{mark.nodeId ? "•" : "▤"}</span>
                  {mark.label || "(빈 항목)"}
                </button>
              </div>
            ))}
          </nav>
        </div>
      ) : null}

      <div>
        <div className="sidebar-head">
          <span className="sidebar-title">문서</span>
          <button type="button" className="ghost" title="새 폴더" onClick={() => docs.createFolder()}>
            <Icon name="folder" />
          </button>
          <button type="button" className="ghost" title="새 문서" onClick={() => docs.create()}>
            <Icon name="plus" />
          </button>
        </div>

        <nav
          className="doc-list"
          // Dropping past the last row files at the top level, which is the
          // only way back out of a folder with a mouse.
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const moved = event.dataTransfer.getData("text/doc-id");
            if (moved && !dropTarget) docs.reorder(moved, null, rows.length);
            setDropTarget(null);
          }}
        >
          {rows.map(({ doc, depth }, index) => {
            const id = doc.id;
            const active = id === workspace.activeDocId && doc.kind === "doc";
            const folder = doc.kind === "folder";
            const target = dropTarget?.id === id;
            return (
              <div
                key={id}
                className={[
                  "doc-item",
                  active ? "doc-item-active" : "",
                  target && dropTarget.into ? "doc-item-into" : "",
                  target && !dropTarget.into ? "doc-item-before" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ paddingLeft: depth * 12 }}
                draggable={renaming !== id}
                onDragStart={(event) => event.dataTransfer.setData("text/doc-id", id)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDropTarget({ id, into: folder });
                }}
                onDragLeave={() => setDropTarget((current) => (current?.id === id ? null : current))}
                onDrop={(event) => {
                  event.stopPropagation();
                  const moved = event.dataTransfer.getData("text/doc-id");
                  setDropTarget(null);
                  if (!moved || moved === id) return;
                  if (folder) {
                    docs.moveInto(moved, id);
                    setOpen((current) => new Set(current).add(id));
                    return;
                  }
                  const siblings = rows.filter((row) => row.doc.parent === doc.parent);
                  docs.reorder(moved, doc.parent, siblings.findIndex((row) => row.doc.id === id));
                }}
              >
                {renaming === id ? (
                  <input
                    className="doc-rename"
                    autoFocus
                    defaultValue={doc.title}
                    onBlur={(event) => {
                      docs.rename(id, event.target.value.trim() || (folder ? "새 폴더" : "Untitled"));
                      setRenaming(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="doc-open"
                      onClick={() =>
                        folder ? toggleFolder(id) : doc.kind === "search" ? onSearch(doc.query) : docs.select(id)
                      }
                      onDoubleClick={() => setRenaming(id)}
                    >
                      {/*
                        The inbox gets its own mark, because "where does a
                        share land" is a question the sidebar can answer at a
                        glance and the palette cannot.
                      */}
                      <span className="doc-icon" title={doc.inbox ? "인박스 — 공유 캡처가 여기로" : undefined}>
                        {folder ? (open.has(id) ? "▾" : "▸") : doc.kind === "search" ? "⌕" : doc.inbox ? "↓" : "·"}
                      </span>
                      {doc.title}
                    </button>
                    <button
                      type="button"
                      className={`ghost doc-pin${doc.bookmarked ? " doc-pin-on" : ""}`}
                      title={doc.bookmarked ? "즐겨찾기 해제" : "즐겨찾기"}
                      onClick={() => docs.toggleBookmark(id)}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      className="ghost doc-remove"
                      title={folder ? "폴더 삭제" : "문서 삭제"}
                      onClick={() => {
                        // A folder that still holds documents would take them
                        // with it, so it has to be emptied first.
                        if (folder && rows.some((row) => row.doc.parent === id)) {
                          alert("폴더가 비어 있어야 삭제할 수 있습니다.");
                          return;
                        }
                        if (confirm(`"${doc.title}" 을(를) 삭제할까요?`)) docs.remove(id);
                      }}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {rows.length === 0 ? <p className="sidebar-empty">문서가 없습니다.</p> : null}
        </nav>
      </div>

      {bin.length > 0 ? (
        <div>
          <button type="button" className="sidebar-title sidebar-toggle" onClick={() => setBinOpen((on) => !on)}>
            휴지통 {bin.length}
          </button>
          {binOpen ? (
            <nav className="doc-list">
              {bin.map((doc) => (
                <div key={doc.id} className="doc-item doc-item-trashed">
                  <span className="doc-open">{doc.title}</span>
                  <button type="button" className="ghost" title="되살리기" onClick={() => docs.restore(doc.id)}>
                    ↩
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    title="완전히 삭제"
                    onClick={() => {
                      if (confirm(`"${doc.title}" 을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.`)) docs.purge(doc.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}

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
