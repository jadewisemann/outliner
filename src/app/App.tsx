import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { ancestors, reveal, setCollapsedDeep } from "../outline/tree";
import { findNode } from "../search/links";
import { docList } from "../types";
import { Outline } from "../outline/components/Outline";
import { Palette } from "../palette/components/Palette";
import { buildCommands } from "../palette/commands";
import { SearchPanel } from "../search/components/SearchPanel";
import { completeGithubLogin, fetchGithubLogin } from "../sync/api/githubAuth";
import { SyncBadge, SyncSettings, type OauthPrefill } from "../sync/components/SyncSettings";
import { useTransfer } from "../transfer/useTransfer";
import { Backlinks } from "./Backlinks";
import { Shortcuts } from "./Shortcuts";
import { Sidebar } from "./Sidebar";

type Overlay =
  | { kind: "palette"; query: string }
  | { kind: "search"; query: string }
  | { kind: "shortcuts" }
  | { kind: "sync"; oauth?: OauthPrefill }
  | null;

export function App() {
  const store = useStore();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("outliner:theme") as "light" | "dark") ?? "light"
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const filterInput = useRef<HTMLInputElement>(null);
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
  const openPalette = useCallback((query = "") => setOverlay({ kind: "palette", query }), []);
  const openDoc = useCallback((title: string) => openDocByTitle(storeRef.current, title), []);
  const openItem = useCallback((id: string) => jumpToNode(storeRef.current, id), []);
  const transfer = useTransfer(store);

  const commands = useMemo(
    () =>
      store.ready
        ? buildCommands(store, {
            openPalette,
            exportAs: transfer.exportAs,
            importFile: () => fileInput.current?.click(),
            toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
            toggleSidebar: () => setSidebarOpen((open) => !open),
            openSync: () => setOverlay({ kind: "sync" }),
            openShortcuts: () => setOverlay({ kind: "shortcuts" })
          })
        : [],
    [store, transfer.exportAs, openPalette]
  );

  // Returning from GitHub's consent screen: finish the exchange and land the
  // user in the sync panel with the token already in place.
  useEffect(() => {
    void completeGithubLogin().then(async (token) => {
      if (!token) return;
      const login = await fetchGithubLogin(token);
      setOverlay({ kind: "sync", oauth: { token, login } });
    });
  }, []);


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The IME owns the keyboard while a syllable is being composed.
      if (event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      // ⌘K belongs to "link" inside a row, the way it does in every markdown
      // editor, so the palette takes the editor's keys instead.
      if (mod && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openPalette(event.shiftKey ? ">" : "");
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
        return;
      }
      // ⌘F filters the document in place rather than opening a result list:
      // the rows stay where they are and stay editable.
      if (mod && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        filterInput.current?.focus();
        filterInput.current?.select();
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
  }, [openSearch, openPalette]);

  if (!store.ready) return <div className="booting">불러오는 중…</div>;

  const { doc, view } = store;
  const trail = ancestors(doc, view.zoomId).concat(view.zoomId).filter((id) => id !== doc.rootId);
  const zoomed = view.zoomId !== doc.rootId;

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
            <button type="button" className="ghost" title="팔레트 (⌘P)" onClick={() => openPalette()}>
              ⌘
            </button>
            <button type="button" className="ghost" title="검색 (⌘⇧F)" onClick={() => openSearch()}>
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
                <button type="button" onClick={() => transfer.exportAs("markdown")}>
                  Markdown 내보내기
                </button>
                <button type="button" onClick={() => transfer.exportAs("opml")}>
                  OPML 내보내기
                </button>
                <button type="button" onClick={() => transfer.exportAs("text")}>
                  텍스트 내보내기
                </button>
                <button type="button" onClick={() => transfer.exportAs("backup")}>
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

        <div className={`filter-bar${view.filter !== "" ? " filter-bar-on" : ""}`}>
          <input
            ref={filterInput}
            className="filter-input"
            placeholder="이 문서 안에서 거르기 (⌘F) — is:incomplete, #태그, -제외"
            value={view.filter}
            onChange={(event) => store.setView({ filter: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              store.setView({ filter: "" });
              event.currentTarget.blur();
            }}
          />
          {view.filter !== "" ? (
            <>
              <span className="filter-count">{store.rows.length}행</span>
              <button type="button" className="ghost" onClick={() => store.setView({ filter: "" })}>
                ×
              </button>
            </>
          ) : null}
          {view.hideCompleted ? (
            <button type="button" className="filter-flag" onClick={() => store.setView({ hideCompleted: false })}>
              완료 숨김 ×
            </button>
          ) : null}
        </div>

        {zoomed ? <h1 className="zoom-title">{doc.nodes[view.zoomId]?.text || "(빈 항목)"}</h1> : null}

        <Outline
          store={store}
          scrollRef={scroller}
          onTagClick={openSearch}
          onDocLinkClick={openDoc}
          onItemLinkClick={openItem}
          onMoveRequest={() => openPalette(">>")}
        />
        <Backlinks store={store} onOpen={openItem} />
      </main>

      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.txt,.opml,.xml,.json"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) void transfer.importFiles(files);
          event.target.value = "";
        }}
      />

      {overlay?.kind === "palette" ? (
        <Palette
          store={store}
          commands={commands}
          initialQuery={overlay.query}
          onClose={() => setOverlay(null)}
          onSearch={openSearch}
        />
      ) : null}
      {overlay?.kind === "search" ? (
        <SearchPanel store={store} initialQuery={overlay.query} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay?.kind === "shortcuts" ? <Shortcuts onClose={() => setOverlay(null)} /> : null}
      {overlay?.kind === "sync" ? (
        <SyncSettings store={store} oauth={overlay.oauth} onClose={() => setOverlay(null)} />
      ) : null}
    </div>
  );
}

/** `[[Title]]` opens the matching document, creating it when missing. */
function openDocByTitle(store: ReturnType<typeof useStore>, title: string) {
  const match = docList(store.workspace).find((doc) => doc.title.toLowerCase() === title.toLowerCase());
  if (match) store.docs.select(match.id);
  else store.docs.create(title);
}

/** `((id))` and backlinks both land the caret on a row wherever it lives. */
function jumpToNode(store: ReturnType<typeof useStore>, id: string) {
  const found = findNode(store.workspace, id);
  if (!found) return;
  store.docs.select(found.docId, { zoomId: store.workspace.docs[found.docId].rootId });
  store.edit((doc) => reveal(doc, id), { transient: true });
  store.requestFocus(id);
}
