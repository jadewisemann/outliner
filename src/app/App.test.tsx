import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the root outliner screen", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Outliner" })).toBeInTheDocument();
    expect(await screen.findByRole("tree", { name: "Outline" })).toBeInTheDocument();
    expect(screen.getByText("Saved locally")).toBeInTheDocument();
  });
});
