import type { Node } from "../types";

/**
 * The keyboard half of markdown: the shortcuts that wrap a selection and the
 * line prefixes that turn into a row's own fields as you type.
 *
 * All of it is pure string work. A row is a plain textarea holding markdown
 * source (see `Editable`), so "make this bold" really is "put two asterisks
 * around these characters" — there is no document model to go through.
 */

export type Selection = { text: string; start: number; end: number };

const WRAPS = {
  bold: "**",
  italic: "*",
  code: "`",
  strike: "~~",
  highlight: "=="
} as const;

export type WrapKind = keyof typeof WRAPS;

/**
 * Puts a marker around the selection, or takes it off when it is already
 * there. Pressing the same shortcut twice has to leave the row exactly as it
 * started, or the shortcut is a trap rather than a toggle.
 *
 * With nothing selected it inserts the empty pair and puts the caret inside,
 * so ⌘B then typing works the way it does everywhere else.
 */
export function toggleWrap(text: string, start: number, end: number, kind: WrapKind): Selection {
  const mark = WRAPS[kind];
  const width = mark.length;
  const inner = text.slice(start, end);

  // `*` and `**` share a character, so a marker only counts when the run
  // around the selection is exactly that long — otherwise ⌘I on **bold** would
  // peel one asterisk off each side and produce *bold* instead of ***bold***.
  const run = mark[0];
  /** The marker at `at`, and not part of a longer run of the same character. */
  const marked = (value: string, at: number) =>
    at >= 0 && value.startsWith(mark, at) && value[at - 1] !== run && value[at + width] !== run;

  // Marker sits just outside the selection: "**|bold|**".
  if (start >= width && marked(text, start - width) && marked(text, end)) {
    return {
      text: text.slice(0, start - width) + inner + text.slice(end + width),
      start: start - width,
      end: end - width
    };
  }

  // Marker sits inside the selection: "|**bold**|".
  if (inner.length >= width * 2 && marked(inner, 0) && marked(inner, inner.length - width)) {
    const stripped = inner.slice(width, -width);
    return { text: text.slice(0, start) + stripped + text.slice(end), start, end: start + stripped.length };
  }

  return {
    text: `${text.slice(0, start)}${mark}${inner}${mark}${text.slice(end)}`,
    start: start + width,
    end: end + width
  };
}

/**
 * `[selected](…)` with the caret between the parentheses, which is where the
 * next thing typed or pasted belongs. Over an existing link it unwraps back to
 * the label, so ⌘K is a toggle like the rest of them.
 */
export function toggleLink(text: string, start: number, end: number): Selection {
  const around = text.slice(0, start).lastIndexOf("[");
  if (around !== -1) {
    const closing = text.indexOf("](", end);
    const finish = closing === -1 ? -1 : text.indexOf(")", closing);
    if (closing !== -1 && finish !== -1 && text.slice(around + 1, closing).length >= 0 && closing >= end) {
      const label = text.slice(around + 1, closing);
      return { text: text.slice(0, around) + label + text.slice(finish + 1), start: around, end: around + label.length };
    }
  }

  const label = text.slice(start, end);
  const caret = start + label.length + 3;
  return { text: `${text.slice(0, start)}[${label}]()${text.slice(end)}`, start: caret, end: caret };
}

/** Pasting a URL over selected text links it rather than replacing it. */
export function linkTo(text: string, start: number, end: number, url: string): Selection {
  const label = text.slice(start, end);
  const next = `[${label}](${url})`;
  return { text: text.slice(0, start) + next + text.slice(end), start: start + next.length, end: start + next.length };
}

export function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/* ------------------------------------------------------------------ */
/* line prefixes                                                       */
/* ------------------------------------------------------------------ */

export type AutoFormat = {
  /** What was consumed, kept so one Backspace can put it back verbatim. */
  prefix: string;
  /** The row's remaining text. */
  text: string;
  /** Fields for the row itself. */
  node?: Partial<Node>;
  /** Fields for the row's *parent* — a checkbox or a number is a list's decision. */
  parent?: Partial<Node>;
};

