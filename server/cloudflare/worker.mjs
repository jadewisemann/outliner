/**
 * The REST backend's contract on Cloudflare's free plan: one Worker in front
 * of one Durable Object that holds the workspace.
 *
 * Same contract as `server/outliner-server.mjs`, and the app cannot tell the
 * two apart (`src/sync/api/remote/rest.ts`): `GET` returns the stored body
 * with an `ETag`, `PUT` with a matching `If-Match` replaces it, a mismatch is
 * 412, an empty remote is 404. Nothing else — the merge is in the client, so
 * this stores bytes and arbitrates writes.
 *
 * Why a Durable Object and not KV: KV is eventually consistent, so two
 * devices could both pass an `If-Match` check against stale copies. A Durable
 * Object is one single-threaded instance with transactional storage, which is
 * exactly a compare-and-swap. SQLite-backed objects are on the Workers Free
 * plan. A value there is capped at 2 MB, so the body is stored in chunks.
 *
 * Deploy: see server/cloudflare/README.md.
 */

/** Same ceiling as the self-hosted server. */
const MAX_BODY = 32 * 1024 * 1024;

/** Under the 2 MB value limit with room to spare. */
const CHUNK = 1024 * 1024;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, if-match",
  // Without this the browser hides the header from the app and the
  // compare-and-swap silently stops happening.
  "access-control-expose-headers": "etag",
  "access-control-max-age": "86400"
};

const reply = (status, headers = {}, body = null) => new Response(body, { status, headers: { ...CORS, ...headers } });

/** Constant-time where the runtime offers it, so the token cannot be recovered a character at a time. */
function tokenMatches(given, expected) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  if (typeof crypto.subtle?.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(a, b);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The storage half, written against the Durable Object storage interface
 * (`get`/`put`/`delete`, each taking a key or a list) so it can be exercised
 * with an in-memory stand-in.
 */
export async function handleWorkspace(request, storage) {
  if (request.method === "GET" || request.method === "HEAD") {
    const meta = await storage.get("meta");
    // 404 is how the client learns the remote is empty and it should push.
    if (!meta) return reply(404, { "content-type": "text/plain" });
    const keys = Array.from({ length: meta.chunks }, (_, i) => `chunk:${i}`);
    const found = keys.length ? await storage.get(keys) : new Map();
    const bytes = new Uint8Array(meta.size);
    let at = 0;
    for (const key of keys) {
      const part = new Uint8Array(found.get(key));
      bytes.set(part, at);
      at += part.length;
    }
    return reply(
      200,
      { "content-type": "application/json; charset=utf-8", etag: meta.etag, "cache-control": "no-store" },
      request.method === "HEAD" ? null : bytes
    );
  }

  if (request.method !== "PUT") return reply(405, { allow: "GET, PUT, OPTIONS" });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return reply(413, { "content-type": "text/plain" }, "body too large");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BODY) return reply(413, { "content-type": "text/plain" }, "body too large");

  // Storage calls hold the object's input gate, so nothing else is let in
  // between this read and the write below: read-compare-write is one step.
  const meta = await storage.get("meta");
  const match = request.headers.get("if-match");
  // A missing `If-Match` claims the remote is empty; once it is not, that
  // claim is stale and the client has to merge first.
  if (meta && match !== "*" && match !== meta.etag) return reply(412, { "content-type": "text/plain" });
  if (!meta && match && match !== "*") return reply(412, { "content-type": "text/plain" });

  const chunks = Math.ceil(body.length / CHUNK);
  const etag = `"${crypto.randomUUID()}"`;
  const entries = { meta: { etag, size: body.length, chunks } };
  for (let i = 0; i < chunks; i += 1) entries[`chunk:${i}`] = body.slice(i * CHUNK, (i + 1) * CHUNK).buffer;
  // One `put` of many keys is atomic: a reader never sees new meta with old chunks.
  await storage.put(entries);
  const stale = [];
  for (let i = chunks; i < (meta?.chunks ?? 0); i += 1) stale.push(`chunk:${i}`);
  if (stale.length) await storage.delete(stale);

  return reply(204, { etag });
}

/** The Worker: CORS, the token, and routing to the one object. */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return reply(204);

    const path = env.OUTLINER_PATH || "/workspace";
    const url = new URL(request.url);
    if (url.pathname !== path) return reply(404, { "content-type": "text/plain" }, "not found");

    // Refuses to run open: a Worker URL is public, so without a token anyone
    // who guessed it could read the notes.
    if (!env.OUTLINER_TOKEN) return reply(503, { "content-type": "text/plain" }, "set OUTLINER_TOKEN first");
    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!tokenMatches(given, env.OUTLINER_TOKEN)) return reply(401, { "content-type": "text/plain" }, "unauthorized");

    const stub = env.WORKSPACE.get(env.WORKSPACE.idFromName(path));
    return stub.fetch(request);
  }
};

/** The Durable Object. One instance per sync path; it only forwards to `handleWorkspace`. */
export class Workspace {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    try {
      return await handleWorkspace(request, this.ctx.storage);
    } catch {
      return reply(500, { "content-type": "text/plain" }, "server error");
    }
  }
}
