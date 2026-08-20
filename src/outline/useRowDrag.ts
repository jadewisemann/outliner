import { useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import type { Store } from "../store";
import type { Id, Row as RowModel } from "../types";
import type { DropPosition, RowApi } from "./components/Row";
import { reparent } from "./tree";

/**
 * Drag & drop of a row by its bullet: the drag source, the spot the pointer
 * is over, and the drop itself. Owns its two refs and the `dropSpot` state;
 * everything else it reads through `rows`, so the api fragment stays one
 * object for the lifetime of the component — a new one per keystroke would
 * defeat the memo on every row.
 */
export function useRowDrag(
  rows: RefObject<RowModel[]>,
  edit: Store["edit"]
): {
  dropSpot: { id: Id; position: DropPosition } | null;
  onDragEnd(): void;
  api: Pick<RowApi, "dragStart" | "dragOver" | "drop">;
} {
  const [dropSpot, setDropSpot] = useState<{ id: Id; position: DropPosition } | null>(null);
  const dragId = useRef<Id | null>(null);
  const dropRef = useRef<{ id: Id; position: DropPosition } | null>(null);

  const api = useMemo(
    () => ({
      dragStart(event: DragEvent, id: Id) {
        dragId.current = id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      },
      dragOver(event: DragEvent, row: RowModel) {
        if (!dragId.current) return;
        event.preventDefault();
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = (event.clientY - box.top) / box.height;
        const indented = event.clientX - box.left > 40 + row.depth * 22;
        const next = { id: row.id, position: (ratio < 0.35 ? "before" : indented ? "child" : "after") as DropPosition };
        if (dropRef.current?.id !== next.id || dropRef.current.position !== next.position) {
          dropRef.current = next;
          setDropSpot(next);
        }
      },
      drop(event: DragEvent) {
        event.preventDefault();
        const source = dragId.current;
        const spot = dropRef.current;
        dragId.current = null;
        dropRef.current = null;
        setDropSpot(null);
        if (!source || !spot || source === spot.id) return;
        const target = rows.current?.find((row) => row.id === spot.id);
        if (!target) return;
        edit((current) =>
          spot.position === "child"
            ? reparent(current, source, spot.id, 0)
            : reparent(current, source, target.parentId, target.index + (spot.position === "after" ? 1 : 0))
        );
      }
    }),
    [rows, edit]
  );

  return {
    dropSpot,
    onDragEnd() {
      dragId.current = null;
      dropRef.current = null;
      setDropSpot(null);
    },
    api
  };
}
