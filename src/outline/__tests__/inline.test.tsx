import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { extractTags, renderInline, sourceOffset } from "../inline";

const html = (source: string) => {
  const { container } = render(<p>{renderInline(source)}</p>);
  return container.querySelector("p")!.innerHTML;
};

describe("renderInline", () => {
  it("renders the markup a row supports", () => {
    expect(html("**bold**")).toContain("<strong>bold</strong>");
    expect(html("*italic*")).toContain("<em>italic</em>");
    expect(html("`code`")).toContain("<code>code</code>");
    expect(html("~~gone~~")).toContain("<s>gone</s>");
    expect(html("==note==")).toContain("<mark>note</mark>");
  });

  it("leaves lone asterisks alone so bullets survive", () => {
    expect(html("2 * 3 * 4")).toBe("2 * 3 * 4");
  });

  it("links labelled and bare URLs, and rejects javascript: hrefs", () => {
    render(<p>{renderInline("[docs](https://example.com) https://plain.dev [x](javascript:alert(1))")}</p>);
    expect(screen.getByText("docs")).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("https://plain.dev")).toHaveAttribute("href", "https://plain.dev");
    expect(screen.getByText("x").getAttribute("href")).not.toMatch(/^javascript:/i);
  });

  it("treats #tags and [[document links]] as buttons", () => {
    render(<p>{renderInline("#work/urgent and [[Notes]]")}</p>);
    expect(screen.getByRole("button", { name: "#work/urgent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
  });
});

describe("extractTags", () => {
  it("ignores hashes that are not tags", () => {
    expect(extractTags("#one mid#dle #둘 issue ##no")).toEqual(["#one", "#둘"]);
  });

  it("reads @ as a second sigil, but not the @ in an address", () => {
    expect(extractTags("@waiting on #work")).toEqual(["@waiting", "#work"]);
    // The character in front of the sigil is the whole rule: an address always
    // has a local part, a tag never does.
    expect(extractTags("mail jade@example.com, cc @jade")).toEqual(["@jade"]);
    expect(extractTags("git@github.com:u/r")).toEqual([]);
    // Extraction does not know about the surrounding tokens, so a handle in a
    // URL still counts — the same as a `#anchor` always has. Pinned here so
    // the asymmetry with rendering is a decision and not a surprise.
    expect(extractTags("https://x.com/@user")).toEqual(["@user"]);
    expect(extractTags("https://x.com/#anchor")).toEqual(["#anchor"]);
  });
});

describe("sourceOffset", () => {
  it("maps a plain click straight through", () => {
    expect(sourceOffset("hello", 3)).toBe(3);
  });

  it("skips over markup so the caret lands where it looks", () => {
    //         rendered "bold tail"; offset 5 is the "t" of tail, source index 9
    expect(sourceOffset("**bold** tail", 5)).toBe(9);
  });
});
