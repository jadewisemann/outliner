import { migrate } from "../storage/migrate";
import { readWorkspace } from "../storage/validate";
import { linkChildren, parseOutlineLines } from "../outline/tree";
import { keyBetween } from "../shared/order";
import { makeNode, newId, stamp, type Doc, type Id, type Node, type Workspace } from "../types";

export type Format = "markdown" | "opml" | "text";

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

export function exportDoc(doc: Doc, format: Format, fromId: Id = doc.rootId): string {
  if (format === "opml") return toOpml(doc, fromId);
  return doc.nodes[fromId].children.map((id) => serialize(doc, id, 0, format)).join("\n");
}

function serialize(doc: Doc, id: Id, depth: number, format: Format): string {
  const node = doc.nodes[id];
  if (!node) return "";
  const pad = "  ".repeat(depth);
  const lines: string[] = [pad + line(node, format)];
  if (node.note) {
    for (const noteLine of node.note.split("\n")) lines.push(`${pad}  ${noteLine}`);
  }
  for (const child of node.children) lines.push(serialize(doc, child, depth + 1, format));
  return lines.filter(Boolean).join("\n");
}

function line(node: Node, format: Format): string {
  if (format === "text") return node.text;
  const heading = node.heading > 0 ? `${"#".repeat(node.heading)} ` : "";
  const box = node.done ? "[x] " : "";
  return `- ${box}${heading}${node.text}`;
}

