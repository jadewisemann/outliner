import { keyBetween, keysAfter } from "@/shared/lib/order";
import { linkChildren } from "./tree";
import { makeWorkspace, stamp, type Doc, type Id, type Node, type Workspace } from "./types";
import { readWorkspace } from "./validate";

/**
 * Stored data as the app may use it: brought up to the current shape, then
 * validated. The order is the point — validation after the upgrade is what
 * lets the additive steps below be bare version bumps. `null` when no usable
 * document is left; but anything `migrate` cannot read at all comes back as a
 * fresh workspace, so a caller with nothing stored has to say so first.
 */
export function readStored(raw: unknown): Workspace | null {
  return readWorkspace(migrate(raw));
}

/**
 * Brings stored data up to the current shape.
 *
 * Version 3 kept sibling order in a `children` array only. Version 4 adds the
 * `parent`/`sort`/stamp fields that make a document mergeable, so the upgrade
 * walks each tree once and fills them in.
 *
 * Version 5 only adds fields — list flags, colours, folders, creation stamps —
 * and every one of them has a default that `validate.ts` already supplies, so
 * the upgrade is a version bump. Storage always passes through validation on
 * the way in, which is what makes that safe.
 *
 * Version 7 adds `Doc.inbox` the same way. Nothing is marked after an upgrade,
 * which is the honest answer: the old workspace never said where a capture
 * should go, and guessing from a title would be picking a document for the
 * user. The first capture settles it instead.
 *
 * Version 8 adds `keymap`, and leaves it null for the same reason: an upgraded
 * workspace has never said which keyboard convention it is on. The device's own
 * stored table is what it keeps using, and the first deliberate choice puts one
 * here (`App.tsx`).
 */
export function migrate(raw: unknown): Workspace {
  if (!isRecord(raw)) return makeWorkspace();
  if (raw.version === 8) return raw as unknown as Workspace;
  // 4 → 5 → 6 → 7 → 8 are additive only, and `validate.ts` already supplies a
  // default for every field they added, so each step is a version bump. Storage
  // always passes through validation on the way in, which is what makes that safe.
  if (raw.version === 4 || raw.version === 5 || raw.version === 6 || raw.version === 7) {
    return { ...(raw as unknown as Workspace), version: 8 };
  }
  if (raw.version === 3) return fromV3(raw);
  return makeWorkspace();
}

function fromV3(raw: Record<string, unknown>): Workspace {
  const oldDocs = (raw.docs ?? {}) as Record<Id, LegacyDoc>;
  const order = (raw.docOrder as Id[] | undefined) ?? Object.keys(oldDocs);
  const docSorts = keysAfter(null, order.length);
  const now = stamp();
  const docs: Record<Id, Doc> = {};

  order.forEach((id, index) => {
    const old = oldDocs[id];
    if (!old) return;
    docs[id] = lift(old, docSorts[index], now);
  });

  if (Object.keys(docs).length === 0) return makeWorkspace();
  const activeDocId = docs[raw.activeDocId as Id] ? (raw.activeDocId as Id) : Object.keys(docs)[0];
  return {
    version: 8,
    docs,
    graves: {},
    keymap: null,
    activeDocId,
    views: (raw.views as Workspace["views"]) ?? {}
  };
}

/** Version 3 nodes lacked position and stamp fields; `linkChildren` derives them. */
function lift(old: LegacyDoc, sort: string, now: ReturnType<typeof stamp>): Doc {
  const nodes: Record<Id, Node> = {};
  for (const [id, legacy] of Object.entries(old.nodes)) {
    nodes[id] = {
      id,
      text: legacy.text ?? "",
      note: legacy.note ?? "",
      collapsed: legacy.collapsed ?? false,
      done: legacy.done ?? false,
      heading: legacy.heading ?? 0,
      quote: false,
      checklist: false,
      numbered: false,
      color: 0,
      bookmarked: false,
      parent: null,
      sort: keyBetween(null, null),
      children: (legacy.children ?? []).filter((child) => old.nodes[child]),
      created: now,
      edited: now,
      moved: now
    };
  }
  return linkChildren({
    id: old.id,
    title: old.title,
    rootId: old.rootId,
    nodes,
    graves: {},
    sort,
    parent: null,
    kind: "doc",
    query: "",
    bookmarked: false,
    inbox: false,
    deleted: null,
    titleEdited: now,
    moved: now
  });
}

type LegacyDoc = {
  id: Id;
  title: string;
  rootId: Id;
  nodes: Record<Id, Partial<Node> & { children?: Id[] }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