const PREFIXES: { pattern: RegExp; apply(match: RegExpMatchArray): Omit<AutoFormat, "prefix" | "text"> }[] = [
  { pattern: /^(#{1,3})$/, apply: (match) => ({ node: { heading: match[1].length as Node["heading"] } }) },
  { pattern: /^\[\s?\]$/, apply: () => ({ parent: { checklist: true } }) },
  { pattern: /^\d{1,3}[.)]$/, apply: () => ({ parent: { numbered: true } }) }
];

/**
 * Reads the text before the caret as a markdown line prefix, at the moment the
 * space that completes it is typed. Only ever fires at the very start of a
 * row: `#` mid-sentence is a tag, and in the middle of a word it is nothing.
 */
export function autoFormat(text: string, caret: number): AutoFormat | null {
  const prefix = text.slice(0, caret);
  if (prefix === "" || prefix.trimStart() !== prefix) return null;

  for (const rule of PREFIXES) {
    const match = prefix.match(rule.pattern);
    if (match) return { prefix, text: text.slice(caret), ...rule.apply(match) };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* completion                                                          */
/* ------------------------------------------------------------------ */

export type Trigger = { kind: "doc" | "tag"; query: string; from: number };

/**
 * What is being completed just left of the caret, if anything: `[[` opens the
 * document picker, `#` the tag picker. A space ends either one — a tag cannot
 * contain one, and a title with a space is still reachable by its first word.
 */
export function completionAt(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);

  const brackets = before.lastIndexOf("[[");
  if (brackets !== -1) {
    const query = before.slice(brackets + 2);
    if (!query.includes("]") && !query.includes("\n")) return { kind: "doc", query, from: brackets };
  }

  const hash = before.lastIndexOf("#");
  if (hash !== -1) {
    const query = before.slice(hash + 1);
    const preceding = hash === 0 ? "" : before[hash - 1];
    if (/^[\p{L}\p{N}_/-]*$/u.test(query) && (preceding === "" || /[\s(]/.test(preceding))) {
      return { kind: "tag", query, from: hash };
    }
  }
  return null;
}

/** Replaces the trigger and its query with the chosen value. */
export function applyCompletion(text: string, caret: number, trigger: Trigger, value: string): Selection {
  const inserted = trigger.kind === "doc" ? `[[${value}]]` : value;
  const next = text.slice(0, trigger.from) + inserted + text.slice(caret);
  const at = trigger.from + inserted.length;
  return { text: next, start: at, end: at };
}

const BOUNDARY = /[\s/#[\](){}._-]/;

/**
 * Subsequence matching, the way an editor's quick-open works: every character
 * of the query in order, anywhere in the candidate.
 *
 * A run beats scattered letters decisively. Without that, "plan" would rank
 * "please label a number" over "project plan", because scattered letters
 * collect more word-boundary bonuses than one solid word does.
 */
export function fuzzy(candidate: string, query: string): { score: number; hits: number[] } | null {
  if (query === "") return { score: 0, hits: [] };
  const haystack = candidate.toLowerCase();
  const needle = query.toLowerCase();

  const whole = haystack.indexOf(needle);
  if (whole !== -1) {
    const boundary = whole === 0 || BOUNDARY.test(haystack[whole - 1]);
    return {
      score: 100 + (boundary ? 20 : 0) - whole - candidate.length / 40,
      hits: Array.from({ length: needle.length }, (_, at) => whole + at)
    };
  }

  const hits: number[] = [];
  let score = 0;
  let at = 0;
  let previous = -2;

  for (const char of needle) {
    const found = haystack.indexOf(char, at);
    if (found === -1) return null;
    hits.push(found);
    if (found === previous + 1) score += 6;
    if (found === 0 || BOUNDARY.test(haystack[found - 1] ?? "")) score += 8;
    previous = found;
    at = found + 1;
  }
  // Earlier and shorter is better, so a short title beats a long one that
  // happens to contain the same letters.
  return { score: score - hits[0] - candidate.length / 40, hits };
}