function toOpml(doc: Doc, fromId: Id): string {
  const body = doc.nodes[fromId].children.map((id) => opmlNode(doc, id, 2)).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${escapeXml(doc.title)}</title></head>`,
    "  <body>",
    body,
    "  </body>",
    "</opml>"
  ].join("\n");
}

function opmlNode(doc: Doc, id: Id, depth: number): string {
  const node = doc.nodes[id];
  if (!node) return "";
  const pad = "  ".repeat(depth);
  // The id travels so that a round trip through a file keeps internal links
  // and bookmarks pointing at the same rows.
  const attrs = [
    `text="${escapeXml(node.text)}"`,
    `_id="${escapeXml(node.id)}"`,
    node.note ? `_note="${escapeXml(node.note)}"` : "",
    node.done ? `_complete="true"` : "",
    node.collapsed ? `_collapsed="true"` : "",
    node.checklist ? `_checkbox="true"` : "",
    node.numbered ? `_numbered="true"` : "",
    node.quote ? `_quote="true"` : "",
    node.heading > 0 ? `_heading="${node.heading}"` : "",
    node.color > 0 ? `_colorLabel="${node.color}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
  if (node.children.length === 0) return `${pad}<outline ${attrs}/>`;
  const children = node.children.map((child) => opmlNode(doc, child, depth + 1)).join("\n");
  return `${pad}<outline ${attrs}>\n${children}\n${pad}</outline>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => `&${{ "<": "lt", ">": "gt", "&": "amp", '"': "quot", "'": "apos" }[char]};`);
}

/* ------------------------------------------------------------------ */
/* import                                                              */
/* ------------------------------------------------------------------ */

export function detectFormat(filename: string, content: string): Format {
  if (/\.opml$|\.xml$/i.test(filename) || content.trimStart().startsWith("<?xml")) return "opml";
  if (/\.md$|\.markdown$/i.test(filename)) return "markdown";
  return "text";
}

export function importDoc(title: string, content: string, format: Format): Doc {
  const root = makeNode();
  const nodes: Record<Id, Node> = { [root.id]: root };
  if (format === "opml") {
    parseOpml(content, root, nodes);
  } else {
    parseIndented(content, root, nodes);
  }
  if (root.children.length === 0) {
    const empty = makeNode();
    nodes[empty.id] = empty;
    root.children.push(empty.id);
  }
  const now = stamp();
  return linkChildren({
    id: newId(),
    title,
    rootId: root.id,
    nodes,
    graves: {},
    sort: keyBetween(null, null),
    parent: null,
    kind: "doc",
    bookmarked: false,
    titleEdited: now,
    moved: now
  });
}

function parseIndented(content: string, root: Node, nodes: Record<Id, Node>) {
  const stack: { depth: number; node: Node }[] = [];
  for (const { depth, patch } of parseOutlineLines(content)) {
    const node = makeNode(patch);
    nodes[node.id] = node;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    (stack[stack.length - 1]?.node ?? root).children.push(node.id);
    stack.push({ depth, node });
  }
}


/**
 * OPML from another outliner, read as generously as the format allows.
 *
 * Every exporter spells these differently — Workflowy writes `_note` and
 * `_complete`, Dynalist writes `note` and `complete`, and neither is wrong —
 * so each field is looked up under all the spellings seen in the wild. An
 * attribute nobody recognises is dropped rather than guessed at.
 */
const OPML_FIELDS = {
  note: ["_note", "note"],
  done: ["_complete", "complete", "checked"],
  collapsed: ["_collapsed", "collapsed"],
  checklist: ["_checkbox", "checkbox"],
  numbered: ["_numbered", "numbered"],
  quote: ["_quote", "quote"],
  color: ["_colorLabel", "colorLabel", "color"],
  heading: ["_heading", "heading"],
  id: ["id", "_id"]
};

function attr(element: Element, names: string[]): string | null {
  for (const name of names) {
    const found = element.getAttribute(name);
    if (found !== null) return found;
  }
  return null;
}

const isTrue = (value: string | null) => value === "true" || value === "1" || value === "yes";

function parseOpml(content: string, root: Node, nodes: Record<Id, Node>) {
  const doc = new DOMParser().parseFromString(content, "text/xml");
  const body = doc.querySelector("body");
  if (!body) return;

  const walk = (element: Element, owner: Node) => {
    for (const child of Array.from(element.children)) {
      if (child.tagName.toLowerCase() !== "outline") continue;
      const heading = Number(attr(child, OPML_FIELDS.heading));
      const color = Number(attr(child, OPML_FIELDS.color));
      // Keeping the exporter's id is what lets internal links survive the
      // move. A repeat is dropped rather than allowed to overwrite a row.
      const given = attr(child, OPML_FIELDS.id);
      const id = given && given !== "" && !nodes[given] ? given : undefined;

      const node = makeNode({
        id,
        text: child.getAttribute("text") ?? "",
        note: attr(child, OPML_FIELDS.note) ?? "",
        done: isTrue(attr(child, OPML_FIELDS.done)),
        collapsed: isTrue(attr(child, OPML_FIELDS.collapsed)),
        checklist: isTrue(attr(child, OPML_FIELDS.checklist)),
        numbered: isTrue(attr(child, OPML_FIELDS.numbered)),
        quote: isTrue(attr(child, OPML_FIELDS.quote)),
        heading: heading >= 1 && heading <= 3 ? (heading as Node["heading"]) : 0,
        color: color >= 1 && color <= 6 ? (color as Node["color"]) : 0
      });
      nodes[node.id] = node;
      owner.children.push(node.id);
      walk(child, node);
    }
  };
  walk(body, root);
}


/* ------------------------------------------------------------------ */
/* backup                                                              */
/* ------------------------------------------------------------------ */

export function exportBackup(workspace: Workspace): string {
  return JSON.stringify({ kind: "outliner-backup", exportedAt: new Date().toISOString(), workspace }, null, 2);
}

/**
 * Accepts backups from any released schema; older ones are upgraded on the way
 * in. Importing replaces everything the user has, so an unrecognised or
 * damaged file must be rejected outright rather than quietly becoming an
 * empty workspace.
 */
export function parseBackup(content: string): Workspace | null {
  try {
    const parsed = JSON.parse(content);
    const raw = parsed?.workspace ?? parsed;
    if (!isKnownVersion(raw)) return null;
    return readWorkspace(migrate(raw));
  } catch {
    return null;
  }
}

function isKnownVersion(raw: unknown): boolean {
  const version = (raw as { version?: unknown } | null)?.version;
  return version === 3 || version === 4 || version === 5 || version === 6;
}
