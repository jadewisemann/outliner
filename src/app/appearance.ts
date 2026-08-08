/**
 * How the text looks, and where the shell keeps that.
 *
 * Device-local, like the theme: the same workspace read on a phone and on a
 * 27-inch screen does not want the same measure. Nothing here travels.
 */

export type Appearance = {
  family: "sans" | "serif" | "mono";
  /** Body size in px; everything else is relative to it. */
  size: number;
  lineHeight: number;
  /** Measure, in px, of the column the outline sits in. */
  width: number;
};

export const DEFAULT_APPEARANCE: Appearance = { family: "sans", size: 15, lineHeight: 1.55, width: 780 };

const KEY = "outliner:appearance";

const FAMILIES: Record<Appearance["family"], string> = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", Pretendard, "Malgun Gothic", sans-serif',
  serif: '"Iowan Old Style", Charter, Georgia, "Noto Serif KR", "Apple SD Gothic Neo", serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, "D2Coding", monospace'
};

export function loadAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULT_APPEARANCE;
    return clamp({ ...DEFAULT_APPEARANCE, ...(raw as Partial<Appearance>) });
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(appearance));
  } catch {
    /* private mode — it just resets next time */
  }
}

/** Written as CSS variables, so every rule that already reads them follows. */
export function applyAppearance(appearance: Appearance): void {
  const style = document.documentElement.style;
  const safe = clamp(appearance);
  style.setProperty("--font", FAMILIES[safe.family]);
  style.setProperty("--body-size", `${safe.size}px`);
  style.setProperty("--body-leading", `${safe.lineHeight}`);
  style.setProperty("--measure", `${safe.width}px`);
}

/** Values arrive from storage, which is to say from anywhere. */
function clamp(appearance: Appearance): Appearance {
  const number = (value: unknown, fallback: number, low: number, high: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, low), high) : fallback;
  return {
    family: appearance.family in FAMILIES ? appearance.family : "sans",
    size: number(appearance.size, DEFAULT_APPEARANCE.size, 12, 24),
    lineHeight: number(appearance.lineHeight, DEFAULT_APPEARANCE.lineHeight, 1.2, 2.2),
    width: number(appearance.width, DEFAULT_APPEARANCE.width, 520, 1400)
  };
}

/* ------------------------------------------------------------------ */
/* quick capture                                                       */
/* ------------------------------------------------------------------ */

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
