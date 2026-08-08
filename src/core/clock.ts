/**
 * A logical clock for last-write-wins merging.
 *
 * Values look like wall-clock milliseconds so they stay readable and roughly
 * sortable across devices, but they never go backwards and always exceed any
 * timestamp this device has seen — so a device with a slow clock cannot have
 * its edits silently discarded after it has seen a newer one.
 */
let latest = 0;

export function tick(): number {
  latest = Math.max(Date.now(), latest + 1);
  return latest;
}

/** Called with every timestamp arriving from another device. */
export function observe(timestamp: number): void {
  if (timestamp > latest) latest = timestamp;
}

const DEVICE_KEY = "outliner:device";

/** Stable per-browser id; breaks ties when two devices stamp the same clock. */
export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return "local";
  }
}

/** True when `a` should win over `b`. Equal clocks fall back to the device id. */
export function wins(a: { at: number; by: string }, b: { at: number; by: string }): boolean {
  return a.at !== b.at ? a.at > b.at : a.by > b.by;
}
