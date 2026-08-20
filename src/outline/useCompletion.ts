import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { allTags } from "../search/search";
import { docList, type Id, type Row as RowModel } from "../types";
import type { RowApi } from "./components/Row";
import { applyCompletion, completionAt, fuzzy, type Selection, type Trigger } from "./markdown";
import type { LiveRef } from "./useLive";

/** One offer from `[[` or `#`: what it reads as, and what it writes. */
export type Choice = { label: string; insert: string; hint?: string };

/** What `[[` or `#` is offering right now, and where it will be inserted. */
export type Completion = { rowId: Id; trigger: Trigger; items: Choice[]; index: number };

const COMPLETION_LIMIT = 8;

/**
 * The `[[`/`#` completion list: what is on offer, which entry is lit, and the
 * keys that drive it while it is open. `onKeyDown` says whether it ate the
 * key, so the caller's other bindings stay unreachable until the list closes.
 */
export function useCompletion(
  live: LiveRef,
  applyText: (element: HTMLTextAreaElement, id: Id, next: Selection, coalesceKey?: string) => void
): {
  completion: Completion | null;
  refresh(rowId: Id): void;
  clear(): void;
  onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): boolean;
  api: Pick<RowApi, "pickCompletion" | "hoverCompletion">;
} {
  const [completion, setCompletion] = useState<Completion | null>(null);
  const completionRef = useRef(completion);
  completionRef.current = completion;

  /**
   * `[[` offers documents *and* rows, because "link to the thing I mean" is
   * one intent — but they are written differently, so each offer carries the
   * literal text it will insert.
   */
  const candidates = useCallback(
    (trigger: Trigger): Choice[] => {
      const workspace = live.current.workspace;
      const pool: Choice[] = [];

      if (trigger.kind === "tag") {
        for (const entry of allTags(workspace)) pool.push({ label: entry.tag, insert: entry.tag });
      } else {
        for (const entry of docList(workspace)) {
          if (entry.kind === "doc") pool.push({ label: entry.title, insert: `[[${entry.title}]]`, hint: "문서" });
        }
        for (const entry of docList(workspace)) {
          if (entry.kind === "folder") continue;
          for (const node of Object.values(entry.nodes)) {
            if (node.id === entry.rootId || node.text.trim() === "") continue;
            pool.push({ label: node.text, insert: `((${node.id}))`, hint: entry.title });
          }
        }
      }

      const term = trigger.kind === "tag" ? `#${trigger.query}` : trigger.query;
      return pool
        .map((choice) => ({ choice, match: fuzzy(choice.label, term) }))
        .filter((entry) => entry.match !== null)
        .sort((a, b) => b.match!.score - a.match!.score)
        .slice(0, COMPLETION_LIMIT)
        .map((entry) => entry.choice);
    },
    [live]
  );

  /**
   * Recomputed from the live field rather than from the store: the store lags
   * a keystroke behind and does not know where the caret is.
   */
  const refresh = useCallback(
    (rowId: Id) => {
      const element = document.activeElement;
      if (!(element instanceof HTMLTextAreaElement) || element.selectionStart !== element.selectionEnd) {
        setCompletion(null);
        return;
      }
      const trigger = completionAt(element.value, element.selectionStart);
      const items = trigger ? candidates(trigger) : [];
      setCompletion(trigger && items.length > 0 ? { rowId, trigger, items, index: 0 } : null);
    },
    [candidates]
  );

  const clear = useCallback(() => setCompletion(null), []);

  const accept = useCallback(
    (element: HTMLTextAreaElement, rowId: Id, choice: Choice) => {
      const open = completionRef.current;
      if (!open) return;
      applyText(element, rowId, applyCompletion(element.value, element.selectionStart, open.trigger, choice.insert));
      setCompletion(null);
    },
    [applyText]
  );

  // The completion list owns the arrows and Enter while it is open, the way
  // it does in an editor.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): boolean => {
      const open = completionRef.current;
      if (!open || open.rowId !== row.id) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setCompletion({ ...open, index: (open.index + step + open.items.length) % open.items.length });
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        accept(element, row.id, open.items[open.index]);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCompletion(null);
        return true;
      }
      return false;
    },
    [accept]
  );

  const api = useMemo(
    () => ({
      pickCompletion(id: Id, choice: Choice) {
        const element = document.activeElement;
        if (element instanceof HTMLTextAreaElement) accept(element, id, choice);
      },
      hoverCompletion(index: number) {
        setCompletion((open) => (open ? { ...open, index } : open));
      }
    }),
    [accept]
  );

  return { completion, refresh, clear, onKeyDown, api };
}
