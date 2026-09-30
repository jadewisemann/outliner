import { withChord, type Keymap } from "@/entities/keymap";
import { ancestors, type Format } from "@/entities/outline";
import type { Store } from "@/entities/workspace";
import { SyncBadge } from "@/features/sync-settings";
import { Icon } from "@/shared/ui/Icon";

type Props = {
  store: Store;
  keymap: Keymap;
  theme: "light" | "dark";
  onToggleSidebar(): void;
  onToggleTheme(): void;
  onOpenPalette(): void;
  onOpenSearch(): void;
  onOpenSync(): void;
  onOpenShortcuts(): void;
  onExport(format: Format | "backup"): void;
  onImportFile(): void;
  onImportFolder(): void;
};

/** The window's toolbar: the sidebar toggle, where the reader is, and a handful of ways out. */
export function Topbar({ store, keymap, theme, ...on }: Props) {
  const { doc, view } = store;
  const trail = ancestors(doc, view.zoomId).concat(view.zoomId).filter((id) => id !== doc.rootId);

  return (
    <header className="topbar">
      <button type="button" className="ghost" title={withChord("사이드바", keymap.sidebar)} onClick={on.onToggleSidebar}>
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
        <SyncBadge store={store} onClick={on.onOpenSync} />
        {/*
          Undo, redo, fold and unfold used to sit here too. In an app where
          the palette reaches every command, a permanent seat in the chrome
          is not what makes a feature available — it is only what makes the
          bar look like a toolbar from another decade.
        */}
        <button type="button" className="ghost" title={withChord("팔레트", keymap.palette)} onClick={on.onOpenPalette}>
          <Icon name="command" />
        </button>
        <button type="button" className="ghost" title={withChord("검색", keymap.search)} onClick={on.onOpenSearch}>
          <Icon name="search" />
        </button>

        <details className="menu">
          <summary className="ghost">
            <Icon name="more" />
          </summary>
          <div className="menu-body">
            <button type="button" onClick={() => on.onExport("markdown")}>
              Markdown 내보내기
            </button>
            <button type="button" onClick={() => on.onExport("opml")}>
              OPML 내보내기
            </button>
            <button type="button" onClick={() => on.onExport("text")}>
              텍스트 내보내기
            </button>
            <button type="button" onClick={() => on.onExport("backup")}>
              전체 백업 (JSON)
            </button>
            <hr />
            <button type="button" onClick={on.onImportFile}>
              파일 가져오기
            </button>
            <button type="button" onClick={on.onImportFolder}>
              폴더 가져오기
            </button>
            <hr />
            <button type="button" onClick={on.onToggleTheme}>
              {theme === "dark" ? "밝은 테마" : "어두운 테마"}
            </button>
            <button type="button" onClick={on.onOpenSync}>
              동기화 설정
            </button>
            <button type="button" onClick={on.onOpenShortcuts}>
              {withChord("단축키", keymap.help)}
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
