import { parseIndentedText, type PastedOutlineDraft } from "./bulkOutline";
import { createEmptyDocument, createInitialView, parseNodeTextInput } from "./outline";
import { getVisibleNodes } from "./outlineSelectors";
import type { Clock, IdGenerator, NodeId, OutlineDocument, OutlineNode, OutlineSnapshot, StoredSnapshot, ViewState } from "./outlineTypes";
import { isWorkspaceSnapshot } from "./workspace";

export type ExportOptions = {
  visibleOnly?: boolean;
  zoomNodeId?: NodeId;
};

export type ImportFormat = "opml" | "plainText";
export type ImportResult = { ok: true; snapshot: OutlineSnapshot } | { ok: false; error: string };
export type ImportApplyOptions =
  | { mode: "replace" }
  | { mode: "mergeRoot" }
  | { mode: "insertUnder"; targetNodeId: NodeId };

export function exportToJson(document: OutlineDocument, view: ViewState): string {
  return exportSnapshotToJson({ document, view });
}

export function importFromJson(value: string): OutlineSnapshot {
  const parsed = importSnapshotFromJson(value);
  if (isWorkspaceSnapshot(parsed)) {
    throw new Error("Expected outline export");
  }
  return parsed;
}

export function exportSnapshotToJson(snapshot: StoredSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function importSnapshotFromJson(value: string): StoredSnapshot {
  const parsed = JSON.parse(value) as OutlineSnapshot;
  const stored = parsed as StoredSnapshot;
  if (isWorkspaceSnapshot(stored)) {
    if (!stored.workspace?.activeDocumentId || !stored.workspace?.documents || !stored.workspace?.view) {
      throw new Error("Invalid workspace export");
    }
    return stored;
  }
  if (!parsed.document?.rootId || !parsed.document?.nodes || !parsed.view?.zoomNodeId) {
    throw new Error("Invalid outline export");
  }
  return parsed;
}

export function exportToMarkdown(document: OutlineDocument, options: ExportOptions = {}): string {
  const lines: string[] = [];
  const visit = (nodeId: string, depth: number, forceVisibleOnly = false) => {
    const node = document.nodes[nodeId];
    if (!node) {
      return;
    }
    lines.push(...formatNodeMarkdownLines(node, depth));
    if ((options.visibleOnly || forceVisibleOnly) && node.collapsed) {
      return;
    }
    for (const childId of node.children) {
      visit(childId, depth + 1, forceVisibleOnly);
    }
  };
  for (const childId of getExportRootChildren(document, options)) {
    visit(childId, 0);
  }
  return lines.join("\n");
}

export function exportToPlainText(document: OutlineDocument, options: ExportOptions = {}): string {
  if (options.visibleOnly) {
    return getVisibleNodes(document, options.zoomNodeId ?? document.rootId).flatMap((item) =>
      formatNodePlainTextLines(item.node, item.depth)
    ).join("\n");
  }
  const lines: string[] = [];
  const visit = (nodeId: NodeId, depth: number) => {
    const node = document.nodes[nodeId];
    if (!node) {
      return;
    }
    lines.push(...formatNodePlainTextLines(node, depth));
    for (const childId of node.children) {
      visit(childId, depth + 1);
    }
  };
  for (const childId of getExportRootChildren(document, options)) {
    visit(childId, 0);
  }
  return lines.join("\n");
}

export function exportToOpml(document: OutlineDocument, options: ExportOptions = {}): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<opml version="2.0">', "  <body>"];
  const visit = (nodeId: NodeId, depth: number) => {
    const node = document.nodes[nodeId];
    if (!node) {
      return;
    }
    const indent = "  ".repeat(depth + 2);
    const attributes = formatOpmlAttributes(node);
    const childIds = options.visibleOnly && node.collapsed ? [] : node.children;
    if (childIds.length === 0) {
      lines.push(`${indent}<outline ${attributes}/>`);
      return;
    }
    lines.push(`${indent}<outline ${attributes}>`);
    for (const childId of childIds) {
      visit(childId, depth + 1);
    }
    lines.push(`${indent}</outline>`);
  };
  for (const childId of getExportRootChildren(document, options)) {
    visit(childId, 0);
  }
  lines.push("  </body>", "</opml>");
  return lines.join("\n");
}

