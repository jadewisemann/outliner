import { describe, expect, it } from "vitest";
import { applyCompletion, autoFormat, completionAt, fuzzy, isUrl, linkTo, toggleLink, toggleWrap } from "../markdown";

const wrap = (text: string, start: number, end: number, kind: Parameters<typeof toggleWrap>[3]) =>
  toggleWrap(text, start, end, kind);

describe("toggleWrap", () => {
  it("wraps the selection and keeps it selected", () => {
    const result = wrap("make this bold", 5, 9, "bold");
    expect(result.text).toBe("make **this** bold");
    expect(result.text.slice(result.start, result.end)).toBe("this");
  });

  it("unwraps when the markers are already outside the selection", () => {
    const result = wrap("make **this** bold", 7, 11, "bold");
    expect(result.text).toBe("make this bold");
    expect(result.text.slice(result.start, result.end)).toBe("this");
  });

  it("unwraps when the markers are inside the selection", () => {
    const result = wrap("make **this** bold", 5, 13, "bold");
    expect(result.text).toBe("make this bold");
  });

  it("round-trips, so pressing the shortcut twice is a no-op", () => {
    for (const kind of ["bold", "italic", "code", "strike", "highlight"] as const) {
      const once = wrap("alpha beta", 6, 10, kind);
      const twice = toggleWrap(once.text, once.start, once.end, kind);
      expect(twice.text).toBe("alpha beta");
    }
  });

  it("puts the caret between the markers when nothing is selected", () => {
    const result = wrap("", 0, 0, "code");
    expect(result.text).toBe("``");
    expect(result.start).toBe(1);
    expect(result.end).toBe(1);
  });

  it("does not mistake bold for italic", () => {
    // The inner-marker branch must not strip one asterisk off each side.
    const result = wrap("**bold**", 0, 8, "italic");
    expect(result.text).toBe("***bold***");
  });
});

describe("toggleLink", () => {
  it("wraps the selection and parks the caret in the parentheses", () => {
    const result = toggleLink("see the docs", 8, 12);
    expect(result.text).toBe("see the [docs]()");
    expect(result.start).toBe(result.text.indexOf("()") + 1);
  });

  it("unwraps an existing link back to its label", () => {
    const result = toggleLink("see the [docs](https://x.dev)", 9, 13);
    expect(result.text).toBe("see the docs");
  });

  it("links a pasted url over the selection", () => {
    expect(linkTo("see the docs", 8, 12, "https://x.dev").text).toBe("see the [docs](https://x.dev)");
    expect(isUrl("https://x.dev")).toBe(true);
    expect(isUrl("not a url")).toBe(false);
  });
});

describe("autoFormat", () => {
  it("turns leading hashes into a heading level", () => {
    expect(autoFormat("#", 1)).toMatchObject({ prefix: "#", text: "", node: { heading: 1 } });
    expect(autoFormat("###rest", 3)).toMatchObject({ text: "rest", node: { heading: 3 } });
    expect(autoFormat("####", 4)).toBeNull();
  });

  it("turns a checkbox or a number into the parent list's decision", () => {
    expect(autoFormat("[]", 2)).toMatchObject({ parent: { checklist: true } });
    expect(autoFormat("[ ]", 3)).toMatchObject({ parent: { checklist: true } });
    expect(autoFormat("1.", 2)).toMatchObject({ parent: { numbered: true } });
    expect(autoFormat("12)", 3)).toMatchObject({ parent: { numbered: true } });
  });

  it("only fires at the very start of a row", () => {
    expect(autoFormat("a #", 3)).toBeNull();
    expect(autoFormat(" #", 2)).toBeNull();
    expect(autoFormat("", 0)).toBeNull();
  });
});

describe("completionAt", () => {
  it("opens the document picker after [[", () => {
    expect(completionAt("see [[pro", 9)).toEqual({ kind: "doc", query: "pro", from: 4 });
    expect(completionAt("see [[done]] and", 16)).toBeNull();
  });

  it("opens the tag picker on a fresh # or @, carrying the sigil that was typed", () => {
    expect(completionAt("todo #wo", 8)).toEqual({ kind: "tag", sigil: "#", query: "wo", from: 5 });
    expect(completionAt("#", 1)).toEqual({ kind: "tag", sigil: "#", query: "", from: 0 });
    expect(completionAt("todo @wa", 8)).toEqual({ kind: "tag", sigil: "@", query: "wa", from: 5 });
    // Mid-word is not a tag, and neither is a heading already applied.
    expect(completionAt("a#b", 3)).toBeNull();
    // The picker must not open inside an email address — the whole reason the
    // trigger tests what is in front of the sigil.
    expect(completionAt("mail jade@exa", 13)).toBeNull();
    // The sigil nearest the caret is the one being typed.
    expect(completionAt("#work @wa", 9)).toEqual({ kind: "tag", sigil: "@", query: "wa", from: 6 });
  });

  it("replaces the trigger with the literal text of the choice", () => {
    // The caller decides the spelling, because `[[` offers two kinds of thing.
    const trigger = completionAt("see [[pro", 9)!;
    expect(applyCompletion("see [[pro", 9, trigger, "[[Projects]]").text).toBe("see [[Projects]]");
    expect(applyCompletion("see [[pro", 9, trigger, "((node-7))").text).toBe("see ((node-7))");

    const result = applyCompletion("see [[pro", 9, trigger, "[[Projects]]");
    expect(result.start).toBe(result.text.length);
  });
});

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
