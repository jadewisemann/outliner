import { exportDoc, type Doc, type SyncPayload } from "@/entities/outline";

/**
 * The Markdown mirror: a plain-text projection of the workspace written beside
 * the documents it comes from.
 *
 * It is derived output and never an input. The app writes these files and does
 * not read them back, which is the whole reason they are allowed to be lossy:
 * the `.json` next door still holds the stamps, the sort keys and the
 * tombstones the merge needs. What the mirror buys is that a person with the
 * repository and no app can still read their notes.
 *
 * Turning it into a second source of truth is the failure Logseq lived through
 * and retreated from — see `docs/research/logseq-prior-art.md`.
 */
type MirrorFile = { name: string; text: string };

/** Windows refuses these outright, whatever the extension. */
const DEVICE_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)
]);

/**
 * Long enough to stay recognisable, short enough that the disambiguating
 * suffix and the extension still fit inside every filesystem's limit.
 */
const MAX_STEM = 120;

const UNSAFE = /[<>:"|?*\\/]/g;
const CONTROL = /[\u0000-\u001f]/g;

/**
 * A title is written by a person, so it can hold anything. This has to survive
 * as a file name on macOS, Windows and Linux alike, and produce the same answer
 * on all three — two devices that disagreed about the name would fight over the
 * file forever.
 */
export function fileStem(title: string): string {
  const stem = title
    .normalize("NFC")
    .replace(UNSAFE, "_")
    .replace(CONTROL, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_STEM)
    // Windows drops trailing spaces and dots, so a name ending in one would
    // read back different from what was written.
    .replace(/[ .]+$/, "");
  if (stem === "") return "untitled";
  // Prefixed rather than replaced: the title stays readable in the file name.
  return DEVICE_NAMES.has(stem.toUpperCase()) ? `_${stem}` : stem;
}

function heading(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();
  return line === "" ? "untitled" : line;
}

/**
 * The id rides inside the file rather than in its name. A name is an address
 * and changes when the title does; the id is what the document actually is, so
 * a person holding only this file can still tell which `.json` it came from.
 */
export function mirrorText(doc: Doc): string {
  const body = exportDoc(doc, "markdown");
  return `---\noutliner-id: ${doc.id}\n---\n\n# ${heading(doc.title)}\n\n${body}\n`;
}

/**
 * Every mirror file the workspace should have, recomputed from scratch on each
 * push rather than patched. Folders, saved searches and trashed documents get
 * no file: there is no outline in them to read.
 *
 * Two documents can share a title, so names are allocated in document-id order
 * and later ones take a ` (2)` suffix. Ordering by id rather than by title is
 * what keeps every device at the same answer. It does mean a new document can
 * take a name an older one held: these paths are stable enough to read, not
 * stable enough to link to, and that is the accepted limit of a derived file.
 */
export function markdownMirror(payload: SyncPayload): MirrorFile[] {
  const docs = Object.values(payload.docs)
    .filter((doc) => doc.kind === "doc" && doc.deleted === null && Boolean(doc.nodes[doc.rootId]))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  // Case-insensitive: macOS and Windows treat two names that differ only in
  // case as one file, and the second write would silently eat the first.
  const taken = new Set<string>();
  const files: MirrorFile[] = [];
  for (const doc of docs) {
    const stem = fileStem(doc.title);
    let name = `${stem}.md`;
    for (let index = 2; taken.has(name.toLowerCase()); index += 1) name = `${stem} (${index}).md`;
    taken.add(name.toLowerCase());
    files.push({ name, text: mirrorText(doc) });
  }
  return files;
}