export function importFromPlainText(value: string, createId: IdGenerator, now: Clock = Date.now): OutlineSnapshot {
  return createSnapshotFromDrafts(parsePlainTextOutline(value), createId, now);
}

export function importFromOpml(value: string, createId: IdGenerator, now: Clock = Date.now): OutlineSnapshot {
  const parser = new DOMParser();
  const xml = parser.parseFromString(value, "application/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error("Invalid OPML");
  }
  const body = xml.querySelector("opml > body, body");
  if (!body) {
    throw new Error("Invalid OPML");
  }
  const timestamp = now();
  const document = createEmptyDocument(() => timestamp);
  const nodes: Record<NodeId, OutlineNode> = { ...document.nodes };
  const rootChildren: NodeId[] = [];
  for (const element of Array.from(body.children).filter((child) => child.tagName.toLowerCase() === "outline")) {
    rootChildren.push(importOpmlElement(element, nodes, createId, timestamp).id);
  }
  if (rootChildren.length === 0) {
    throw new Error("OPML has no outline items");
  }
  nodes[document.rootId] = { ...nodes[document.rootId], children: rootChildren, updatedAt: timestamp };
  const imported = { rootId: document.rootId, nodes };
  return { document: imported, view: createInitialView(imported) };
}

export function previewImport(
  value: string,
  format: ImportFormat,
  createId: IdGenerator,
  now: Clock = Date.now
): ImportResult {
  try {
    return {
      ok: true,
      snapshot: format === "opml" ? importFromOpml(value, createId, now) : importFromPlainText(value, createId, now)
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid import" };
  }
}

export function applyImportedOutline(
  current: OutlineSnapshot,
  imported: ImportResult,
  options: ImportApplyOptions
): OutlineSnapshot {
  if (!imported.ok) {
    return current;
  }
  if (options.mode === "replace") {
    return imported.snapshot;
  }
  const importedDocument = imported.snapshot.document;
  const importedRoot = importedDocument.nodes[importedDocument.rootId];
  const targetId = options.mode === "insertUnder" ? options.targetNodeId : current.document.rootId;
  const target = current.document.nodes[targetId];
  if (!target) {
    return current;
  }
  const timestamp = Math.max(target.updatedAt, ...importedRoot.children.map((id) => importedDocument.nodes[id]?.updatedAt ?? 0));
  const nodes = { ...current.document.nodes, ...withoutRoot(importedDocument) };
  nodes[targetId] = {
    ...target,
    children: [...target.children, ...importedRoot.children],
    collapsed: false,
    updatedAt: timestamp
  };
  return {
    document: { ...current.document, nodes },
    view: { ...current.view, selectedNodeId: importedRoot.children[0] ?? current.view.selectedNodeId }
  };
}

function formatNodeMarkdownLines(node: OutlineDocument["nodes"][string], depth: number): string[] {
  const indent = "  ".repeat(depth);
  const completedPrefix = node.completed ? "[x] " : "";
  const headingPrefix = node.heading ? `${"#".repeat(node.heading)} ` : "";
  const tagsSuffix = formatTagsSuffix(node.tags);
  const colorSuffix = node.color ? ` {color=${node.color}}` : "";
  const lines = [`${indent}- ${completedPrefix}${headingPrefix}${node.text}${tagsSuffix}${colorSuffix}`];
  return node.note ? [...lines, ...formatNoteLines(node.note, indent)] : lines;
}

function formatNoteLines(note: string, indent: string): string[] {
  return note.split("\n").map((line) => `${indent}  > ${line}`);
}

function formatNodePlainTextLines(node: OutlineNode, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const completedPrefix = node.completed ? "[x] " : "";
  const tagsSuffix = formatTagsSuffix(node.tags);
  const textLines = node.text.split("\n");
  const [firstLine = "", ...continuationLines] = textLines;
  return [
    `${indent}${completedPrefix}${firstLine}${tagsSuffix}`,
    ...continuationLines.map((line) => `${indent}  | ${line}`),
    ...(node.note ? formatNoteLines(node.note, indent) : [])
  ];
}

function parsePlainTextOutline(value: string): PastedOutlineDraft[] {
  const lines = value.split(/\r?\n/);
  const rawDrafts: PastedOutlineDraft[] = [];
  let baseDepth: number | undefined;
  for (const line of lines) {
    const match = line.match(/^(\s*)(.*)$/);
    const indentation = match?.[1] ?? "";
    const content = `${getIndentRemainder(indentation, getIndentDepth(indentation))}${match?.[2] ?? ""}`.trimEnd();
    if (!content) {
      continue;
    }
    const rawDepth = getIndentDepth(indentation);
    if (content.startsWith("| ") || content.startsWith("> ")) {
      if (baseDepth === undefined) {
        continue;
      }
      const targetDepth = Math.max(0, rawDepth - baseDepth - 1);
      const target = findLastDraftAtDepth(rawDrafts, targetDepth);
      if (!target) {
        continue;
      }
      const lineText = content.slice(2);
      if (content.startsWith("| ")) {
        target.text = `${target.text}\n${lineText}`;
      } else {
        target.note = target.note ? `${target.note}\n${lineText}` : lineText;
      }
      continue;
    }
    baseDepth ??= rawDepth;
    const parsed = parseNodeTextInput(content);
    rawDrafts.push({
      text: parsed.text,
      tags: parsed.tags,
      completed: parsed.completed,
      depth: Math.max(0, rawDepth - baseDepth)
    });
  }
  return rawDrafts.length > 0 ? rawDrafts : parseIndentedText(value);
}

function findLastDraftAtDepth(drafts: PastedOutlineDraft[], depth: number): PastedOutlineDraft | undefined {
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    if (drafts[index].depth === depth) {
      return drafts[index];
    }
  }
  return undefined;
}

