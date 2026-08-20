import type { ReactNode } from "react";

/**
 * Enough highlighting to read a code block by, and no library.
 *
 * A real highlighter knows a hundred grammars and costs several hundred
 * kilobytes — this project's whole bundle is smaller than that. What actually
 * makes a block readable is the shape: strings and comments recede, numbers
 * and keywords stand out. That much is the same in every language a note is
 * likely to hold, so one language-agnostic pass does it.
 *
 * Being approximate is the point. A word that is a keyword somewhere and an
 * identifier here is coloured either way, and nothing is worse for it.
 */

const KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "def", "default", "del", "elif",
  "else", "end", "enum", "export", "extends", "false", "final", "finally", "fn", "for", "from", "func", "function",
  "go", "if", "impl", "import", "in", "interface", "is", "let", "match", "mod", "module", "mut", "new", "nil", "none",
  "not", "null", "or", "package", "pass", "private", "public", "pub", "raise", "return", "select", "self", "static",
  "struct", "super", "switch", "then", "this", "throw", "trait", "true", "try", "type", "typedef", "undefined",
  "union", "unless", "until", "use", "var", "void", "when", "where", "while", "with", "yield"
]);

/**
 * Ordered by precedence: a `//` inside a string is not a comment, so strings
 * and comments are matched in one alternation rather than in two passes.
 */
const TOKEN =
  /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/|\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b|\b[A-Za-z_]\w*\b)/g;

export function highlight(code: string): ReactNode {
  const out: ReactNode[] = [];
  let cursor = 0;

  for (const match of code.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > cursor) out.push(code.slice(cursor, at));
    const token = match[0];
    const kind = classify(token);
    out.push(kind ? <span key={at} className={`tok-${kind}`}>{token}</span> : token);
    cursor = at + token.length;
  }
  if (cursor < code.length) out.push(code.slice(cursor));
  return out;
}

function classify(token: string): "string" | "comment" | "number" | "keyword" | null {
  const first = token[0];
  if (first === '"' || first === "'" || first === "`") return "string";
  if (token.startsWith("//") || token.startsWith("/*") || first === "#" || token.startsWith("--")) return "comment";
  if (first >= "0" && first <= "9") return "number";
  return KEYWORDS.has(token) ? "keyword" : null;
}
