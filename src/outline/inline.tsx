import type { ReactNode } from "react";
import { highlight } from "./highlight";
// Named TeX rather than Math: this file does arithmetic with the global one.
import { TeX } from "./components/TeX";

/**
 * Inline markup understood in a row: **bold**, *italic*, `code`, ~~strike~~,
 * ==highlight==, ![image](url), [label](url), bare URLs, #tag,
 * [[document link]], ((item link)) and $$math$$.
 */
const PATTERN =
  /(\$\$(?!\s)[^$\n]+\$\$|\*\*(?!\s)[^*\n]+\*\*|(?<![\w*])\*(?!\s)(?:[^*\n]*[^\s*])?\*|`[^`\n]+`|~~(?!\s)[^~\n]+~~|==(?!\s)[^=\n]+==|\[\[[^\]\n]+\]\]|\(\([\w-]{1,64}\)\)|!\[[^\]\n]*\]\([^)\s]+\)|\[[^\]\n]*\]\([^)\s]+\)|https?:\/\/[^\s<>()]+|(?<![\w#])#[\p{L}\p{N}_/-]+)/gu;

type InlineHandlers = {
  onTagClick?: (tag: string) => void;
  onDocLinkClick?: (title: string) => void;
  onItemLinkClick?: (id: string) => void;
  /** The target's current text, so a link never disagrees with the row it names. */
  resolveItem?: (id: string) => string | null;
  /** Images are only drawn where there is room; a picker list wants the text. */
  showImages?: boolean;
  /**
   * Renders links and tags as plain spans. Set where the whole line is already
   * a control — a backlink entry, a search hit — since a button inside a
   * button is neither valid nor operable.
   */
  inert?: boolean;
};

export function renderInline(source: string, handlers: InlineHandlers = {}): ReactNode {
  if (source === "") return null;
  const out: ReactNode[] = [];
  let cursor = 0;

  for (const match of source.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) out.push(source.slice(cursor, start));
    out.push(renderToken(match[0], start, handlers));
    cursor = start + match[0].length;
  }
  if (cursor < source.length) out.push(source.slice(cursor));
  return out;
}

function renderToken(token: string, key: number, handlers: InlineHandlers): ReactNode {
  if (token.startsWith("$$")) {
    const source = token.slice(2, -2);
    return handlers.inert ? source : <TeX key={key} source={source} block={false} />;
  }
  if (token.startsWith("**")) return <strong key={key}>{token.slice(2, -2)}</strong>;
  if (token.startsWith("~~")) return <s key={key}>{token.slice(2, -2)}</s>;
  if (token.startsWith("==")) return <mark key={key}>{token.slice(2, -2)}</mark>;
  if (token.startsWith("`")) return <code key={key}>{token.slice(1, -1)}</code>;
  if (token.startsWith("*")) return <em key={key}>{token.slice(1, -1)}</em>;

  if (token.startsWith("[[")) {
    const title = token.slice(2, -2);
    if (handlers.inert) return <span key={key} className="inline-doclink">{title}</span>;
    return (
      <button
        key={key}
        type="button"
        className="inline-doclink"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handlers.onDocLinkClick?.(title);
        }}
      >
        {title}
      </button>
    );
  }

  if (token.startsWith("((")) {
    const id = token.slice(2, -2);
    const label = handlers.resolveItem?.(id) ?? null;
    if (handlers.inert) {
      return (
        <span key={key} className={`inline-itemlink${label === null ? " inline-itemlink-broken" : ""}`}>
          {label ?? "(없는 항목)"}
        </span>
      );
    }
    // A target that is gone stays visible and stays broken. Quietly deleting
    // the link would hide the fact that something it referred to went away.
    return (
      <button
        key={key}
        type="button"
        className={`inline-itemlink${label === null ? " inline-itemlink-broken" : ""}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (label !== null) handlers.onItemLinkClick?.(id);
        }}
      >
        {label ?? "(없는 항목)"}
      </button>
    );
  }

  if (token.startsWith("#")) {
    if (handlers.inert) return <span key={key} className="inline-tag">{token}</span>;
    return (
      <button
        key={key}
        type="button"
        className="inline-tag"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handlers.onTagClick?.(token);
        }}
      >
        {token}
      </button>
    );
  }

  if (token.startsWith("![")) {
    const split = token.indexOf("](");
    const alt = token.slice(2, split);
    const src = token.slice(split + 2, -1);
    if (!handlers.showImages || !/^https?:\/\//i.test(src)) return `${alt || src}`;
    return <img key={key} className="inline-image" src={src} alt={alt} loading="lazy" />;
  }

  if (token.startsWith("[")) {
    const split = token.indexOf("](");
    const label = token.slice(1, split);
    if (handlers.inert) return label;
    return (
      <a key={key} href={safeHref(token.slice(split + 2, -1))} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }

  if (handlers.inert) return token;
  return (
    <a key={key} href={safeHref(token)} target="_blank" rel="noreferrer">
      {token}
    </a>
  );
}

function safeHref(href: string): string {
  return /^(https?:|mailto:)/i.test(href) ? href : `https://${href.replace(/^\/+/, "")}`;
}

/**
 * Maps an offset in the *rendered* text back to an offset in the source, so
 * clicking formatted text puts the caret where it looks like it should go.
 */
export function sourceOffset(source: string, renderedOffset: number): number {
  let rendered = 0;
  let cursor = 0;

  const advance = (plainLength: number, sourceLength: number, sourceStart: number): number | null => {
    if (rendered + plainLength >= renderedOffset) return sourceStart + Math.min(renderedOffset - rendered, sourceLength);
    rendered += plainLength;
    return null;
  };

  for (const match of source.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      const plain = source.slice(cursor, start);
      const hit = advance(plain.length, plain.length, cursor);
      if (hit !== null) return hit;
    }
    const token = match[0];
    const hit = advance(visibleLength(token), token.length, start);
    if (hit !== null) return hit;
    cursor = start + token.length;
  }
  const tail = source.slice(cursor);
  return Math.min(cursor + Math.max(0, renderedOffset - rendered), cursor + tail.length);
}

function visibleLength(token: string): number {
  if (token.startsWith("**") || token.startsWith("~~") || token.startsWith("==")) return token.length - 4;
  if (token.startsWith("[[") || token.startsWith("((") || token.startsWith("$$")) return token.length - 4;
  if (token.startsWith("`") || (token.startsWith("*") && !token.startsWith("**"))) return token.length - 2;
  const label = token.match(/^!?\[([^\]]*)\]\(/);
  if (label) return label[1].length;
  return token.length;
}

const TAG_PATTERN = /(?<![\w#])#[\p{L}\p{N}_/-]+/gu;

export function extractTags(text: string): string[] {
  return [...text.matchAll(TAG_PATTERN)].map((match) => match[0]);
}

/**
 * A note, rendered rather than shown as source: ``` fences become code blocks,
 * `> ` lines become quotations, everything else keeps the inline markup.
 *
 * A row's text is one line by construction — one textarea, one item — so a
 * multi-line code block has nowhere to live except a note. That is where it
 * belongs anyway: the block is commentary on the row, not the row.
 */
export function renderNote(source: string, handlers: InlineHandlers = {}): ReactNode {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let at = 0;

  while (at < lines.length) {
    const fence = lines[at].match(/^```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      at += 1;
      while (at < lines.length && !/^```\s*$/.test(lines[at])) {
        body.push(lines[at]);
        at += 1;
      }
      // A fence left unclosed still renders as a block; refusing to would mean
      // the note looks broken while it is being written.
      at += 1;
      out.push(
        <pre key={out.length} className="note-code" data-language={fence[1] || undefined}>
          <code>{highlight(body.join("\n"))}</code>
        </pre>
      );
      continue;
    }

    const paragraph: string[] = [];
    const quoted = lines[at].startsWith("> ");
    while (at < lines.length && !/^```/.test(lines[at]) && lines[at].startsWith("> ") === quoted) {
      paragraph.push(quoted ? lines[at].slice(2) : lines[at]);
      at += 1;
    }
    const text = paragraph.join("\n");
    out.push(
      quoted ? (
        <blockquote key={out.length}>{renderInline(text, handlers)}</blockquote>
      ) : (
        <p key={out.length}>{renderInline(text, handlers)}</p>
      )
    );
  }
  return out;
}
