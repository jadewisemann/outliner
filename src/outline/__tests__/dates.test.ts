import { describe, expect, it } from "vitest";
import { autoDate, dateState, dateToken, formatDate, parseDate } from "../dates";
import { inlineDates } from "../inline";
import { parseQuery } from "../../search/query";
import { makeNode } from "../../types";

// Noon on a Tuesday, local time, so no test sits on a day boundary.
const NOW = new Date(2026, 8, 29, 12, 0).getTime();

describe("dates", () => {
  it("reads Dynalist's spellings and refuses days that do not exist", () => {
    expect(parseDate("!(2026-09-29)")).toMatchObject({ time: null, rest: "" });
    expect(parseDate("!(2026-09-29 9:05)")).toMatchObject({ time: "09:05" });
    expect(parseDate("!(2026-09-29 | 1w)")).toMatchObject({ rest: "| 1w" });
    expect(parseDate("!(2026-02-31)")).toBeNull();
    expect(parseDate("!(2026-09-29 25:00)")).toBeNull();
  });

  it("says how near a date is in calendar days", () => {
    const at = (token: string) => dateState(parseDate(token)!, NOW);
    expect(at("!(2026-09-28)")).toBe("overdue");
    expect(at("!(2026-09-29)")).toBe("today");
    expect(at("!(2026-10-06)")).toBe("soon");
    expect(at("!(2026-10-07)")).toBe("later");
  });

  it("labels near days relatively and others with the weekday", () => {
    const label = (token: string) => formatDate(parseDate(token)!, NOW);
    expect(label("!(2026-09-29)")).toBe("오늘");
    expect(label("!(2026-09-30 14:00)")).toBe("내일 14:00");
    expect(label("!(2026-10-02)")).toBe("10월 2일 (금)");
    expect(label("!(2027-01-03)")).toBe("2027년 1월 3일 (일)");
  });

  it("writes today's token and finds every date in a row", () => {
    expect(dateToken(NOW)).toBe("!(2026-09-29)");
    expect(dateToken(NOW, 3)).toBe("!(2026-10-02)");
    expect(inlineDates("from !(2026-09-01) to !(2026-09-30), not !(2026-13-01)")).toHaveLength(2);
  });

  it("turns `!!` into today's date only at the start of a word, with the date selected", () => {
    // Read as the second `!` is typed: the first one is already left of the caret.
    const typed = autoDate("due ! later", 5, NOW)!;
    expect(typed.text).toBe("due !(2026-09-29) later");
    expect(typed.text.slice(typed.start, typed.end)).toBe("2026-09-29");
    expect(autoDate("!", 1, NOW)).toEqual({ text: "!(2026-09-29)", start: 2, end: 12 });
    // "감사합니다!!" is punctuation, and so is "!!!".
    expect(autoDate("감사합니다!", 6, NOW)).toBeNull();
    expect(autoDate("!!", 2, NOW)).toBeNull();
    expect(autoDate("no bang", 7, NOW)).toBeNull();
    expect(autoDate("", 0, NOW)).toBeNull();
  });

  it("filters with date: and has:date", () => {
    const rows = ["past !(2026-09-01)", "now !(2026-09-29)", "soon !(2026-10-03)", "none", "code `!(2026-09-29)`"].map((text) =>
      makeNode({ text })
    );
    const hits = (query: string) =>
      rows.filter((node) => parseQuery(query, NOW)!({ node, trail: [] })).map((node) => node.text.split(" ")[0]);
    expect(hits("date:overdue")).toEqual(["past"]);
    expect(hits("date:today")).toEqual(["now"]);
    expect(hits("date:7d")).toEqual(["now", "soon"]);
    expect(hits("date:2026-10-03")).toEqual(["soon"]);
    expect(hits("has:date")).toEqual(["past", "now", "soon"]);
    // A date inside a code span renders as code, so it is not a date to search either.
    expect(hits("-has:date")).toEqual(["none", "code"]);
  });
});
