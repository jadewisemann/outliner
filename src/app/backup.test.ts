import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { makeDocumentWithTexts } from "../test/factories";
import { toWorkspaceSnapshot } from "../domain/workspace";
import { createManualBackup, serializeManualBackup } from "./backup";
import { DEFAULT_PREFERENCES } from "./preferences";

describe("manual backup", () => {
  it("serializes the current workspace with separated preferences and history", () => {
    const document = makeDocumentWithTexts(["Back me up"]);
    const snapshot = { document, view: createInitialView(document) };
    const history = [{ id: "h-1", createdAt: 10, reason: "autosave" as const, snapshot }];

    const content = serializeManualBackup(createManualBackup(snapshot, DEFAULT_PREFERENCES, history, 20));
    const parsed = JSON.parse(content);

    expect(parsed.snapshot.document.nodes[document.nodes[document.rootId].children[0]].text).toBe("Back me up");
    expect(parsed.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(parsed.history).toHaveLength(1);
    expect(parsed.exportedAt).toBe(20);
  });

  it("preserves workspace snapshot schema version in manual backups", () => {
    const document = makeDocumentWithTexts(["Back up v2"]);
    const workspace = toWorkspaceSnapshot({ document, view: createInitialView(document) }, () => "doc-1", () => 10);
    const history = [{ id: "h-2", createdAt: 11, reason: "autosave" as const, snapshot: workspace }];

    const content = serializeManualBackup(createManualBackup(workspace, DEFAULT_PREFERENCES, history, 20));
    const parsed = JSON.parse(content);

    expect(parsed.snapshot.schemaVersion).toBe(2);
    expect(parsed.history[0].snapshot.schemaVersion).toBe(2);
  });
});
