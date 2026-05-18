import type { RemoteSnapshotRecord } from "./syncTypes";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function estimateEncodedSnapshotBytes(record: RemoteSnapshotRecord): number {
  const encoded = {
    version: record.version,
    clientId: record.clientId,
    updatedAt: record.updatedAt,
    state: bytesToBase64(record.state),
    ...(record.vector ? { vector: bytesToBase64(record.vector) } : {})
  };
  return new TextEncoder().encode(JSON.stringify(encoded)).byteLength;
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
