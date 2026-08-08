import { useEffect, useMemo, useRef, useState } from "react";
import { reveal } from "../../outline/tree";
import { Panel } from "../../shared/components/Panel";
import type { Store } from "../../store";
import { modeOf, recentDocs, suggest, termOf, type Command, type Suggestion } from "../palette";

type Props = {
  store: Store;
  commands: Command[];
  initialQuery: string;
  onClose: () => void;
  /** Tag clicks and `#` results run a search rather than jumping somewhere. */
  onSearch: (query: string) => void;
};

const HINTS: Record<ReturnType<typeof modeOf>, string> = {
  mixed: "문서와 항목 · `>` 명령 · `#` 태그",
  command: "명령",
  tag: "태그",
  move: "이 항목을 옮길 문서"
};

/**
 * One overlay for going somewhere and for doing something, the way a code
 * editor's palette works. A prefix picks which: `>` for commands, `#` for
 * tags, nothing for documents and items.
 */
export function Palette({ store, commands, initialQuery, onClose, onSearch }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const recent = useRef(recentDocs()).current;

  useEffect(() => {
    setQuery(initialQuery);
    input.current?.focus();
    input.current?.select();
  }, [initialQuery]);

  const results = useMemo(
    () => suggest(store.workspace, query, commands, recent),
    [store.workspace, query, commands, recent]
  );
  const active = results[Math.min(cursor, results.length - 1)];

  // Keeping the highlighted row on screen is the difference between a list you
  // can drive from the keyboard and one you have to look at.
  useEffect(() => {
    list.current?.querySelector(".palette-hit-active")?.scrollIntoView({ block: "nearest" });
  }, [cursor, results]);

  const run = (hit: Suggestion) => {
    onClose();
    if (hit.kind === "command") {
      hit.command.run();
      return;
    }
    if (hit.kind === "tag") {
      onSearch(hit.tag);
      return;
    }
    if (hit.kind === "doc") {
      store.docs.select(hit.docId);
      return;
    }
    if (hit.kind === "move") {
      const nodeId = store.view.focusId;
      if (nodeId) store.docs.moveToDoc(nodeId, hit.docId);
      return;
    }
    store.docs.select(hit.docId, { zoomId: store.workspace.docs[hit.docId].rootId });
    store.edit((doc) => reveal(doc, hit.nodeId), { transient: true });
    store.requestFocus(hit.nodeId);
  };

  return (
    <Panel className="palette-panel" label="팔레트" onClose={onClose}>
      <input
        ref={input}
        className="search-input"
        placeholder="어디로, 또는 무엇을 — `>` 명령, `>>` 항목 이동, `#` 태그"
        value={query}
        autoFocus
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
            event.preventDefault();
            setCursor((value) => Math.min(value + 1, results.length - 1));
          }
          if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
            event.preventDefault();
            setCursor((value) => Math.max(value - 1, 0));
          }
          if (event.key === "Enter" && active) {
            event.preventDefault();
            run(active);
          }
          // Nothing matched but something was typed: fall back to a full-text
          // search rather than making the keystrokes a dead end.
          if (event.key === "Enter" && !active && modeOf(query) === "mixed" && termOf(query) !== "") {
            event.preventDefault();
            onClose();
            onSearch(query);
          }
        }}
      />

      <div className="search-results" ref={list}>
        {results.length === 0 ? (
          <p className="search-empty">
            {termOf(query) === "" ? "문서가 없습니다." : "결과가 없습니다. Enter로 전체 검색."}
          </p>
        ) : (
          results.map((hit, index) => (
            <button
              key={hit.key}
              type="button"
              className={`palette-hit${hit === active ? " palette-hit-active" : ""}`}
              onMouseEnter={() => setCursor(index)}
              onClick={() => run(hit)}
            >
              <span className={`palette-kind palette-kind-${hit.kind}`}>{KIND_LABEL[hit.kind]}</span>
              <span className="palette-label">{highlight(hit.label, hit.hits)}</span>
              {hit.hint ? <span className="palette-hint">{hit.hint}</span> : null}
            </button>
          ))
        )}
      </div>

      <footer className="search-foot">
        {HINTS[modeOf(query)]} · ↑↓ 이동 · Enter 실행 · Esc 닫기
      </footer>
    </Panel>
  );
}

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  command: "명령",
  doc: "문서",
  item: "항목",
  tag: "태그",
  move: "이동"
};

/** Marks the characters the fuzzy matcher actually landed on. */
function highlight(label: string, hits: number[]) {
  if (hits.length === 0) return label;
  const marked = new Set(hits);
  const out: (string | JSX.Element)[] = [];
  let run = "";
  let runMarked = false;

  const flush = (at: number) => {
    if (run === "") return;
    out.push(runMarked ? <b key={at}>{run}</b> : run);
    run = "";
  };

  for (let at = 0; at < label.length; at += 1) {
    const isMarked = marked.has(at);
    if (isMarked !== runMarked) {
      flush(at);
      runMarked = isMarked;
    }
    run += label[at];
  }
  flush(label.length);
  return out;
}
