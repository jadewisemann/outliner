import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInlineMarkdown, renderMarkdownLikeText } from "./richText";

describe("rich text renderer", () => {
  it("renders markdown-like inline formatting for inactive rows", () => {
    const { container } = render(
      <div>{renderInlineMarkdown("**bold** *italic* `code` ~~gone~~ ==bright== [site](https://example.com)")}</div>
    );
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelector("code")).toHaveTextContent("code");
    expect(container.querySelector("s")).toHaveTextContent("gone");
    expect(container.querySelector("mark")).toHaveTextContent("bright");
    expect(container.querySelector("a")).toHaveAttribute("href", "https://example.com");
  });

  it("renders fenced code blocks while preserving inline formatting around them", () => {
    const { container } = render(
      <div>{renderMarkdownLikeText("Before **bold**\n```ts\nconst value = 1;\n```\nAfter `code`")}</div>
    );

    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("pre code")).toHaveTextContent("const value = 1;");
    expect(container.querySelector("pre")).toHaveAttribute("data-language", "ts");
    expect(container.querySelectorAll("code")).toHaveLength(2);
  });

  it("renders inline and block LaTeX with accessible source fallback", () => {
    const { container } = render(<div>{renderMarkdownLikeText("Inline $x^2$.\n$$\ny = mx + b\n$$")}</div>);

    expect(container.querySelector(".rich-latex-inline")).toHaveTextContent("x^2");
    expect(container.querySelector(".rich-latex-inline")).toHaveAttribute("aria-label", "LaTeX x^2");
    expect(container.querySelector(".rich-latex-block")).toHaveTextContent("y = mx + b");
    expect(container.querySelector(".rich-latex-block")).toHaveAttribute("aria-label", "LaTeX y = mx + b");
  });
});
