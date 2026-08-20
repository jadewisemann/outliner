import { useCallback, useMemo, useState, type MouseEvent } from "react";
import type { Store } from "../store";
import type { Row as RowModel } from "../types";
import type { RowApi } from "./components/Row";
import type { MenuSpot } from "./components/RowMenu";

/**
 * The context menu on a row's marker: where it is open, and its way in and
 * out. Focus moves to the row first, so the menu's edits land on the row the
 * pointer picked.
 */
export function useRowMenu(requestFocus: Store["requestFocus"]): {
  menu: MenuSpot | null;
  closeMenu(): void;
  api: Pick<RowApi, "openMenu">;
} {
  const [menu, setMenu] = useState<MenuSpot | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const api = useMemo(
    () => ({
      openMenu(event: MouseEvent, row: RowModel) {
        event.preventDefault();
        event.stopPropagation();
        requestFocus(row.id);
        setMenu({ row, x: event.clientX, y: event.clientY });
      }
    }),
    [requestFocus]
  );

  return { menu, closeMenu, api };
}
