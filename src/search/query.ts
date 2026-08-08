import { extractTags } from "../outline/inline";
import type { Node } from "../types";

/**
 * The query language, shared by the search panel and the in-document filter.
 *
 * Both need the same answer to "does this row match", and a filter that
 * understood fewer operators than the search box would be a trap — the same
 * query would quietly mean two things.
 */

export type Target = {
  node: Node;
  /** Ancestor texts, root-first. */
  trail: string[];
};

export type Predicate = (target: Target) => boolean;

type Term = { negated: boolean; test: Predicate };

const DURATION = /^(\d+)([dwmy])$/;
const DURATION_MS: Record<string, number> = {
  d: 24 * 3600_000,
  w: 7 * 24 * 3600_000,
  m: 30 * 24 * 3600_000,
  y: 365 * 24 * 3600_000
};

/**
 * Every term must hold (AND). A term is a word, a `"quoted phrase"`, a
 * `#tag`, or an `operator:value`; a leading `-` negates any of them.
 *
 * Returns null for a query that asks for nothing, so callers can tell "no
 * filter" from "a filter that matches nothing".
 */
export function parseQuery(input: string, now = Date.now()): Predicate | null {
  const terms = tokenize(input).map((token) => toTerm(token, now));
  if (terms.length === 0) return null;
  return (target) => terms.every((term) => term.test(target) !== term.negated);
}

/** Splits on whitespace, except inside double quotes. */
function tokenize(input: string): string[] {
  return (input.match(/-?(?:[a-z]+:)?"[^"]*"|\S+/gi) ?? []).filter((token) => token !== "-" && token !== "");
}

function toTerm(token: string, now: number): Term {
  const negated = token.startsWith("-");
  const body = negated ? token.slice(1) : token;
  return { negated, test: toTest(body, now) };
}

function toTest(body: string, now: number): Predicate {
  if (body.startsWith("#")) {
    const wanted = body.toLowerCase();
    // `#work` also finds `#work/urgent`: a tag hierarchy is only useful if the
    // parent finds its children.
    return ({ node }) =>
      extractTags(node.text).some((tag) => {
        const found = tag.toLowerCase();
        return found === wanted || found.startsWith(`${wanted}/`);
      });
  }

  const colon = body.indexOf(":");
  if (colon > 0) {
    const operator = body.slice(0, colon).toLowerCase();
    const value = unquote(body.slice(colon + 1)).toLowerCase();
    const operatorTest = OPERATORS[operator]?.(value, now);
    if (operatorTest) return operatorTest;
  }

  const needle = unquote(body).toLowerCase();
  return ({ node }) => `${node.text}\n${node.note}`.toLowerCase().includes(needle);
}

const OPERATORS: Record<string, (value: string, now: number) => Predicate | null> = {
  is: (value) => {
    if (value === "completed" || value === "done") return ({ node }) => node.done;
    if (value === "incomplete" || value === "todo") return ({ node }) => !node.done;
    if (value === "heading") return ({ node }) => node.heading > 0;
    if (value === "bookmarked") return ({ node }) => node.bookmarked;
    if (value === "coloured" || value === "colored") return ({ node }) => node.color > 0;
    return null;
  },
  has: (value) => {
    if (value === "note") return ({ node }) => node.note !== "";
    if (value === "link") return ({ node }) => /\[[^\]]*\]\([^)\s]+\)|https?:\/\//.test(node.text);
    if (value === "image") return ({ node }) => /!\[[^\]]*\]\([^)\s]+\)/.test(node.text);
    if (value === "tag") return ({ node }) => extractTags(node.text).length > 0;
    if (value === "child") return ({ node }) => node.children.length > 0;
    return null;
  },
  edited: (value, now) => within(value, now, (node) => node.edited.at),
  created: (value, now) => within(value, now, (node) => node.created.at),
  parent: (value) => ({ trail }) => (trail.at(-1) ?? "").toLowerCase().includes(value),
  ancestor: (value) => ({ trail }) => trail.some((text) => text.toLowerCase().includes(value))
};

/** `edited:3d` — touched within the last three days. */
function within(value: string, now: number, stampOf: (node: Node) => number): Predicate | null {
  const match = value.match(DURATION);
  if (!match) return null;
  const since = now - Number(match[1]) * DURATION_MS[match[2]];
  return ({ node }) => stampOf(node) >= since;
}

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1) : value;
}
