import { useCallback, useMemo, useRef, useState } from "react";
import { Backlinks } from "@/widgets/backlinks";
import { DocTitle, Outline } from "@/widgets/editor";
import { Sidebar } from "@/widgets/sidebar";
import { Topbar } from "@/widgets/topbar";
import { Settings, useAppearance, useTheme } from "@/features/appearance";
import { FilterBar } from "@/features/filter";
import { HistoryPanel } from "@/features/history";
import { buildCommands, Palette } from "@/features/palette";
import { SearchPanel } from "@/features/search";
import { Keys, Shortcuts, useKeymapSetting } from "@/features/shortcuts";
import { SyncSettings, type OauthPrefill } from "@/features/sync-settings";
import { ImportPickers, useTransfer } from "@/features/transfer";
import { StorageWarnings, useStore } from "@/entities/workspace";
import { useDay } from "@/shared/lib/useDay";
import { jumpToNode, openDocByTitle } from "../model/navigate";
import { useOauthReturn } from "../model/useOauthReturn";
import { useShareCapture } from "../model/useShareCapture";
import { useWindowKeys } from "../model/useWindowKeys";

type Overlay =
  | { kind: "palette"; query: string }
  | { kind: "search"; query: string }
  | { kind: "shortcuts" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "keys" }
  | { kind: "sync"; oauth?: OauthPrefill }
  | null;

/**
 * The one screen: the sidebar, the page (toolbar, filter, title, outline,
 * backlinks) and whichever panel is open over it. Everything here is
 * composition; what each part does lives in its slice (docs/adr/0013-fsd-light.md).
 */
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
        ? buildCommands(
            store,
            {
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
            },
            keymap
          )
        : [],
    [store, transfer.exportAs, openPalette, toggleTheme, keymap]
  );

  useShareCapture(store.ready, storeRef);
  useOauthReturn((oauth) => setOverlay({ kind: "sync", oauth }));
  useWindowKeys({ keymap, openPalette, openSearch, setOverlay, setSidebarOpen, filterInput, storeRef });

  if (!store.ready) return <div className="booting">불러오는 중…</div>;
  const close = () => setOverlay(null);

  return (
    <div className={`app${sidebarOpen ? " app-with-sidebar" : ""}`}>
      {sidebarOpen ? <Sidebar store={store} onTagClick={openSearch} onSearch={openSearch} /> : null}

      <main className="main" ref={scroller}>
        <StorageWarnings store={store} />
        <Topbar
          store={store}
          keymap={keymap}
          theme={theme}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onToggleTheme={toggleTheme}
          onOpenPalette={() => openPalette()}
          onOpenSearch={() => openSearch()}
          onOpenSync={() => setOverlay({ kind: "sync" })}
          onOpenShortcuts={() => setOverlay({ kind: "shortcuts" })}
          onExport={transfer.exportAs}
          onImportFile={() => fileInput.current?.click()}
          onImportFolder={() => folderInput.current?.click()}
        />
        <FilterBar store={store} keymap={keymap} inputRef={filterInput} />
        <DocTitle store={store} />
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

      <ImportPickers fileRef={fileInput} folderRef={folderInput} onFiles={(files) => void transfer.importFiles(files)} />

      {overlay?.kind === "palette" ? (
        <Palette store={store} commands={commands} initialQuery={overlay.query} onClose={close} onSearch={openSearch} />
      ) : null}
      {overlay?.kind === "search" ? <SearchPanel store={store} initialQuery={overlay.query} onClose={close} /> : null}
      {overlay?.kind === "shortcuts" ? <Shortcuts keymap={keymap} onClose={close} /> : null}
      {overlay?.kind === "history" ? <HistoryPanel store={store} onClose={close} /> : null}
      {overlay?.kind === "settings" ? <Settings appearance={appearance} onChange={setAppearance} onClose={close} /> : null}
      {overlay?.kind === "keys" ? <Keys keymap={keymap} onChange={setKeymap} onClose={close} /> : null}
      {overlay?.kind === "sync" ? <SyncSettings store={store} oauth={overlay.oauth} onClose={close} /> : null}
    </div>
  );
}
