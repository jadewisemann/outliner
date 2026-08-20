import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { highlight } from "../highlight";

const marked = (code: string, kind: string) =>
  [...render(<pre>{highlight(code)}</pre>).container.querySelectorAll(`.tok-${kind}`)].map((el) => el.textContent);

describe("highlight", () => {
  it("recedes strings and comments, lifts numbers and keywords", () => {
    const code = 'const total = 42; // running sum';
    expect(marked(code, "keyword")).toEqual(["const"]);
    expect(marked(code, "number")).toEqual(["42"]);
    expect(marked(code, "comment")).toEqual(["// running sum"]);
  });

  it("does not read a comment marker inside a string as a comment", () => {
    expect(marked('const url = "https://x.dev"; // real', "string")).toEqual(['"https://x.dev"']);
    expect(marked('const url = "https://x.dev"; // real', "comment")).toEqual(["// real"]);
  });

  it("keeps the code intact whatever it colours", () => {
    const code = "def f(x):\n  return x ** 2  # square";
    expect(render(<pre>{highlight(code)}</pre>).container.textContent).toBe(code);
  });
});
