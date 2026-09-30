import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { matches, type Keymap } from "@/entities/keymap";
import { setCollapsedDeep } from "@/entities/outline";
import type { Store } from "@/entities/workspace";

type WindowKeys = {
  keymap: Keymap;
  openPalette: (query?: string) => void;
  openSearch: (query?: string) => void;
  /** Only for the help overlay; the palette and search come through their openers. */
  setOverlay: (overlay: { kind: "shortcuts" }) => void;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  filterInput: RefObject<HTMLInputElement>;
  storeRef: { readonly current: Store };
};

/**
 * The keys that mean the same thing wherever the caret is, read from the same
 * table as the row keys. Everything but `keymap` and the two openers is a
 * stable setter or ref, which is why the listener is only re-attached when
 * one of those three changes.
 */
export function useWindowKeys({
  keymap,
  openPalette,
  openSearch,
  setOverlay,
  setSidebarOpen,
  filterInput,
  storeRef
}: WindowKeys) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The IME owns the keyboard while a syllable is being composed.
      if (event.isComposing) return;
      const bound = (action: keyof Keymap) => matches(event, keymap[action]);

      // One palette, two ways in: the commands key opens it on the `>` prefix.
      if (bound("palette") || bound("commands")) {
        event.preventDefault();
        openPalette(bound("commands") ? ">" : "");
        return;
      }
      if (bound("search")) {
        event.preventDefault();
        openSearch();
        return;
      }
      // The filter narrows the document in place rather than opening a result
      // list: the rows stay where they are and stay editable.
      if (bound("filter")) {
        event.preventDefault();
        filterInput.current?.focus();
        filterInput.current?.select();
        return;
      }
      if (bound("help")) {
        event.preventDefault();
        setOverlay({ kind: "shortcuts" });
        return;
      }
      if (bound("undo") || bound("redo")) {
        // Plain inputs (search, rename) keep their native undo.
        if ((event.target as HTMLElement).tagName === "INPUT") return;
        event.preventDefault();
        if (bound("redo")) storeRef.current.redo();
        else storeRef.current.undo();
        return;
      }
      // Folding the whole zoom is a view action, not a row action, so it lives
      // here next to the other window-wide keys rather than in the row handler.
      if (bound("collapseAll") || bound("expandAll")) {
        event.preventDefault();
        const collapsed = bound("collapseAll");
        storeRef.current.edit(
          (doc) => setCollapsedDeep(doc, storeRef.current.view.zoomId, collapsed),
          { transient: true }
        );
        return;
      }
      if (bound("sidebar")) {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch, openPalette, keymap]);
}
