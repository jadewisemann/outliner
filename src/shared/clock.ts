/**
 * A logical clock for last-write-wins merging.
 *
 * Values look like wall-clock milliseconds so they stay readable and roughly
 * sortable across devices, but they never go backwards and always exceed any
 * timestamp this device has seen — so a device with a slow clock cannot have
 * its edits silently discarded after it has seen a newer one.
 */
/** Timestamps further ahead than this are treated as a broken or hostile clock. */
export const MAX_SKEW_MS = 24 * 60 * 60 * 1000;

const CLOCK_KEY = "outliner:clock";

/**
 * Restored across reloads. Without this, a session that ran with a fast system
 * clock would leave stamps in storage that every later edit loses to — the
 * user would watch their newest work quietly revert after every restart.
 */
let latest = read(CLOCK_KEY);
let saved = latest;

export function tick(): number {
  latest = Math.max(Date.now(), latest + 1);
  // Only persisted when it has run meaningfully ahead of the wall clock,
  // which is the only case a reload could not reconstruct on its own.
  if (latest - saved > 1000) {
    saved = latest;
    write(CLOCK_KEY, latest);
  }
  return latest;
}

/**
 * Called with every timestamp arriving from another device.
 *
 * A wildly future value is ignored rather than adopted. Adopting one would
 * saturate this clock permanently — past 2^53 `latest + 1` stops advancing,
 * every stamp collides, and merges would be decided by device id forever.
 */
export function observe(timestamp: number): void {
  if (timestamp > latest && timestamp < Date.now() + MAX_SKEW_MS) latest = timestamp;
}

function read(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 && value < Date.now() + MAX_SKEW_MS ? value : 0;
  } catch {
    return 0;
  }
}

function write(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode — the clock just restarts from wall time */
  }
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
