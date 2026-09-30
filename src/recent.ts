import type { Id } from "./types";

const RECENT_KEY = "outliner:recent";
const RECENT_MAX = 8;

/**
 * The documents most recently opened, newest first. Device-local on purpose:
 * which document *this* machine was last in. The palette offers them before
 * it offers a search, the way quick-open offers recent files.
 */
export function recentDocs(): Id[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is Id => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberDoc(id: Id): void {
  try {
    const next = [id, ...recentDocs().filter((known) => known !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the palette just opens on the full list */
  }
}
