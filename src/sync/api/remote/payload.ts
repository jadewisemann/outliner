import type { SyncPayload } from "../../../types";
import { readPayload } from "../../../storage/validate";
import type { Keyring } from "../cipher";
import { parse } from "./codec";

/**
 * A whole workspace as one body: what the REST backend GETs and PUTs, what the
 * folder backend keeps in `outliner.json`, and what the GitHub layout held
 * before it was split up.
 *
 * Opening is where such a body crosses the trust boundary. Whatever is at the
 * other end is untrusted, even the user's own server or folder, so it goes
 * through `validate.ts`, and anything that is not a workspace comes back
 * `null`. A body sealed under a passphrase this device lacks throws `locked`.
 */
export async function openPayload(keys: Keyring, text: string): Promise<SyncPayload | null> {
  return readPayload(parse(await keys.open(text)));
}

/**
 * Compact JSON, not `serialize()`. Sorted, indented bytes pay off where a
 * commit history reads the diff, which is the split GitHub layout. A REST body
 * is the whole workspace on every push, and that backend meets the payload
 * limits first (ADR-0009); the folder file is the REST format by definition
 * (ADR-0011).
 */
export function sealPayload(keys: Keyring, payload: SyncPayload): Promise<string> {
  return keys.seal(JSON.stringify(payload));
}
