import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { ancestors } from "../outline/tree";
import { hasContent } from "../types";
import { Outline } from "../outline/components/Outline";
import { Palette } from "../palette/components/Palette";
import { buildCommands } from "../palette/commands";
import { SearchPanel } from "../search/components/SearchPanel";
import { HistoryPanel } from "../sync/components/HistoryPanel";
import { SyncBadge, SyncSettings } from "../sync/components/SyncSettings";
import type { OauthPrefill } from "../sync/syncForm";
import { useTransfer } from "../transfer/useTransfer";
import { IMPORT_ACCEPT } from "../transfer/formats";
import { Backlinks } from "./Backlinks";
import { Icon } from "./Icon";
import { useDay } from "../shared/useDay";
import { chordOf } from "../shared/keymap";
import { Keys } from "./Keys";
import { jumpToNode, openDocByTitle } from "./navigate";
import { Settings } from "./Settings";
import { Shortcuts } from "./Shortcuts";
import { Sidebar } from "./Sidebar";
import { useAppearance } from "./useAppearance";
import { useKeymapSetting } from "./useKeymapSetting";
import { useOauthReturn } from "./useOauthReturn";
import { useShareCapture } from "./useShareCapture";
import { useTheme } from "./useTheme";
import { useWindowKeys } from "./useWindowKeys";

type Overlay =
  | { kind: "palette"; query: string }
  | { kind: "search"; query: string }
  | { kind: "shortcuts" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "keys" }
  | { kind: "sync"; oauth?: OauthPrefill }
  | null;

