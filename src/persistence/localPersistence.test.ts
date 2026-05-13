import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { createBrowserLocalPersistence } from "./localPersistence";

describe("local persistence", () => {
  it("restores the local document snapshot", async () => {
    const persistence = createBrowserLocalPersistence(`test-${crypto.randomUUID()}`);
    const document = makeDocumentWithTexts(["Saved"]);
    const view = createInitialView(document);
    await persistence.save({ document, view });
    const restored = await persistence.load();
    expect(restored?.document.nodes[document.rootId].children).toEqual(document.nodes[document.rootId].children);
    expect(restored?.view.zoomNodeId).toBe(document.rootId);
    await persistence.clear();
  });
});
