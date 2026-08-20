import { describe, expect, it } from "vitest";
import { detectFormat, exportBackup, exportDoc, importDoc, parseBackup } from "../formats";
import { makeDoc, makeWorkspace, type Doc } from "../../types";
import { patchNode, visibleRows } from "../../outline/tree";

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

describe("OPML from another outliner", () => {
  it("reads whichever spelling the exporter chose", () => {
    const opml = `<?xml version="1.0"?><opml version="2.0"><head><title>x</title></head><body>
      <outline text="workflowy row" _note="a" _complete="true" _collapsed="true"/>
      <outline text="dynalist row" note="b" complete="true" collapsed="true" checkbox="true" numbered="true" colorLabel="3"/>
    </body></opml>`;
    const doc = importDoc("x", opml, "opml");
    const rows = visibleRows(doc, doc.rootId).map((row) => row.node);

    expect(rows[0].note).toBe("a");
    expect(rows[0].done).toBe(true);
    expect(rows[0].collapsed).toBe(true);
    expect(rows[1].note).toBe("b");
    expect(rows[1].done).toBe(true);
    expect(rows[1].checklist).toBe(true);
    expect(rows[1].numbered).toBe(true);
    expect(rows[1].color).toBe(3);
  });

  it("keeps the exporter's ids, so links into the outline still land", () => {
    const opml = `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="kept" id="node-42"/>
    </body></opml>`;
    const doc = importDoc("x", opml, "opml");
    expect(doc.nodes["node-42"]?.text).toBe("kept");
  });

  it("does not let a repeated id overwrite a row", () => {
    const opml = `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="first" id="same"/><outline text="second" id="same"/>
    </body></opml>`;
    const doc = importDoc("x", opml, "opml");
    expect(visibleRows(doc, doc.rootId).map((row) => row.node.text)).toEqual(["first", "second"]);
  });

  it("round-trips our own export with every flag and id intact", () => {
    let doc = makeDoc("round trip");
    const first = doc.nodes[doc.rootId].children[0];
    doc = patchNode(doc, first, {
      text: "row",
      note: "note",
      done: true,
      checklist: true,
      numbered: true,
      heading: 2,
      color: 5
    });

    const back = importDoc("round trip", exportDoc(doc, "opml"), "opml");
    const node = back.nodes[first];
    expect(node).toMatchObject({
      text: "row",
      note: "note",
      done: true,
      checklist: true,
      numbered: true,
      heading: 2,
      color: 5
    });
  });
});
