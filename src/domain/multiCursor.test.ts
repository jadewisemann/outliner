import { describe, expect, it } from "vitest";
import { addCursorAbove, addCursorBelow, applyTextToCursors, clearCursors } from "./multiCursor";
import { makeDocumentWithTexts } from "../test/factories";

describe("multi cursor editing", () => {
  it("adds a cursor to the previous visible row", () => {
    const doc = makeDocumentWithTexts(["A", "Bee"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    expect(addCursorAbove(doc, doc.rootId, undefined, { nodeId: b, offset: 2 })).toEqual([
      { nodeId: b, offset: 2 },
      { nodeId: a, offset: 1 }
    ]);
  });

  it("adds a cursor to the next visible row", () => {
    const doc = makeDocumentWithTexts(["A", "Bee"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    expect(addCursorBelow(doc, doc.rootId, undefined, { nodeId: a, offset: 2 })).toEqual([
      { nodeId: a, offset: 1 },
      { nodeId: b, offset: 2 }
    ]);
  });

  it("clamps cursor offsets to each target node text length", () => {
    const doc = makeDocumentWithTexts(["A", "Bee"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    expect(addCursorBelow(doc, doc.rootId, [{ nodeId: a, offset: 4 }], { nodeId: a, offset: 4 })).toEqual([
      { nodeId: a, offset: 1 },
      { nodeId: b, offset: 3 }
    ]);
  });

  it("applies inserted text to every cursor position", () => {
    const doc = makeDocumentWithTexts(["AB", "CD"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const result = applyTextToCursors(
      doc,
      doc.rootId,
      [
        { nodeId: a, offset: 1 },
        { nodeId: b, offset: 1 }
      ],
      { type: "insert", text: "x" },
      () => 10
    );
    expect(result.document.nodes[a].text).toBe("AxB");
    expect(result.document.nodes[b].text).toBe("CxD");
    expect(result.cursors).toEqual([
      { nodeId: a, offset: 2 },
      { nodeId: b, offset: 2 }
    ]);
  });

  it("applies same-node cursor edits in deterministic descending offset order", () => {
    const doc = makeDocumentWithTexts(["ABCD"]);
    const [a] = doc.nodes[doc.rootId].children;
    const result = applyTextToCursors(
      doc,
      doc.rootId,
      [
        { nodeId: a, offset: 1 },
        { nodeId: a, offset: 3 }
      ],
      { type: "insert", text: "x" },
      () => 10
    );

    expect(result.document.nodes[a].text).toBe("AxBCxD");
    expect(result.cursors).toEqual([
      { nodeId: a, offset: 2 },
      { nodeId: a, offset: 4 }
    ]);
  });

  it("applies backspace and delete to every cursor position", () => {
    const doc = makeDocumentWithTexts(["ABC", "DEF"]);
    const [a, b] = doc.nodes[doc.rootId].children;
    const backspaced = applyTextToCursors(
      doc,
      doc.rootId,
      [
        { nodeId: a, offset: 2 },
        { nodeId: b, offset: 2 }
      ],
      { type: "backspace" },
      () => 10
    );
    expect(backspaced.document.nodes[a].text).toBe("AC");
    expect(backspaced.document.nodes[b].text).toBe("DF");
    const deleted = applyTextToCursors(backspaced.document, doc.rootId, backspaced.cursors, { type: "delete" }, () => 11);
    expect(deleted.document.nodes[a].text).toBe("A");
    expect(deleted.document.nodes[b].text).toBe("D");
  });

  it("clears multi cursors with escape", () => {
    expect(clearCursors()).toBeUndefined();
  });
});
