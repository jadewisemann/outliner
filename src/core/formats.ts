import { migrate } from "./migrate";
import { linkChildren, parseOutlineLine } from "./tree";
import { keyBetween } from "./order";
import { makeNode, newId, stamp, type Doc, type Id, type Node, type Workspace } from "./types";

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
  const attrs = [
    `text="${escapeXml(node.text)}"`,
    node.note ? `_note="${escapeXml(node.note)}"` : "",
    node.done ? `_complete="true"` : "",
    node.collapsed ? `_collapsed="true"` : ""
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
    titleEdited: now,
    moved: now
  });
}

function parseIndented(content: string, root: Node, nodes: Record<Id, Node>) {
  const stack: { depth: number; node: Node }[] = [];
  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.trim() === "") continue;
    const indentWidth = (raw.match(/^[\t ]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
    const depth = indentWidth >> 1;
    const node = makeNode(parseOutlineLine(raw.trim()));
    nodes[node.id] = node;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const owner = stack[stack.length - 1]?.node ?? root;
    owner.children.push(node.id);
    stack.push({ depth, node });
  }
}


function parseOpml(content: string, root: Node, nodes: Record<Id, Node>) {
  const doc = new DOMParser().parseFromString(content, "text/xml");
  const body = doc.querySelector("body");
  if (!body) return;
  const walk = (element: Element, owner: Node) => {
    for (const child of Array.from(element.children)) {
      if (child.tagName.toLowerCase() !== "outline") continue;
      const node = makeNode({
        text: child.getAttribute("text") ?? "",
        note: child.getAttribute("_note") ?? "",
        done: child.getAttribute("_complete") === "true",
        collapsed: child.getAttribute("_collapsed") === "true"
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

/** Accepts backups from any released schema; older ones are upgraded on the way in. */
export function parseBackup(content: string): Workspace | null {
  try {
    const parsed = JSON.parse(content);
    const raw = parsed?.workspace ?? parsed;
    if (!raw?.docs || Object.keys(raw.docs).length === 0) return null;
    const workspace = migrate(raw);
    return Object.keys(workspace.docs).length > 0 ? workspace : null;
  } catch {
    return null;
  }
}
