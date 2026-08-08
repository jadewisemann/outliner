import { useCallback, useEffect, useRef, useState } from "react";
import { detectFormat, exportBackup, exportDoc, importDoc, parseBackup, type Format } from "../core/formats";
import { useStore } from "../core/store";
import { ancestors, setCollapsedDeep } from "../core/tree";
import { docList } from "../core/types";
import { Outline } from "./Outline";
import { SearchPanel } from "./SearchPanel";
import { Shortcuts } from "./Shortcuts";
import { Sidebar } from "./Sidebar";
import { SyncBadge, SyncSettings } from "./SyncSettings";

type Overlay = { kind: "search"; query: string } | { kind: "shortcuts" } | { kind: "sync" } | null;

export function App() {
  const store = useStore();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("outliner:theme") as "light" | "dark") ?? "light"
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("outliner:theme", theme);
  }, [theme]);

  // Stable identities: these reach every row and the window listener, and a
  // new function each render would defeat the memo on Row.
  const storeRef = useRef(store);
  storeRef.current = store;
  const openSearch = useCallback((query = "") => setOverlay({ kind: "search", query }), []);
  const openDoc = useCallback((title: string) => openDocByTitle(storeRef.current, title), []);


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The IME owns the keyboard while a syllable is being composed.
      if (event.isComposing) return;
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
        if (event.shiftKey) storeRef.current.redo();
        else storeRef.current.undo();
        return;
      }
      if (mod && event.key === "\\") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  if (!store.ready) return <div className="booting">불러오는 중…</div>;

  const { doc, view } = store;
  const trail = ancestors(doc, view.zoomId).concat(view.zoomId).filter((id) => id !== doc.rootId);
  const zoomed = view.zoomId !== doc.rootId;

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    // Some browsers need the anchor in the document, and revoking the URL in
    // the same tick can cancel the download before it starts.
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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

      <main className="main" ref={scroller}>
        {store.saveFailed ? (
          <p className="save-warning" role="alert">
            이 기기에 저장하지 못하고 있습니다. 저장 공간이 가득 찼을 수 있습니다 — 백업을 내려받아 두세요.
          </p>
        ) : null}
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
            <SyncBadge store={store} onClick={() => setOverlay({ kind: "sync" })} />
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
                <button type="button" onClick={() => setOverlay({ kind: "sync" })}>
                  동기화 설정
                </button>
                <button type="button" onClick={() => setOverlay({ kind: "shortcuts" })}>
                  단축키 (⌘/)
                </button>
              </div>
            </details>
          </div>
        </header>

        {zoomed ? <h1 className="zoom-title">{doc.nodes[view.zoomId]?.text || "(빈 항목)"}</h1> : null}

        <Outline store={store} scrollRef={scroller} onTagClick={openSearch} onDocLinkClick={openDoc} />
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
      {overlay?.kind === "sync" ? <SyncSettings store={store} onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}

/** `[[Title]]` opens the matching document, creating it when missing. */
function openDocByTitle(store: ReturnType<typeof useStore>, title: string) {
  const match = docList(store.workspace).find((doc) => doc.title.toLowerCase() === title.toLowerCase());
  if (match) store.docs.select(match.id);
  else store.docs.create(title);
}
