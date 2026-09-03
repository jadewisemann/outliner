import { describe, expect, it } from "vitest";
import { fileStem, markdownMirror, mirrorText } from "../api/remote/mirror";
import { makeDoc, makeNode, stamp, type Doc, type Id, type SyncPayload } from "../../types";

function doc(id: Id, title: string, lines: string[], extra: Partial<Doc> = {}): Doc {
  const built = makeDoc(title, { id, ...extra });
  const root = built.nodes[built.rootId];
  root.children = [];
  built.nodes = { [root.id]: root };
  let order = "a1";
  for (const text of lines) {
    const child = makeNode({ parent: root.id, sort: order, text });
    built.nodes[child.id] = child;
    root.children.push(child.id);
    order += "1";
  }
  return built;
}

function payload(docs: Doc[]): SyncPayload {
  return { docs: Object.fromEntries(docs.map((entry) => [entry.id, entry])), graves: {}, keymap: null };
}

describe("the markdown mirror", () => {
  it("writes one readable file per document and carries the id inside it", () => {
    const files = markdownMirror(payload([doc("d1", "장보기", ["우유", "빵"])]));

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("장보기.md");
    expect(files[0].text).toContain("outliner-id: d1");
    expect(files[0].text).toContain("# 장보기");
    expect(files[0].text).toContain("- 우유");
  });

  it("leaves out what has no outline to read", () => {
    const files = markdownMirror(
      payload([
        doc("d1", "문서", ["본문"]),
        doc("d2", "폴더", [], { kind: "folder" }),
        doc("d3", "저장된 검색", [], { kind: "search" }),
        doc("d4", "휴지통에 있는 것", ["본문"], { deleted: stamp() })
      ])
    );

    expect(files.map((file) => file.name)).toEqual(["문서.md"]);
  });

  it("gives two documents with one title distinct names, in id order", () => {
    const files = markdownMirror(payload([doc("d2", "메모", ["둘"]), doc("d1", "메모", ["하나"])]));

    expect(files.map((file) => file.name)).toEqual(["메모.md", "메모 (2).md"]);
    // The suffix follows document id, not payload order, so every device that
    // holds these two documents writes the same two names.
    expect(files[0].text).toContain("outliner-id: d1");
  });

  it("treats names that differ only in case as the same file", () => {
    const files = markdownMirror(payload([doc("d1", "Notes", ["하나"]), doc("d2", "notes", ["둘"])]));

    expect(files.map((file) => file.name)).toEqual(["Notes.md", "notes (2).md"]);
  });

  it("keeps a title that no filesystem would accept", () => {
    expect(fileStem('a/b:c*d?"e|f<g>h')).toBe("a_b_c_d__e_f_g_h");
    expect(fileStem("끝에 점이 있는 제목...")).toBe("끝에 점이 있는 제목");
    expect(fileStem("   ")).toBe("untitled");
    // Windows refuses these whatever the extension, so they are prefixed
    // rather than renamed: the title stays readable.
    expect(fileStem("CON")).toBe("_CON");
    expect(fileStem("com1")).toBe("_com1");
  });

  it("is a projection, so it does not have to carry what the merge needs", () => {
    const text = mirrorText(doc("d1", "메모", ["할 일"]));

    expect(text).not.toContain("titleEdited");
    expect(text).not.toContain("sort");
  });
});