function getExportRootChildren(document: OutlineDocument, options: ExportOptions): NodeId[] {
  if (!options.visibleOnly) {
    return document.nodes[options.zoomNodeId ?? document.rootId]?.children ?? [];
  }
  return getVisibleNodes(document, options.zoomNodeId ?? document.rootId)
    .filter((item) => item.depth === 0)
    .map((item) => item.id);
}

function formatOpmlAttributes(node: OutlineNode): string {
  const attributes: Array<[string, string]> = [
    ["text", node.text],
    ...optionalAttribute("_note", node.note),
    ...booleanAttribute("_collapsed", node.collapsed),
    ...booleanAttribute("_noteVisible", !!node.noteVisible),
    ...optionalAttribute("_heading", node.heading ? String(node.heading) : undefined),
    ...optionalAttribute("_color", node.color),
    ...optionalAttribute("_tags", node.tags?.join(" ")),
    ...booleanAttribute("_completed", !!node.completed)
  ];
  return attributes.map(([key, value]) => `${key}="${escapeXml(value)}"`).join(" ");
}

function importOpmlElement(
  element: Element,
  nodes: Record<NodeId, OutlineNode>,
  createId: IdGenerator,
  timestamp: number
): OutlineNode {
  const id = createId();
  const childElements = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "outline");
  const children: NodeId[] = [];
  const parsedText = parseNodeTextInput(element.getAttribute("text") ?? element.getAttribute("title") ?? "");
  const node: OutlineNode = {
    id,
    text: parsedText.text,
    children,
    collapsed: parseBooleanAttribute(element.getAttribute("_collapsed")),
    ...optionalObject("tags", parsedText.tags),
    ...optionalObject("completed", parsedText.completed),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const note = element.getAttribute("_note") ?? element.getAttribute("note");
  const heading = parseHeading(element.getAttribute("_heading"));
  const color = element.getAttribute("_color");
  const tags = parseTagsAttribute(element.getAttribute("_tags"));
  applyImportedNodeMetadata(node, element, { note, heading, color, tags });
  nodes[id] = node;
  for (const childElement of childElements) {
    children.push(importOpmlElement(childElement, nodes, createId, timestamp).id);
  }
  return node;
}

