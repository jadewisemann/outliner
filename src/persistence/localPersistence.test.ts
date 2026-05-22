import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { DEFAULT_PREFERENCES } from "../app/preferences";
import { toWorkspaceSnapshot } from "../domain/workspace";
import { createBrowserLocalPersistence } from "./localPersistence";

describe("local persistence", () => {
  it("restores the local document snapshot", async () => {
    const persistence = createBrowserLocalPersistence(`test-${crypto.randomUUID()}`);
    const document = makeDocumentWithTexts(["Saved"]);
    const view = createInitialView(document);
    await persistence.save({ document, view });
    const restored = await persistence.load();
    expect(restored && "document" in restored ? restored.document.nodes[document.rootId].children : undefined).toEqual(
      document.nodes[document.rootId].children
    );
    expect(restored && "view" in restored ? restored.view.zoomNodeId : undefined).toBe(document.rootId);
    await persistence.saveConflictBackup({ document, view });
    const conflictBackup = await persistence.loadConflictBackup();
    expect(conflictBackup && "document" in conflictBackup ? conflictBackup.document.rootId : undefined).toBe(document.rootId);
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

  it("preserves workspace schema version in local snapshots, history, and conflict backups", async () => {
    const persistence = createBrowserLocalPersistence(`test-${crypto.randomUUID()}`);
    const document = makeDocumentWithTexts(["Workspace Saved"]);
    const workspace = toWorkspaceSnapshot({ document, view: createInitialView(document) }, () => "doc-1", () => 10);

    await persistence.save(workspace);
    expect((await persistence.load())?.schemaVersion).toBe(2);

    await persistence.saveConflictBackup(workspace);
    expect((await persistence.loadConflictBackup())?.schemaVersion).toBe(2);

    await persistence.saveSnapshotHistory({ id: "history-v2", createdAt: 20, reason: "autosave", snapshot: workspace });
    expect((await persistence.listSnapshotHistory())[0].snapshot.schemaVersion).toBe(2);

    await persistence.clearSnapshotHistory();
    await persistence.clearConflictBackup();
    await persistence.clear();
  });
});
