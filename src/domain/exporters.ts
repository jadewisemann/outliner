import type { OutlineDocument, OutlineSnapshot, ViewState } from "./outlineTypes";

export function exportToJson(document: OutlineDocument, view: ViewState): string {
  return JSON.stringify({ document, view } satisfies OutlineSnapshot, null, 2);
}

export function importFromJson(value: string): OutlineSnapshot {
  const parsed = JSON.parse(value) as OutlineSnapshot;
  if (!parsed.document?.rootId || !parsed.document?.nodes || !parsed.view?.zoomNodeId) {
    throw new Error("Invalid outline export");
  }
  return parsed;
}

export function exportToMarkdown(document: OutlineDocument): string {
  const lines: string[] = [];
  const visit = (nodeId: string, depth: number) => {
    const node = document.nodes[nodeId];
    if (!node) {
      return;
    }
    const indent = "  ".repeat(depth);
    const marker = node.numbered ? "1." : "-";
    const headingPrefix = node.heading ? `${"#".repeat(node.heading)} ` : "";
    const colorSuffix = node.color ? ` {color=${node.color}}` : "";
    lines.push(`${indent}${marker} ${headingPrefix}${node.text}${colorSuffix}`);
    if (node.note) {
      for (const line of node.note.split("\n")) {
        lines.push(`${indent}  > ${line}`);
      }
    }
    for (const childId of node.children) {
      visit(childId, depth + 1);
    }
  };
  for (const childId of document.nodes[document.rootId].children) {
    visit(childId, 0);
  }
  return lines.join("\n");
}
