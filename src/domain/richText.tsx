import type { ReactNode } from "react";

export function renderInlineMarkdown(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(!?\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|==(.+?)==|\*([^*]+)\*)/g;
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
      nodes.push(<strong key={start}>{match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(<s key={start}>{match[6]}</s>);
    } else if (match[7]) {
      nodes.push(<mark key={start}>{match[7]}</mark>);
    } else if (match[8]) {
      nodes.push(<em key={start}>{match[8]}</em>);
    }
    cursor = start + token.length;
  }
  if (cursor < source.length) {
    nodes.push(source.slice(cursor));
  }
  return nodes.length > 0 ? nodes : [source || "\u00a0"];
}

function safeHref(href: string): string {
  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }
  return "#";
}
