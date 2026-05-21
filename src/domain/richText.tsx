import type { ReactNode } from "react";

export function renderInlineMarkdown(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(!?\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\$([^$\n]+)\$|\*\*([^*]+)\*\*|~~([^~]+)~~|==(.+?)==|\*([^*]+)\*)/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(source.slice(cursor, start));
    }
    const token = match[0];
    if (token.startsWith("![")) {
      nodes.push(
        <a key={start} href={safeHref(match[3])} rel="noreferrer" target="_blank">
          {match[2]}
        </a>
      );
    } else if (match[1]?.startsWith("[")) {
      nodes.push(
        <a key={start} href={safeHref(match[3])} rel="noreferrer" target="_blank">
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(<code key={start}>{match[4]}</code>);
    } else if (match[5]) {
      nodes.push(
        <span key={start} className="rich-latex-inline" role="img" aria-label={`LaTeX ${match[5]}`}>
          {match[5]}
        </span>
      );
    } else if (match[6]) {
      nodes.push(<strong key={start}>{match[6]}</strong>);
    } else if (match[7]) {
      nodes.push(<s key={start}>{match[7]}</s>);
    } else if (match[8]) {
      nodes.push(<mark key={start}>{match[8]}</mark>);
    } else if (match[9]) {
      nodes.push(<em key={start}>{match[9]}</em>);
    }
    cursor = start + token.length;
  }
  if (cursor < source.length) {
    nodes.push(source.slice(cursor));
  }
  return nodes.length > 0 ? nodes : [source || "\u00a0"];
}

export function renderMarkdownLikeText(source: string): ReactNode[] {
  if (!source.includes("```") && !source.includes("$$")) {
    return renderInlineMarkdown(source);
  }
  const nodes: ReactNode[] = [];
  const pattern = /(```([A-Za-z0-9_-]+)?\n?([\s\S]*?)```|\$\$\n?([\s\S]*?)\$\$)/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(<span key={`text-${cursor}`}>{renderInlineMarkdown(source.slice(cursor, start))}</span>);
    }
    if (match[0].startsWith("```")) {
      nodes.push(
        <pre key={start} className="rich-code-block" data-language={match[2] ?? ""}>
          <code>{trimCodeBlock(match[3] ?? "")}</code>
        </pre>
      );
    } else {
      const expression = trimCodeBlock(match[4] ?? "");
      nodes.push(
        <span key={start} className="rich-latex-block" role="img" aria-label={`LaTeX ${expression}`}>
          {expression}
        </span>
      );
    }
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    nodes.push(<span key={`text-${cursor}`}>{renderInlineMarkdown(source.slice(cursor))}</span>);
  }
  return nodes.length > 0 ? nodes : [source || "\u00a0"];
}

function trimCodeBlock(source: string): string {
  return source.replace(/^\n/, "").replace(/\n$/, "");
}

function safeHref(href: string): string {
  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }
  return "#";
}
