import { readPayload } from "../../../storage/validate";
import type { Keyring } from "../cipher";
import { TIMEOUT_MS, emptyPayload, type Backend, type SyncConfig } from "./contract";
import { parse } from "./codec";

/**
 * Correctness does not depend on locking. Every device pulls, merges and
 * pushes, and the merge is order-independent, so a lost race is repaired by
 * the next round. `ETag`/`If-Match` is used when the server offers it, purely
 * to make that round happen sooner.
 */
export function createRestBackend(config: Extract<SyncConfig, { kind: "rest" }>, keys: Keyring): Backend {
  const headers = (extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
    ...extra
  });

  return {
    cadence: { pullMs: 10_000, pushMs: 1_500 },

    async pull() {
      const response = await fetch(config.url, {
        headers: headers(),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status === 404) return { payload: emptyPayload(), version: null };
      if (!response.ok) throw new Error(`sync pull failed: ${response.status}`);

      // Whatever is at the other end is untrusted, even when it is the user's
      // own server: a malformed body must not be able to damage the workspace.
      const payload = readPayload(parse(await keys.open(await response.text())));
      return { payload: payload ?? emptyPayload(), version: response.headers.get("etag") };
    },

    async push(payload, version) {
      const etag = typeof version === "string" ? version : null;
      const response = await fetch(config.url, {
        method: "PUT",
        headers: headers(etag ? { "if-match": etag } : {}),
        body: await keys.seal(JSON.stringify(payload)),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status === 412 || response.status === 409) return null;
      if (!response.ok) throw new Error(`sync push failed: ${response.status}`);
      return response.headers.get("etag") ?? undefined;
    }
  };
}
