/**
 * Object keys in sorted order and one field per line. Sorting is what makes the
 * bytes depend on the content alone rather than on which device assembled the
 * object, so an untouched document never looks changed; the indentation is what
 * makes a one-row edit a one-line diff.
 */
export function serialize(value: unknown): string {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) out[key] = ordered(source[key]);
  return out;
}

export function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Bytes as a string, one character per byte.
 *
 * Attachments go through the same seal-and-base64 path as the notes, and that
 * path speaks strings — so the bytes are carried as latin-1 rather than given
 * a second encoding of their own.
 */
export function toBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 0x8000) out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return out;
}

export function fromBinaryString(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

/** btoa/atob speak latin-1 only; the notes are UTF-8. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
