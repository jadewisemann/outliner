import type { Selection } from "./markdown";

/**
 * Dates, written the way Dynalist writes them: `!(2026-09-29)`, optionally
 * with a time `!(2026-09-29 14:30)`, and anything after that inside the
 * parentheses (Dynalist's ranges and repeat rules) kept as it is.
 *
 * A date is text in the row, like every other piece of formatting (DESIGN.md
 * principle 14): no field, no schema change, nothing new to merge. That is
 * also why an import from Dynalist keeps its dates — they arrive as exactly
 * this text, and now they render and search instead of sitting there as
 * punctuation.
 *
 * Only the first date in a token is read. A range or a repeat rule is shown
 * verbatim after it rather than interpreted: guessing at a rule and getting it
 * wrong would be worse than showing it.
 */

/** Matches one date token. Shared by the inline renderer and the search. */
export const DATE_SOURCE = "!\\(\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{1,2}:\\d{2})?[^)\\n]*\\)";

const PARTS = /^!\((\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?([^)]*)\)$/;

export type ParsedDate = {
  /** Local midnight of the day, in ms. */
  day: number;
  /** `HH:MM`, when the token has one. */
  time: string | null;
  /** Whatever followed the date inside the parentheses, trimmed. */
  rest: string;
};

export type DateState = "overdue" | "today" | "soon" | "later";

const DAY_MS = 24 * 3600_000;

export function parseDate(token: string): ParsedDate | null {
  const match = token.match(PARTS);
  if (!match) return null;
  const [, y, m, d, hh, mm, rest] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // `2026-02-31` would roll into March; a date that does not exist is not a date.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  const time = hh === undefined ? null : `${hh.padStart(2, "0")}:${mm}`;
  if (time && (Number(hh) > 23 || Number(mm) > 59)) return null;
  return { day: date.getTime(), time, rest: rest.trim() };
}

function midnight(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days from today to the date; negative is past. Calendar days, so DST cannot shift it. */
export function daysFrom(day: number, now: number): number {
  return Math.round((day - midnight(now)) / DAY_MS);
}

export function dateState(date: ParsedDate, now: number): DateState {
  const days = daysFrom(date.day, now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "soon";
  return "later";
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** How a date reads in a row: relative when near, absolute otherwise. */
export function formatDate(date: ParsedDate, now: number): string {
  const days = daysFrom(date.day, now);
  const at = new Date(date.day);
  const near: Record<number, string> = { [-1]: "어제", 0: "오늘", 1: "내일" };
  let label = near[days];
  if (label === undefined) {
    const sameYear = at.getFullYear() === new Date(now).getFullYear();
    label = `${sameYear ? "" : `${at.getFullYear()}년 `}${at.getMonth() + 1}월 ${at.getDate()}일 (${WEEKDAYS[at.getDay()]})`;
  }
  if (date.time) label += ` ${date.time}`;
  if (date.rest) label += ` ${date.rest}`;
  return label;
}

/** The token for a day, `!(YYYY-MM-DD)`, local time. */
export function dateToken(now: number, offsetDays = 0): string {
  const at = new Date(midnight(now) + offsetDays * DAY_MS + DAY_MS / 2);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `!(${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())})`;
}

/**
 * `!!` as today's date, `!(YYYY-MM-DD)`, read as the second `!` is typed: the
 * first one is left of the caret and becomes the token. The date itself comes
 * back selected, so typing replaces it and → keeps it. Only at the start of a
 * word: "감사합니다!!" is punctuation, not a date.
 */
export function autoDate(text: string, caret: number, now: number): Selection | null {
  if (caret === 0 || text[caret - 1] !== "!") return null;
  if (caret > 1 && !/\s/.test(text[caret - 2])) return null;
  const token = dateToken(now);
  // The token starts where the first `!` was, so the date starts past its `!(`.
  const start = caret + 1;
  return { text: text.slice(0, caret - 1) + token + text.slice(caret), start, end: start + token.length - 3 };
}
