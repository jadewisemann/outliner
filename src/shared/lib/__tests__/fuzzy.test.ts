import { describe, expect, it } from "vitest";
import { fuzzy } from "../fuzzy";

describe("fuzzy", () => {
  it("matches characters in order, anywhere", () => {
    expect(fuzzy("tree.ts", "tre")).not.toBeNull();
    expect(fuzzy("tree.ts", "tts")).not.toBeNull();
    expect(fuzzy("tree.ts", "xyz")).toBeNull();
  });

  it("scores an adjacent run above scattered letters", () => {
    const tight = fuzzy("project plan", "plan")!.score;
    const loose = fuzzy("please label a number", "plan")!.score;
    expect(tight).toBeGreaterThan(loose);
  });

  it("reports where it matched, for highlighting", () => {
    expect(fuzzy("alpha", "ah")!.hits).toEqual([0, 3]);
  });
});
