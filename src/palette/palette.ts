import { fuzzy } from "../outline/markdown";
import { ancestors } from "../outline/tree";
import { allTags } from "../search/search";
import { docList, realDocs, type Id, type Workspace } from "../types";

/**
 * What the palette offers, and how a query narrows it.
 *
 * The shape is a code editor's quick-open rather than a search box: one key
 * opens it, a prefix picks what is being looked for, and everything the app
 * can do is reachable from it. Anything that lives only in a menu is
 * unreachable from the keyboard, which is the thing this is here to fix.
 */

export type Command = {
  id: string;
  label: string;
  /** Shown greyed on the right — a shortcut, or what the command will act on. */
  hint?: string;
  run(): void;
};

export type Suggestion =
  | { kind: "command"; key: string; label: string; hint?: string; hits: number[]; command: Command }
  | { kind: "doc"; key: string; label: string; hint?: string; hits: number[]; docId: Id }
  | { kind: "item"; key: string; label: string; hint?: string; hits: number[]; docId: Id; nodeId: Id }
  | { kind: "tag"; key: string; label: string; hint?: string; hits: number[]; tag: string }
  | { kind: "move"; key: string; label: string; hint?: string; hits: number[]; docId: Id }
  | { kind: "saved"; key: string; label: string; hint?: string; hits: number[]; query: string };

export type Mode = "mixed" | "command" | "tag" | "move";

const LIMIT = 40;
/** Bounds the scan on a large workspace; the ranked head is what gets shown. */
const SCAN_LIMIT = 600;

export function modeOf(query: string): Mode {
  // Checked before ">", since ">>" is the longer prefix.
  if (query.startsWith(">>")) return "move";
  if (query.startsWith(">")) return "command";
  if (query.startsWith("#")) return "tag";
  return "mixed";
}

/** The query with its mode prefix removed. */
export function termOf(query: string): string {
  const mode = modeOf(query);
  if (mode === "mixed") return query.trim();
  return query.slice(mode === "move" ? 2 : 1).trim();
}

export function suggest(
  workspace: Workspace,
  query: string,
  commands: Command[],
  recentDocIds: Id[] = []
): Suggestion[] {
  const mode = modeOf(query);
  const term = termOf(query);

  if (mode === "command") return rank(commands.map(asCommand), term);
  if (mode === "move") {
    return rank(
      realDocs(workspace)
        .map((doc) => ({
          kind: "move" as const,
          key: `move:${doc.id}`,
          label: doc.title || "Untitled",
          hint: "여기로 이동",
          hits: [],
          docId: doc.id
        })),
      term
    );
  }
  if (mode === "tag") {
    return rank(
      allTags(workspace).map((entry) => ({
        kind: "tag" as const,
        key: `tag:${entry.tag}`,
        label: entry.tag,
        hint: `${entry.count}`,
        hits: [],
        tag: entry.tag
      })),
      `#${term}`
    );
  }

  // Nothing typed: the documents most recently opened, the way quick-open
  // offers recent files before it offers a search.
  if (term === "") {
    const byId = new Map(realDocs(workspace).map((doc) => [doc.id, doc]));
    const recent = recentDocIds.map((id) => byId.get(id)).filter((doc) => doc !== undefined);
    const rest = realDocs(workspace).filter((doc) => !recentDocIds.includes(doc.id));
    return [...recent, ...rest]
      .slice(0, LIMIT)
      .map((doc) => asDoc(doc.id, doc.title, recentDocIds.includes(doc.id) ? "최근" : undefined));
  }

  const saved = rank(
    docList(workspace)
      .filter((doc) => doc.kind === "search" && doc.deleted === null)
      .map((doc) => ({
        kind: "saved" as const,
        key: `saved:${doc.id}`,
        label: doc.title,
        hint: doc.query,
        hits: [],
        query: doc.query
      })),
    term
  );

  const docs = rank(realDocs(workspace).map((doc) => asDoc(doc.id, doc.title)), term);

  const items: Suggestion[] = [];
  for (const doc of realDocs(workspace)) {
    for (const node of Object.values(doc.nodes)) {
      if (node.id === doc.rootId || node.text === "") continue;
      if (items.length >= SCAN_LIMIT) break;
      items.push({
        kind: "item",
        key: `item:${doc.id}:${node.id}`,
        label: node.text,
        hint: [doc.title, ...trailOf(workspace, doc.id, node.id).slice(-1)].join(" › "),
        hits: [],
        docId: doc.id,
        nodeId: node.id
      });
    }
  }

  // Documents come first at equal strength: opening the right file is the more
  // common intent, and an item is always reachable from inside one.
  return [...saved, ...docs, ...rank(items, term)].slice(0, LIMIT);
}

function asCommand(command: Command): Suggestion {
  return { kind: "command", key: `cmd:${command.id}`, label: command.label, hint: command.hint, hits: [], command };
}

function asDoc(docId: Id, title: string, hint?: string): Suggestion {
  return { kind: "doc", key: `doc:${docId}`, label: title || "Untitled", hint, hits: [], docId };
}

function trailOf(workspace: Workspace, docId: Id, nodeId: Id): string[] {
  const doc = workspace.docs[docId];
  if (!doc) return [];
  return ancestors(doc, nodeId)
    .filter((id) => id !== doc.rootId)
    .map((id) => doc.nodes[id]?.text ?? "")
    .filter(Boolean);
}

function rank(entries: Suggestion[], term: string): Suggestion[] {
  if (term === "") return entries.slice(0, LIMIT);
  return entries
    .map((entry) => ({ entry, match: fuzzy(entry.label, term) }))
    .filter((scored) => scored.match !== null)
    .sort((a, b) => b.match!.score - a.match!.score)
    .slice(0, LIMIT)
    .map((scored) => ({ ...scored.entry, hits: scored.match!.hits }));
}

/* ------------------------------------------------------------------ */
/* recently opened                                                     */
/* ------------------------------------------------------------------ */

const RECENT_KEY = "outliner:recent";
const RECENT_MAX = 8;

/** Device-local on purpose: which document *this* machine was last in. */
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
