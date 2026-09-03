#!/usr/bin/env node
/**
 * The reference self-hosted backend: static files plus one versioned document.
 *
 * The REST backend asks for exactly three things (`src/sync/api/remote/rest.ts`):
 * `GET` returns the stored body with an `ETag`, `PUT` with a matching
 * `If-Match` replaces it, and a mismatch answers 412 so the client re-merges.
 * That is the whole contract, so the whole server fits in one file with no
 * dependencies — which is the point. Correctness never depended on the server:
 * the merge is order-independent and lives in the client, so this process
 * stores bytes and arbitrates writes, and nothing else.
 *
 *     node server/outliner-server.mjs --static dist --token secret
 *
 * | flag | default | what it is |
 * | --- | --- | --- |
 * | `--port` | 8787 | port to listen on (`PORT` also works) |
 * | `--host` | 127.0.0.1 | interface to bind; `0.0.0.0` to accept from the network |
 * | `--dir` | ./data | where the document is written |
 * | `--path` | /workspace | the URL the app syncs against |
 * | `--token` | none | required as `Authorization: Bearer …` when set (`OUTLINER_TOKEN` also works) |
 * | `--static` | none | a directory to serve the built app from |
 *
 * The body is stored verbatim rather than parsed. With a passphrase set the
 * client sends a sealed envelope, and a server that insisted on reading it
 * would be a server that could read the notes.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

/** Big enough for a large workspace, small enough that a stray POST cannot fill the disk. */
const MAX_BODY = 32 * 1024 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8"
};

function options(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [name, inline] = arg.slice(2).split("=");
    flags[name] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[(i += 1)] : "true");
  }
  return {
    port: Number(flags.port ?? process.env.PORT ?? 8787),
    host: flags.host ?? process.env.HOST ?? "127.0.0.1",
    dir: resolve(flags.dir ?? process.env.OUTLINER_DIR ?? "data"),
    path: flags.path ?? "/workspace",
    token: flags.token ?? process.env.OUTLINER_TOKEN ?? "",
    static: flags.static ? resolve(flags.static) : null
  };
}

/** A strong validator over the exact bytes stored, which is what `If-Match` compares. */
const etagOf = (bytes) => `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`;

/** Constant-time so the token cannot be recovered one character at a time. */
function tokenMatches(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(request) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error("body too large"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => done(Buffer.concat(chunks)));
    request.on("error", fail);
  });
}

export function createOutlinerServer(config) {
  const file = join(config.dir, "workspace.json");
  /**
   * Writes never interleave: two devices pushing at once would otherwise both
   * pass the `If-Match` check and the later one would win without either
   * knowing. A single promise chain makes read-compare-write one step.
   */
  let queue = Promise.resolve();
  const serialise = (work) => {
    const next = queue.then(work, work);
    // Keep a rejection from poisoning every later request.
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, if-match",
    // Without this the browser hides the header from the app, every push goes
    // out unconditional, and the compare-and-swap silently stops happening.
    "access-control-expose-headers": "etag",
    "access-control-max-age": "86400"
  };

  const send = (response, status, headers = {}, body = "") => {
    response.writeHead(status, { ...cors, ...headers });
    response.end(body);
  };

  async function held() {
    try {
      const bytes = await readFile(file);
      return { bytes, etag: etagOf(bytes) };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function serveStatic(request, response, pathname) {
    if (!config.static) return send(response, 404, { "content-type": "text/plain" }, "not found");
    const wanted = pathname === "/" ? "/index.html" : pathname;
    // `normalize` first, then confirm the result is still inside the root:
    // `..` in a URL must not reach the rest of the disk.
    const target = join(config.static, normalize(decodeURIComponent(wanted)));
    if (target !== config.static && !target.startsWith(config.static + sep)) {
      return send(response, 403, { "content-type": "text/plain" }, "forbidden");
    }
    try {
      const info = await stat(target);
      if (!info.isFile()) throw Object.assign(new Error("not a file"), { code: "ENOENT" });
      response.writeHead(200, {
        "content-type": TYPES[extname(target)] ?? "application/octet-stream",
        "content-length": info.size,
        // Vite fingerprints everything under assets/, so those never go stale.
        "cache-control": target.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
      });
      if (request.method === "HEAD") return response.end();
      createReadStream(target).pipe(response);
    } catch {
      send(response, 404, { "content-type": "text/plain" }, "not found");
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "OPTIONS") return send(response, 204);

      if (url.pathname !== config.path) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return send(response, 405, { allow: "GET, HEAD" }, "");
        }
        return serveStatic(request, response, url.pathname);
      }

      if (config.token) {
        const given = (request.headers.authorization ?? "").replace(/^Bearer /, "");
        if (!tokenMatches(given, config.token)) {
          return send(response, 401, { "content-type": "text/plain" }, "unauthorized");
        }
      }

      if (request.method === "GET" || request.method === "HEAD") {
        const stored = await held();
        // 404 is how the client learns the remote is empty and it should push
        // rather than adopt nothing.
        if (!stored) return send(response, 404, { "content-type": "text/plain" }, "");
        response.writeHead(200, {
          ...cors,
          "content-type": "application/json; charset=utf-8",
          "content-length": stored.bytes.length,
          etag: stored.etag,
          "cache-control": "no-store"
        });
        return response.end(request.method === "HEAD" ? undefined : stored.bytes);
      }

      if (request.method !== "PUT") return send(response, 405, { allow: "GET, PUT, OPTIONS" }, "");

      const body = await readBody(request);
      const match = request.headers["if-match"] ?? null;

      const result = await serialise(async () => {
        const stored = await held();
        // A missing `If-Match` is a claim that the remote holds nothing. Once
        // it does, that claim is stale and the client has to merge first —
        // the same answer the GitHub backend gives a push with no sha.
        if (stored && match !== "*" && match !== stored.etag) return { status: 412 };
        if (!stored && match && match !== "*") return { status: 412 };

        await mkdir(config.dir, { recursive: true });
        // Rename is atomic within a filesystem, so a reader never sees half a
        // workspace and a crash mid-write leaves the previous one intact.
        const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temporary, body);
        await rename(temporary, file);
        return { status: 204, etag: etagOf(body) };
      });

      if (result.status === 412) return send(response, 412, { "content-type": "text/plain" }, "");
      send(response, 204, { etag: result.etag });
    } catch (error) {
      const status = error?.status ?? 500;
      send(response, status, { "content-type": "text/plain" }, status === 500 ? "server error" : error.message);
    }
  });

  return server;
}

/** Only when run directly, so a test can import the factory without listening. */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const config = options(process.argv.slice(2));
  const server = createOutlinerServer(config);
  server.listen(config.port, config.host, () => {
    // The bound port, not the asked-for one: `--port 0` takes a free port and
    // this line is how the caller learns which.
    const origin = `http://${config.host}:${server.address().port}`;
    console.log(`outliner server on ${origin}`);
    console.log(`  sync URL   ${origin}${config.path}`);
    console.log(`  storing    ${join(config.dir, "workspace.json")}`);
    console.log(`  token      ${config.token ? "required" : "none — anyone who can reach this can read the notes"}`);
    if (config.static) console.log(`  serving    ${config.static}`);
  });
}
