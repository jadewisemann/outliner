import type { Files } from "./remote";

/**
 * Attachments, from the clipboard to the row and back out again.
 *
 * The trade this makes is worth stating plainly: bytes in the repository make
 * the repository bigger for ever, and a sealed attachment cannot be linked to
 * from anywhere else — not from GitHub's own web view, not from a browser tab.
 * In exchange an image lives with the notes it belongs to, on the same backend
 * with the same key, and survives without a second service to lose.
 *
 * Files are named by the hash of their contents, so the same image pasted
 * twice is stored once and a rename cannot desynchronise anything.
 */

/**
 * GitHub's contents API stops returning a file's bytes inline past a
 * megabyte, and reading around that costs a second request per attachment.
 * A megabyte is a generous screenshot; refusing loudly beats a picture that
 * uploads and then will not come back.
 */
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;

export const FILE_SCHEME = "file:";

const objectUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

export async function nameFor(bytes: Uint8Array<ArrayBuffer>, type: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest).slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hash}${extensionOf(type)}`;
}

function extensionOf(type: string): string {
  const known: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg"
  };
  return known[type] ?? ".bin";
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml"
};

/**
 * A local URL for an attachment, fetched once per session.
 *
 * The cache is keyed by name, and names are content hashes, so a cached URL
 * can never be stale — the bytes behind a name do not change.
 */
export function attachmentUrl(files: Files | null, name: string): Promise<string | null> {
  const cached = objectUrls.get(name);
  if (cached) return Promise.resolve(cached);
  if (!files) return Promise.resolve(null);

  const running = inFlight.get(name);
  if (running) return running;

  const request = files
    .get(name)
    .then((bytes) => {
      if (!bytes) return null;
      const type = MIME[name.split(".").pop() ?? ""] ?? "application/octet-stream";
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
      objectUrls.set(name, url);
      return url;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(name));

  inFlight.set(name, request);
  return request;
}

/** Marks the bytes as available before they have been fetched back. */
export function rememberUpload(name: string, blob: Blob): void {
  objectUrls.set(name, URL.createObjectURL(blob));
}
