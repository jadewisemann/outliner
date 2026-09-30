import { describe, expect, it } from "vitest";
import { makeNode, type Node } from "@/entities/outline";
import { parseQuery, type Target } from "../query";

const NOW = 1_700_000_000_000;
const DAY = 24 * 3600_000;

function target(patch: Partial<Node> = {}, trail: string[] = []): Target {
  return { node: makeNode({ edited: { at: NOW, by: "x" }, created: { at: NOW, by: "x" }, ...patch }), trail };
}

const accepts = (query: string, subject: Target) => parseQuery(query, NOW)!(subject);

describe("parseQuery", () => {
  it("asks for nothing when there is nothing to ask", () => {
    expect(parseQuery("")).toBeNull();
    expect(parseQuery("   ")).toBeNull();
  });

  it("requires every term", () => {
    const row = target({ text: "buy milk and bread" });
    expect(accepts("milk bread", row)).toBe(true);
    expect(accepts("milk eggs", row)).toBe(false);
  });

  it("searches the note as well as the text", () => {
    expect(accepts("hidden", target({ text: "row", note: "a hidden thought" }))).toBe(true);
  });

  it("keeps a quoted phrase together", () => {
    const row = target({ text: "the quick brown fox" });
    expect(accepts('"quick brown"', row)).toBe(true);
    expect(accepts('"brown quick"', row)).toBe(false);
  });

  it("excludes with a leading dash", () => {
    const row = target({ text: "buy milk", done: true });
    expect(accepts("milk -is:completed", row)).toBe(false);
    expect(accepts("milk -is:incomplete", row)).toBe(true);
  });

  it("matches a tag, and a parent tag matches its children", () => {
    const row = target({ text: "ship it #work/urgent" });
    expect(accepts("#work", row)).toBe(true);
    expect(accepts("#work/urgent", row)).toBe(true);
    expect(accepts("#home", row)).toBe(false);
    // A bare word must not be read as a tag match.
    expect(accepts("work", row)).toBe(true);
  });

  it("searches @tags too, and an address is not one", () => {
    const row = target({ text: "ship it @waiting" });
    expect(accepts("@waiting", row)).toBe(true);
    expect(accepts("-@waiting", row)).toBe(false);
    expect(accepts("@waiting", target({ text: "mail jade@waiting.com" }))).toBe(false);
  });

  it("knows the state operators", () => {
    expect(accepts("is:completed", target({ done: true }))).toBe(true);
    expect(accepts("is:incomplete", target({ done: true }))).toBe(false);
    expect(accepts("is:heading", target({ heading: 2 }))).toBe(true);
    expect(accepts("is:bookmarked", target({ bookmarked: true }))).toBe(true);
    expect(accepts("is:coloured", target({ color: 3 }))).toBe(true);
  });

  it("knows the content operators", () => {
    expect(accepts("has:note", target({ note: "x" }))).toBe(true);
    expect(accepts("has:note", target({ note: "" }))).toBe(false);
    expect(accepts("has:link", target({ text: "see https://x.dev" }))).toBe(true);
    expect(accepts("has:image", target({ text: "![a](https://x.dev/a.png)" }))).toBe(true);
    expect(accepts("has:tag", target({ text: "#done" }))).toBe(true);
  });

  it("reads a relative age for edited and created", () => {
    const old = target({ edited: { at: NOW - 10 * DAY, by: "x" }, created: { at: NOW - 10 * DAY, by: "x" } });
    expect(accepts("edited:3d", old)).toBe(false);
    expect(accepts("edited:2w", old)).toBe(true);
    expect(accepts("created:1y", old)).toBe(true);
    // An unreadable duration falls back to plain text rather than matching all.
    expect(accepts("edited:soon", old)).toBe(false);
  });

  it("looks at where a row sits", () => {
    const row = target({ text: "leaf" }, ["Projects", "Outliner"]);
    expect(accepts("parent:outliner", row)).toBe(true);
    expect(accepts("parent:projects", row)).toBe(false);
    expect(accepts("ancestor:projects", row)).toBe(true);
  });
});

describe("date queries", () => {
  // Noon on a Tuesday, local time, so no case sits on a day boundary.
  const DATE_NOW = new Date(2026, 8, 29, 12, 0).getTime();

  it("filters with date: and has:date", () => {
    const rows = ["past !(2026-09-01)", "now !(2026-09-29)", "soon !(2026-10-03)", "none", "code `!(2026-09-29)`"].map((text) =>
      makeNode({ text })
    );
    const hits = (query: string) =>
      rows.filter((node) => parseQuery(query, DATE_NOW)!({ node, trail: [] })).map((node) => node.text.split(" ")[0]);
    expect(hits("date:overdue")).toEqual(["past"]);
    expect(hits("date:today")).toEqual(["now"]);
    expect(hits("date:7d")).toEqual(["now", "soon"]);
    expect(hits("date:2026-10-03")).toEqual(["soon"]);
    expect(hits("has:date")).toEqual(["past", "now", "soon"]);
    // A date inside a code span renders as code, so it is not a date to search either.
    expect(hits("-has:date")).toEqual(["none", "code"]);
  });
});