export function App() {
  const store = useStore();
  const day = useDay();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const { theme, toggleTheme } = useTheme();
  const { appearance, setAppearance } = useAppearance();
  const { keymap, setKeymap } = useKeymapSetting(store.keymap, store.setKeymap);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLElement>(null);

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
            importFolder: () => folderInput.current?.click(),
            toggleTheme,
            toggleSidebar: () => setSidebarOpen((open) => !open),
            openSync: () => setOverlay({ kind: "sync" }),
            openHistory: () => setOverlay({ kind: "history" }),
            openSettings: () => setOverlay({ kind: "settings" }),
            openKeys: () => setOverlay({ kind: "keys" }),
            openShortcuts: () => setOverlay({ kind: "shortcuts" })
          }, keymap)
        : [],
    [store, transfer.exportAs, openPalette, toggleTheme, keymap]
  );

  useShareCapture(store.ready, storeRef);
  useOauthReturn((oauth) => setOverlay({ kind: "sync", oauth }));
  useWindowKeys({ keymap, openPalette, openSearch, setOverlay, setSidebarOpen, filterInput, storeRef });

  if (!store.ready) return <div className="booting">불러오는 중…</div>;

  const { doc, view } = store;
  const trail = ancestors(doc, view.zoomId).concat(view.zoomId).filter((id) => id !== doc.rootId);
  const zoomed = view.zoomId !== doc.rootId;

  return (
    <div className={`app${sidebarOpen ? " app-with-sidebar" : ""}`}>
      {sidebarOpen ? <Sidebar store={store} onTagClick={openSearch} onSearch={openSearch} /> : null}

      <main className="main" ref={scroller}>
        {store.saveFailed ? (
          <p className="save-warning" role="alert">
            이 기기에 저장하지 못하고 있습니다. 저장 공간이 가득 찼을 수 있습니다 — 백업을 내려받아 두세요.
          </p>
        ) : null}
        {/*
          Local-first means the only copy is here, and `best-effort` storage
          means the browser may delete it — under storage pressure, or after
          iOS Safari counts enough unopened days. Saying nothing would be
          claiming a guarantee the browser never gave. The three conditions are
          the loss itself: refused, no second copy, and something to lose.
        */}
        {store.storage.grade === "best-effort" && store.sync.status === "off" && hasContent(store.workspace) ? (
          <p className="save-warning" role="alert">
            이 브라우저가 저장을 보장하지 않습니다 — 저장 공간이 부족해지면 노트가 지워질 수 있습니다. 기기 간
            동기화를 켜거나 백업을 내려받아 두세요.
          </p>
        ) : null}
        <header className="topbar">
          <button type="button" className="ghost" title={withKey("사이드바", keymap.sidebar)} onClick={() => setSidebarOpen((open) => !open)}>
            <Icon name="menu" />
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
            {/*
              Undo, redo, fold and unfold used to sit here too. In an app where
              the palette reaches every command, a permanent seat in the chrome
              is not what makes a feature available — it is only what makes the
              bar look like a toolbar from another decade.
            */}
            <button type="button" className="ghost" title={withKey("팔레트", keymap.palette)} onClick={() => openPalette()}>
              <Icon name="command" />
            </button>
            <button type="button" className="ghost" title={withKey("검색", keymap.search)} onClick={() => openSearch()}>
              <Icon name="search" />
            </button>

            <details className="menu">
              <summary className="ghost">
                <Icon name="more" />
              </summary>
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
                <button type="button" onClick={() => folderInput.current?.click()}>
                  폴더 가져오기
                </button>
                <hr />
                <button type="button" onClick={toggleTheme}>
                  {theme === "dark" ? "밝은 테마" : "어두운 테마"}
                </button>
                <button type="button" onClick={() => setOverlay({ kind: "sync" })}>
                  동기화 설정
                </button>
                <button type="button" onClick={() => setOverlay({ kind: "shortcuts" })}>
                  {withKey("단축키", keymap.help)}
                </button>
              </div>
            </details>
          </div>
        </header>

        <div className={`filter-bar${view.filter !== "" ? " filter-bar-on" : ""}`}>
          <input
            ref={filterInput}
            className="filter-input"
            placeholder={`${withKey("이 문서 안에서 거르기", keymap.filter)} — is:incomplete, date:today, #태그, -제외`}
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

        {/* The page's own name, always — not a 13px crumb in the chrome. */}
        <div className={`doc-title${zoomed ? " doc-title-zoomed" : ""}`}>
          <h1>{zoomed ? doc.nodes[view.zoomId]?.text || "(빈 항목)" : doc.title}</h1>
        </div>

        {/* Keyed by the day: relative dates ("오늘") are words about today,
            and a new day re-renders every row that says one. */}
        <Outline
          key={day}
          store={store}
          scrollRef={scroller}
          onTagClick={openSearch}
          onDocLinkClick={openDoc}
          onItemLinkClick={openItem}
          onMoveRequest={() => openPalette(">>")}
          keymap={keymap}
        />
        <Backlinks store={store} onOpen={openItem} />
      </main>

      <input
        ref={fileInput}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) void transfer.importFiles(files);
          event.target.value = "";
        }}
      />

      {/*
        A second input rather than a flag on the first: `webkitdirectory` turns
        a file picker into a directory picker outright, so one input cannot
        offer both. It has no React prop and no `accept` the browser honours —
        `importFiles` does that filtering itself.
      */}
      <input
        ref={(element) => {
          folderInput.current = element;
          element?.setAttribute("webkitdirectory", "");
        }}
        type="file"
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
      {overlay?.kind === "shortcuts" ? <Shortcuts keymap={keymap} onClose={() => setOverlay(null)} /> : null}
      {overlay?.kind === "history" ? <HistoryPanel store={store} onClose={() => setOverlay(null)} /> : null}
      {overlay?.kind === "settings" ? (
        <Settings appearance={appearance} onChange={setAppearance} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay?.kind === "keys" ? (
        <Keys keymap={keymap} onChange={setKeymap} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay?.kind === "sync" ? (
        <SyncSettings store={store} oauth={overlay.oauth} onClose={() => setOverlay(null)} />
      ) : null}
    </div>
  );
}

/**
 * A control's label with the chord that does the same thing, read from the
 * active table like the help panel's: "팔레트 (⌘P)", or just "팔레트" when the
 * table leaves the action without a key.
 */
function withKey(label: string, spec: string): string {
  const chord = chordOf(spec);
  return chord ? `${label} (${chord})` : label;
}
