import { describe, expect, it } from "vitest";
import { keyBetween, keysAfter } from "./order";

describe("keyBetween", () => {
  it("orders an unbounded key between its neighbours", () => {
    const first = keyBetween(null, null);
    const after = keyBetween(first, null);
    const before = keyBetween(null, first);
    const middle = keyBetween(first, after);

    expect(before < first).toBe(true);
    expect(first < middle).toBe(true);
    expect(middle < after).toBe(true);
  });

  it("never produces a key that blocks a future midpoint", () => {
    // Repeatedly splitting the same gap is the case that runs out of room in a
    // naive scheme; 500 rounds would exhaust float precision.
    let low = keyBetween(null, null);
    let high = keyBetween(low, null);
    for (let round = 0; round < 500; round += 1) {
      const middle = keyBetween(low, high);
      expect(low < middle && middle < high).toBe(true);
      if (round % 2 === 0) low = middle;
      else high = middle;
    }
  });

  it("keeps a random sequence of insertions sorted", () => {
    const keys = [keyBetween(null, null)];
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let round = 0; round < 400; round += 1) {
      const at = Math.floor(random() * (keys.length + 1));
      keys.splice(at, 0, keyBetween(keys[at - 1] ?? null, keys[at] ?? null));
    }

    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects reversed bounds instead of producing a broken key", () => {
    const low = keyBetween(null, null);
    const high = keyBetween(low, null);
    expect(() => keyBetween(high, low)).toThrow();
  });
});

describe("keysAfter", () => {
  it("returns ascending keys that all follow the lower bound", () => {
    const base = keyBetween(null, null);
    const keys = keysAfter(base, 5);
    expect(keys).toHaveLength(5);
    expect(keys).toEqual([...keys].sort());
    expect(base < keys[0]).toBe(true);
  });
});
