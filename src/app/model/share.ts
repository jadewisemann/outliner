/**
 * What a phone's share sheet handed over, if this launch came from one.
 *
 * The manifest declares a GET share target, so a share arrives as query
 * parameters on an ordinary launch — which is why this can exist at all
 * without a server to POST to.
 */
export function sharedText(search: string): string | null {
  const params = new URLSearchParams(search);
  const parts = [params.get("title"), params.get("text"), params.get("url")]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
  if (parts.length === 0) return null;
  // A share of a page sends its title and its URL separately; one line reads
  // better than three, and the outline can always be split afterwards.
  return [...new Set(parts)].join(" — ");
}

/** Clears the share out of the address bar, so a reload does not capture twice. */
export function forgetShare(): void {
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
}
