import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { Outliner } from "./Outliner";

describe("Outliner", () => {
  it("renders root breadcrumb and visible nodes", () => {
    const document = makeDocumentWithTexts(["A", "B"]);
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Root");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("zooms when clicking a bullet", async () => {
    const user = userEvent.setup();
    const document = makeDocumentWithTexts(["A"]);
    const onViewChange = vi.fn();
    render(
      <Outliner
        document={document}
        view={createInitialView(document)}
        createId={() => "new"}
        now={() => 1}
        onDocumentChange={vi.fn()}
        onViewChange={onViewChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Zoom into node" }));
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ zoomNodeId: "n-1" }));
  });
});
