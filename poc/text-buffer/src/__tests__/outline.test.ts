import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { childRange, itemAtPosition, parseOutline, siblingOf } from "../outline";

describe("OutlineIndex", () => {
  it("indexes nested list items and subtree ranges", () => {
    const source = [
      "---",
      "outliner-id: doc-1",
      "---",
      "",
      "- root ^ol-root",
      "  note",
      "  - [x] child",
      "    - grandchild",
      "- 2nd root"
    ].join("\n");
    const index = parseOutline(Text.of(source.split("\n")));

    expect(index.items.map(({ line, depth, parent, marker, done, id }) => ({ line, depth, parent, marker, done, id })))
      .toEqual([
        { line: 5, depth: 0, parent: null, marker: "bullet", done: false, id: "root" },
        { line: 7, depth: 1, parent: 0, marker: "task", done: true, id: null },
        { line: 8, depth: 2, parent: 1, marker: "bullet", done: false, id: null },
        { line: 9, depth: 0, parent: null, marker: "bullet", done: false, id: null }
      ]);
    expect(source.slice(index.items[0].subtreeFrom, index.items[0].subtreeTo)).toBe(
      "- root ^ol-root\n  note\n  - [x] child\n    - grandchild\n"
    );
    expect(childRange(index, 0)).toEqual({ from: index.items[0].to + 1, to: index.items[0].subtreeTo });
    expect(siblingOf(index, 0, 1)).toBe(3);
    expect(itemAtPosition(index, source.indexOf("note"))).toBe(0);
  });

  it("leaves front matter, fenced code and unsupported blocks out of the index", () => {
    const source = [
      "---",
      "title: - not an item",
      "---",
      "> - quoted raw block",
      "```md",
      "- fenced raw block",
      "```",
      "1. real item <!-- outliner:id=html-1 -->"
    ].join("\n");
    const index = parseOutline(source);

    expect(index.items).toHaveLength(1);
    expect(index.items[0]).toMatchObject({ line: 8, marker: "number", id: "html-1" });
  });
});
