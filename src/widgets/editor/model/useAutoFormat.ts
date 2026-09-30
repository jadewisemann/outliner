import { useCallback, useRef, type KeyboardEvent } from "react";
import { patchNode, type Id, type Node, type Row as RowModel } from "@/entities/outline";
import { autoDate, autoFormat } from "@/entities/text";
import type { Store } from "@/entities/workspace";
import { writeField } from "../ui/Editable";
import type { LiveRef } from "./useLive";

/** Enough to put back a markdown prefix the editor swallowed one keystroke ago. */
type AutoUndo = { rowId: Id; prefix: string; node?: Partial<Node>; parentId?: Id; parent?: Partial<Node> };

/**
 * Typing that turns into formatting — a markdown prefix on the space that
 * completes it, today's date on `!!` — and the one Backspace that puts a
 * swallowed prefix back. Owns the memory of what the last prefix swallowed.
 *
 * Two calls rather than one, each saying whether it ate the key, because they
 * sit at two places in the row's key order. The revert runs before every
 * binding, since it also forgets the prefix on any other key. The expansions
 * run after the formatting, structure, list and colour bindings: keys are
 * rebindable, and `!!` or Space must not take a key someone bound to those.
 */
export function useAutoFormat(
  live: LiveRef,
  edit: Store["edit"],
  clearCompletion: () => void
): {
  undoPrefix(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): boolean;
  expand(event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): boolean;
} {
  const autoUndo = useRef<AutoUndo | null>(null);

  const undoPrefix = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): boolean => {
      const caret = element.selectionStart;
      const noRange = element.selectionStart === element.selectionEnd;
      const stop = () => event.preventDefault();

      // One Backspace puts back a prefix the editor swallowed. Without it the
      // only way out of an unwanted heading is to notice which key did it.
      const swallowed = autoUndo.current;
      if (event.key === "Backspace" && noRange && caret === 0 && swallowed?.rowId === row.id) {
        stop();
        autoUndo.current = null;
        const restored = swallowed.prefix + element.value;
        writeField(element, restored, swallowed.prefix.length);
        edit((current) => {
          const reverted = patchNode(current, row.id, { text: restored, ...swallowed.node });
          return swallowed.parentId && swallowed.parent
            ? patchNode(reverted, swallowed.parentId, swallowed.parent)
            : reverted;
        });
        return true;
      }
      // Any other key accepts the conversion: from then on Backspace is Backspace.
      if (event.key !== "Backspace") autoUndo.current = null;
      return false;
    },
    [edit]
  );

  const expand = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement, row: RowModel): boolean => {
      const caret = element.selectionStart;
      const noRange = element.selectionStart === element.selectionEnd;
      const stop = () => event.preventDefault();

      // `!!` writes today's date the way Dynalist does, at the start of a word
      // only (`autoDate`). The clock is read at the keypress, not at render.
      const dated = event.key === "!" && noRange ? autoDate(element.value, caret, Date.now()) : null;
      if (dated) {
        stop();
        writeField(element, dated.text, dated.start, dated.end);
        edit((current) => patchNode(current, row.id, { text: dated.text }));
        clearCompletion();
        return true;
      }

      // Markdown as you type. Fires on the space that completes the prefix,
      // and the space itself is never inserted — it was punctuation, not text.
      if (event.key === " " && noRange) {
        const applied = autoFormat(element.value, caret);
        if (applied) {
          stop();
          const node = live.current.doc.nodes[row.id];
          const parentId = applied.parent ? node?.parent ?? undefined : undefined;
          autoUndo.current = {
            rowId: row.id,
            prefix: applied.prefix,
            // Whatever the rule is about to overwrite, not a fixed field: a
            // prefix can set a heading, a quote, or a flag on the parent.
            node: applied.node ? pick(node, applied.node) : undefined,
            parentId,
            parent: parentId ? pick(live.current.doc.nodes[parentId], applied.parent!) : undefined
          };
          writeField(element, applied.text, 0);
          edit((current) => {
            const patched = patchNode(current, row.id, { text: applied.text, ...applied.node });
            return parentId ? patchNode(patched, parentId, applied.parent!) : patched;
          });
          clearCompletion();
          return true;
        }
      }
      return false;
    },
    [live, edit, clearCompletion]
  );

  return { undoPrefix, expand };
}

/** The values a patch is about to overwrite, so one Backspace can put them back. */
function pick(node: Node | undefined, patch: Partial<Node>): Partial<Node> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) out[key] = node?.[key as keyof Node];
  return out as Partial<Node>;
}
