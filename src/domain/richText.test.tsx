import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInlineMarkdown } from "./richText";

describe("rich text renderer", () => {
  it("renders markdown-like inline formatting for inactive rows", () => {
    const { container } = render(<div>{renderInlineMarkdown("**bold** *italic* `code` ~~gone~~ [site](https://example.com)")}</div>);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelector("code")).toHaveTextContent("code");
    expect(container.querySelector("s")).toHaveTextContent("gone");
    expect(container.querySelector("a")).toHaveAttribute("href", "https://example.com");
  });
});
