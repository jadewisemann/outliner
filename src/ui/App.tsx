import { useCallback, useEffect, useRef, useState } from "react";
import { detectFormat, exportBackup, exportDoc, importDoc, parseBackup, type Format } from "../core/formats";
import { useStore } from "../core/store";
import { ancestors, setCollapsedDeep } from "../core/tree";
import type { Id } from "../core/types";
import { Outline } from "./Outline";
import { SearchPanel } from "./SearchPanel";
import { Shortcuts } from "./Shortcuts";
import { Sidebar } from "./Sidebar";

type Overlay = { kind: "search"; query: string } | { kind: "shortcuts" } | null;

export function App() {
  const store = useStore();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("outliner:theme") as "light" | "dark") ?? "light"
  );
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("outliner:theme", theme);
  }, [theme]);

  const openSearch = useCallback((query = "") => setOverlay({ kind: "search", query }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "k" || event.key === "f")) {
        event.preventDefault();
        openSearch();
        return;
      }
      if (mod && event.key === "/") {
        event.preventDefault();
        setOverlay({ kind: "shortcuts" });
        return;
      }
      if (mod && event.key === "z") {
        // Plain inputs (search, rename) keep their native undo.
        if ((event.target as HTMLElement).tagName === "INPUT") return;
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && event.key === "\\") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, openSearch]);

  if (!store.ready) return <div className="booting">불러오는 중…</div>;

  const { doc, view } = store;
  const trail = ancestors(doc, view.zoomId).concat(view.zoomId).filter((id) => id !== doc.rootId);
  const zoomed = view.zoomId !== doc.rootId;

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onExport = (format: Format | "backup") => {
    if (format === "backup") {
      download("outliner-backup.json", exportBackup(store.workspace), "application/json");
      return;
    }
    const extension = format === "opml" ? "opml" : format === "markdown" ? "md" : "txt";
    download(`${doc.title}.${extension}`, exportDoc(doc, format, view.zoomId), "text/plain");
  };

  const onImportFile = async (file: File) => {
    const content = await file.text();
    const backup = parseBackup(content);
    if (backup) {
      if (confirm("백업 파일입니다. 현재 워크스페이스를 덮어쓸까요?")) store.docs.replaceAll(backup);
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, "");
    store.docs.add(importDoc(title, content, detectFormat(file.name, content)));
  };

  return (
    <div className={`app${sidebarOpen ? " app-with-sidebar" : ""}`}>
      {sidebarOpen ? <Sidebar store={store} onTagClick={openSearch} /> : null}

      <main className="main">
        <header className="topbar">
          <button type="button" className="ghost" title="사이드바 (⌘\)" onClick={() => setSidebarOpen((open) => !open)}>
            ☰
          </button>

          <nav className="breadcrumb">
            <button type="button" onClick={() => store.setView({ zoomId: doc.rootId })}>
              {doc.title}
            </button>
            {trail.map((id) => (
              <span key={id}>
                <span className="breadcrumb-sep">›</span>
                <button type="button" onClick={() => store.setView({ zoomId: id })}>
                  {doc.nodes[id]?.text || "(빈 항목)"}
                </button>
              </span>
            ))}
          </nav>

          <div className="topbar-actions">
            <button type="button" className="ghost" title="검색 (⌘K)" onClick={() => openSearch()}>
              🔍
            </button>
            <button type="button" className="ghost" title="실행 취소 (⌘Z)" onClick={store.undo}>
              ↩
            </button>
            <button type="button" className="ghost" title="다시 실행 (⇧⌘Z)" onClick={store.redo}>
              ↪
            </button>
            <button
              type="button"
              className="ghost"
              title="모두 접기"
              onClick={() => store.edit((current) => setCollapsedDeep(current, view.zoomId, true), { transient: true })}
            >
              ⊟
            </button>
            <button
              type="button"
              className="ghost"
              title="모두 펼치기"
              onClick={() => store.edit((current) => setCollapsedDeep(current, view.zoomId, false), { transient: true })}
            >
              ⊞
            </button>

            <details className="menu">
              <summary className="ghost">⋯</summary>
              <div className="menu-body">
                <button type="button" onClick={() => onExport("markdown")}>
                  Markdown 내보내기
                </button>
                <button type="button" onClick={() => onExport("opml")}>
                  OPML 내보내기
                </button>
                <button type="button" onClick={() => onExport("text")}>
                  텍스트 내보내기
                </button>
                <button type="button" onClick={() => onExport("backup")}>
                  전체 백업 (JSON)
                </button>
                <hr />
                <button type="button" onClick={() => fileInput.current?.click()}>
                  파일 가져오기
                </button>
                <hr />
                <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? "밝은 테마" : "어두운 테마"}
                </button>
                <button type="button" onClick={() => setOverlay({ kind: "shortcuts" })}>
                  단축키 (⌘/)
                </button>
              </div>
            </details>
          </div>
        </header>

        {zoomed ? <h1 className="zoom-title">{doc.nodes[view.zoomId]?.text || "(빈 항목)"}</h1> : null}

        <Outline store={store} onTagClick={openSearch} onDocLinkClick={(title) => openDocByTitle(store, title)} />
      </main>

      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.txt,.opml,.xml,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onImportFile(file);
          event.target.value = "";
        }}
      />

      {overlay?.kind === "search" ? (
        <SearchPanel store={store} initialQuery={overlay.query} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay?.kind === "shortcuts" ? <Shortcuts onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}

/** `[[Title]]` opens the matching document, creating it when missing. */
function openDocByTitle(store: ReturnType<typeof useStore>, title: string) {
  const match = store.workspace.docOrder.find(
    (id: Id) => store.workspace.docs[id].title.toLowerCase() === title.toLowerCase()
  );
  if (match) store.docs.select(match);
  else store.docs.create(title);
}
