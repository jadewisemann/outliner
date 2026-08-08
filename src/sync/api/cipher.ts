/**
 * End-to-end encryption for everything that leaves the device.
 *
 * The merge runs on this side of the wire — the remote never needs to read a
 * thing — which is the whole reason this is possible. With a passphrase set, a
 * backend stores ciphertext and whoever hosts it learns file sizes and write
 * times and nothing else.
 *
 * PBKDF2-SHA256 to a 256-bit AES-GCM key. The salt rides in the envelope
 * rather than in a key file of its own: any file the device reads already says
 * how to derive from it, so there is no ordering to get wrong and no extra
 * request. Two devices that each set up encryption against an empty remote end
 * up with one salt each, which costs one extra derivation and nothing else —
 * both keys open both files, and rewriting a file settles it on the writer's
 * salt.
 *
 * `crypto.subtle` needs a secure context, so this works over https and on
 * localhost, which is where the app runs anyway.
 */

/**
 * Thrown when the bytes cannot be read: no passphrase for an encrypted
 * workspace, or the wrong one. It has to be distinct from a network failure,
 * because carrying on would mean treating unreadable files as absent ones and
 * overwriting them.
 */
export const LOCKED = "outliner:locked";

export const ITERATIONS = 600_000;

/** Refuses a file that would cost minutes to derive from. */
const MAX_ITERATIONS = 4_000_000;

type Envelope = { v: 1; kdf: "PBKDF2-SHA256"; iterations: number; salt: string; iv: string; ct: string };

export type Keyring = {
  seal(text: string): Promise<string>;
  open(text: string): Promise<string>;
};

export function createKeyring(passphrase: string): Keyring {
  const keys = new Map<string, Promise<CryptoKey>>();
  // The salt this device writes with: whatever the remote is already using, or
  // a fresh one when there is nothing there to copy.
  let own: { salt: string; iterations: number } | null = null;

  const keyFor = (salt: string, iterations: number) => {
    const id = `${iterations}:${salt}`;
    const held = keys.get(id);
    if (held) return held;
    const key = derive(passphrase, salt, iterations);
    keys.set(id, key);
    return key;
  };

  return {
    async seal(text) {
      if (!own) own = { salt: encode(random(16)), iterations: ITERATIONS };
      const iv = random(12);
      const key = await keyFor(own.salt, own.iterations);
      const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
      const envelope: Envelope = {
        v: 1,
        kdf: "PBKDF2-SHA256",
        iterations: own.iterations,
        salt: own.salt,
        iv: encode(iv),
        ct: encode(new Uint8Array(sealed))
      };
      return `${JSON.stringify(envelope, null, 2)}\n`;
    },

    async open(text) {
      const envelope = readEnvelope(text);
      // A workspace written before the passphrase was set still reads.
      if (!envelope) return text;
      if (!own) own = { salt: envelope.salt, iterations: envelope.iterations };
      const key = await keyFor(envelope.salt, envelope.iterations);
      try {
        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: decode(envelope.iv) },
          key,
          decode(envelope.ct)
        );
        return new TextDecoder().decode(plain);
      } catch {
        // AES-GCM authenticates, so a failure here is the wrong passphrase.
        throw new Error(LOCKED);
      }
    }
  };
}

/** No passphrase configured: refuses ciphertext rather than discarding it. */
export function plainKeyring(): Keyring {
  return {
    async seal(text) {
      return text;
    },
    async open(text) {
      if (readEnvelope(text)) throw new Error(LOCKED);
      return text;
    }
  };
}

export function isLocked(error: unknown): boolean {
  return error instanceof Error && error.message === LOCKED;
}

/**
 * An envelope is a file this device wrote; anything else is either plaintext or
 * not ours, and both are the caller's business. The parse is cheap whatever the
 * size — an envelope is six keys, one of them a long string.
 */
function readEnvelope(text: string): Envelope | null {
  let value: Partial<Envelope> | null;
  try {
    value = JSON.parse(text) as Partial<Envelope>;
  } catch {
    return null;
  }
  if (!value || value.v !== 1 || value.kdf !== "PBKDF2-SHA256") return null;
  const { iterations, salt, iv, ct } = value;
  if (typeof salt !== "string" || typeof iv !== "string" || typeof ct !== "string") return null;
  // The count comes from the file, so a hostile one could otherwise wedge the
  // tab in a key derivation that never ends.
  if (typeof iterations !== "number" || iterations < 1000 || iterations > MAX_ITERATIONS) return null;
  return { v: 1, kdf: "PBKDF2-SHA256", iterations, salt, iv, ct };
}

async function derive(passphrase: string, salt: string, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: decode(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function random(bytes: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

function decode(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
