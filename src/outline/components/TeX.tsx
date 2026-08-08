import { useEffect, useState } from "react";

/**
 * `$$…$$`, rendered by KaTeX — the one runtime dependency in the project, and
 * the only one loaded on demand.
 *
 * It is roughly four times the size of the whole app, which is why it is
 * behind a dynamic import: a workspace with no formulas in it never fetches
 * a byte of it, and one with formulas pays once. Until it arrives the source
 * is shown as written, which is also what a browser with the fetch blocked
 * will keep showing — a formula reading `\int_0^1 x^2 dx` is worse than the
 * rendered thing but far better than nothing.
 */

type Renderer = (input: string, options: { displayMode: boolean; throwOnError: boolean }) => string;


let pending: Promise<Renderer | null> | null = null;

function loadKatex(): Promise<Renderer | null> {
  pending ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")])
    .then(([katex]): Renderer => (input, options) => katex.default.renderToString(input, options))
    .catch(() => null);
  return pending;
}

export function TeX({ source, block }: { source: string; block: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadKatex().then((render) => {
      if (cancelled) return;
      if (!render) {
        setFailed(true);
        return;
      }
      try {
        setHtml(render(source, { displayMode: block, throwOnError: false }));
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source, block]);

  if (html === null || failed) return <code className="math-source">{source}</code>;
  // KaTeX's output is markup it generated from the source, not anything that
  // arrived from outside — the input is the user's own row.
  return block ? (
    <div className="math math-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="math" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
