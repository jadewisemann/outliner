import { useEffect, useMemo, useRef, useState } from "react";
import { search, type Hit } from "../core/search";
import type { Store } from "../core/store";
import { reveal } from "../core/tree";

type Props = {
  store: Store;
  initialQuery: string;
  onClose: () => void;
};

export function SearchPanel({ store, initialQuery, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initialQuery);
    input.current?.focus();
    input.current?.select();
  }, [initialQuery]);

  const hits = useMemo(() => search(store.workspace, query, 60), [store.workspace, query]);
  const active = hits[Math.min(cursor, hits.length - 1)];

  const open = (hit: Hit) => {
    onClose();
    // Jump to the whole document rather than the current zoom, so the hit is
    // reachable no matter where the reader was.
    store.docs.select(hit.docId, { zoomId: store.workspace.docs[hit.docId].rootId });
    store.edit((doc) => reveal(doc, hit.nodeId), { transient: true });
    store.requestFocus(hit.nodeId);
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel search-panel" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={input}
          className="search-input"
          placeholder="검색 — 단어 또는 #태그"
          value={query}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((value) => Math.min(value + 1, hits.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((value) => Math.max(value - 1, 0));
            }
            if (event.key === "Enter" && active) {
              event.preventDefault();
              open(active);
            }
          }}
        />

        <div className="search-results">
          {query.trim() === "" ? (
            <p className="search-empty">검색어를 입력하세요. `#태그`로 태그만 찾을 수 있습니다.</p>
          ) : hits.length === 0 ? (
            <p className="search-empty">결과가 없습니다.</p>
          ) : (
            hits.map((hit, index) => (
              <button
                key={`${hit.docId}:${hit.nodeId}`}
                type="button"
                className={`search-hit${hit === active ? " search-hit-active" : ""}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => open(hit)}
              >
                <span className="search-hit-text">{hit.text || "(빈 항목)"}</span>
                <span className="search-hit-trail">
                  {[hit.docTitle, ...hit.trail.slice(-2)].join(" › ")}
                </span>
              </button>
            ))
          )}
        </div>
        <footer className="search-foot">{hits.length}건 · ↑↓ 이동 · Enter 열기 · Esc 닫기</footer>
      </div>
    </div>
  );
}
