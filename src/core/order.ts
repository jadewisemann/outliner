const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0];

/**
 * Fractional index keys: short strings that sort lexicographically and always
 * have room for another key between any two of them.
 *
 * Siblings are ordered by this key instead of by position in an array, which is
 * what lets two devices insert or move rows independently and still merge into
 * one sensible order. No key ever ends in the lowest digit — that invariant is
 * what guarantees a midpoint always exists.
 */
export function keyBetween(lower: string | null, upper: string | null): string {
  return midpoint(lower ?? "", upper);
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`order keys out of sequence: ${a} >= ${b}`);

  if (b !== null) {
    // Keep whatever the two keys already agree on and split the remainder.
    let shared = 0;
    while ((a[shared] ?? ZERO) === b[shared]) shared += 1;
    if (shared > 0) return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
  }

  const low = a === "" ? 0 : DIGITS.indexOf(a[0]);
  const high = b === null ? DIGITS.length : DIGITS.indexOf(b[0]);

  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)];

  // The digits are adjacent, so the answer needs one more character.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[low] + midpoint(a.slice(1), null);
}

/** Keys for `count` items in order, for building a fresh sibling list. */
export function keysAfter(lower: string | null, count: number): string[] {
  const keys: string[] = [];
  let previous = lower;
  for (let index = 0; index < count; index += 1) {
    previous = keyBetween(previous, null);
    keys.push(previous);
  }
  return keys;
}
