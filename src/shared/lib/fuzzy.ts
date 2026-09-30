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