function applyImportedNodeMetadata(
  node: OutlineNode,
  element: Element,
  metadata: { note: string | null; heading?: 1 | 2 | 3; color: string | null; tags?: string[] }
): void {
  const { note, heading, color, tags } = metadata;
  Object.assign(node, {
    ...optionalObject("note", note || undefined),
    ...optionalObject("noteVisible", parseBooleanAttribute(element.getAttribute("_noteVisible")) || undefined),
    ...optionalObject("heading", heading),
    ...optionalObject("color", color || undefined),
    ...optionalObject("tags", tags ?? node.tags),
    ...optionalObject("completed", parseBooleanAttribute(element.getAttribute("_completed")) || node.completed || undefined)
  });
}

function createSnapshotFromDrafts(drafts: PastedOutlineDraft[], createId: IdGenerator, now: Clock): OutlineSnapshot {
  if (drafts.length === 0) {
    throw new Error("Import has no outline items");
  }
  const timestamp = now();
  const document = createEmptyDocument(() => timestamp);
  const nodes: Record<NodeId, OutlineNode> = { ...document.nodes };
  const rootChildren: NodeId[] = [];
  const stack: Array<{ id: NodeId; depth: number }> = [{ id: document.rootId, depth: -1 }];
  for (const draft of drafts) {
    const id = createId();
    nodes[id] = {
      id,
      text: draft.text,
      children: [],
      collapsed: false,
      ...optionalObject("note", draft.note),
      ...optionalObject("tags", draft.tags),
      ...optionalObject("completed", draft.completed),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    while (stack.length > 1 && stack[stack.length - 1].depth >= draft.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent.id === document.rootId) {
      rootChildren.push(id);
    } else {
      nodes[parent.id] = { ...nodes[parent.id], children: [...nodes[parent.id].children, id] };
    }
    stack.push({ id, depth: draft.depth });
  }
  nodes[document.rootId] = { ...nodes[document.rootId], children: rootChildren, updatedAt: timestamp };
  const imported = { rootId: document.rootId, nodes };
  return { document: imported, view: createInitialView(imported) };
}

function withoutRoot(document: OutlineDocument): Record<NodeId, OutlineNode> {
  const { [document.rootId]: _root, ...nodes } = document.nodes;
  return nodes;
}

function parseBooleanAttribute(value: string | null): boolean {
  return value === "true" || value === "1";
}

function optionalAttribute(key: string, value: string | undefined): Array<[string, string]> {
  return value ? [[key, value]] : [];
}

function booleanAttribute(key: string, value: boolean): Array<[string, string]> {
  return value ? [[key, "true"]] : [];
}

function optionalObject<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

function formatTagsSuffix(tags: string[] | undefined): string {
  return tags && tags.length > 0 ? ` ${tags.join(" ")}` : "";
}

function parseTagsAttribute(value: string | null): string[] | undefined {
  const tags = value?.split(/\s+/).filter(Boolean);
  return tags && tags.length > 0 ? tags : undefined;
}

function parseHeading(value: string | null): 1 | 2 | 3 | undefined {
  return value === "1" || value === "2" || value === "3" ? (Number(value) as 1 | 2 | 3) : undefined;
}

function getIndentDepth(indentation: string): number {
  let columns = 0;
  for (const char of indentation) {
    columns += char === "\t" ? 2 : 1;
  }
  return Math.floor(columns / 2);
}

function getIndentRemainder(indentation: string, depth: number): string {
  const consumedColumns = depth * 2;
  let columns = 0;
  let index = 0;
  while (index < indentation.length && columns < consumedColumns) {
    columns += indentation[index] === "\t" ? 2 : 1;
    index += 1;
  }
  return indentation.slice(index);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
