import { describe, expect, it } from "vitest";
import { detectFormat, exportBackup, exportDoc, importDoc, parseBackup } from "../formats";
import { makeWorkspace, type Doc } from "../../types";

const outline = (doc: Doc) => exportDoc(doc, "markdown");

describe("importDoc", () => {
  it("reads indentation, checkboxes and headings from markdown", () => {
    const doc = importDoc("notes", "- # Title\n  - [x] done item\n  - [ ] open item\n- Second", "markdown");
    expect(outline(doc)).toBe("- # Title\n  - [x] done item\n  - open item\n- Second");
  });

  it("accepts plain indented text without bullets", () => {
    const doc = importDoc("notes", "one\n\ttwo\n\t\tthree", "text");
    expect(exportDoc(doc, "text")).toBe("one\n  two\n    three");
  });

  it("never produces a document with nothing to type into", () => {
    const doc = importDoc("empty", "", "markdown");
    expect(doc.nodes[doc.rootId].children).toHaveLength(1);
  });
});

describe("opml", () => {
  it("round-trips text, notes and completion", () => {
    const source = importDoc("notes", "- alpha\n  - beta", "markdown");
    const withNote = {
      ...source,
      nodes: {
        ...source.nodes,
        [source.nodes[source.rootId].children[0]]: {
          ...source.nodes[source.nodes[source.rootId].children[0]],
          note: "a note",
          done: true
        }
      }
    };
    const reimported = importDoc("notes", exportDoc(withNote, "opml"), "opml");
    const first = reimported.nodes[reimported.nodes[reimported.rootId].children[0]];
    expect(first.text).toBe("alpha");
    expect(first.note).toBe("a note");
    expect(first.done).toBe(true);
    expect(reimported.nodes[first.children[0]].text).toBe("beta");
  });

  it("escapes markup in text", () => {
    const doc = importDoc("x", '- a <b> & "c"', "markdown");
    const xml = exportDoc(doc, "opml");
    expect(xml).toContain("&lt;b&gt; &amp; &quot;c&quot;");
    const back = importDoc("x", xml, "opml");
    expect(back.nodes[back.nodes[back.rootId].children[0]].text).toBe('a <b> & "c"');
  });
});

describe("detectFormat", () => {
  it("picks a format from the filename, then the content", () => {
    expect(detectFormat("a.opml", "")).toBe("opml");
    expect(detectFormat("a.md", "")).toBe("markdown");
    expect(detectFormat("a.unknown", '<?xml version="1.0"?>')).toBe("opml");
    expect(detectFormat("a.txt", "hello")).toBe("text");
  });
});

describe("backup", () => {
  it("round-trips a workspace and rejects anything else", () => {
    const workspace = makeWorkspace();
    expect(parseBackup(exportBackup(workspace))?.activeDocId).toBe(workspace.activeDocId);
    expect(parseBackup("not json")).toBeNull();
    expect(parseBackup('{"version":1}')).toBeNull();
  });
});
