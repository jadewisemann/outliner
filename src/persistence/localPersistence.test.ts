import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { DEFAULT_PREFERENCES } from "../app/preferences";
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
    await persistence.saveConflictBackup({ document, view });
    expect((await persistence.loadConflictBackup())?.document.rootId).toBe(document.rootId);
    await persistence.clearConflictBackup();
    expect(await persistence.loadConflictBackup()).toBeNull();
    await persistence.saveSnapshotHistory({ id: "history-1", createdAt: 10, reason: "autosave", snapshot: { document, view } });
    expect(await persistence.listSnapshotHistory()).toHaveLength(1);
    await persistence.clearSnapshotHistory();
    expect(await persistence.listSnapshotHistory()).toHaveLength(0);
    await persistence.savePreferences({ ...DEFAULT_PREFERENCES, theme: "dark" });
    expect((await persistence.loadPreferences()).theme).toBe("dark");
    await persistence.clear();
  });
});
