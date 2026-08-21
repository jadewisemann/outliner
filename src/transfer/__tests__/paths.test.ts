import { describe, expect, it } from "vitest";
import { directoryOf } from "../paths";

describe("directoryOf", () => {
  it("keeps the picked directory as a folder of its own", () => {
    // Picking `Dynalist/` puts the whole import under one `Dynalist` folder
    // rather than spilling its top level in among existing documents.
    expect(directoryOf("Dynalist/todo.opml")).toBe("Dynalist");
    expect(directoryOf("Dynalist/work/q3.opml")).toBe("Dynalist/work");
  });

  it("reads a plain file name as the top level", () => {
    expect(directoryOf("todo.opml")).toBe("");
  });

  it("does not let a path segment climb out", () => {
    expect(directoryOf("../../etc/todo.opml")).toBe("etc");
    expect(directoryOf("a//./b/todo.md")).toBe("a/b");
  });
});
