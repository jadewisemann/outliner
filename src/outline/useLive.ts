import { useRef } from "react";
import type { Store } from "../store";
import type { Doc, Id, Row as RowModel, Workspace } from "../types";

/**
 * The latest render's values, refreshed every render. Handlers live for the
 * lifetime of the component (a new `api` object per keystroke would defeat
 * the memo on every row), so they read the current rows, doc and zoom from
 * here instead of baking them into closures.
 */
export type Live = {
  rows: RowModel[];
  doc: Doc;
  workspace: Workspace;
  zoomId: Id;
  focus: Store["focus"];
};

/** Like a RefObject, but `current` can never be null — it is set every render. */
export type LiveRef = { readonly current: Live };

export function useLive(value: Live): LiveRef {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
