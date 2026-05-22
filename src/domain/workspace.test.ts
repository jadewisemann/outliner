import { describe, expect, it } from "vitest";
import { createInitialView } from "./outline";
import {
  createDocumentInWorkspace,
  deleteDocumentFromWorkspace,
  renameDocumentInWorkspace,
  switchActiveDocument,
  toWorkspaceSnapshot
} from "./workspace";
import { makeClock, makeDocumentWithTexts, makeIdGenerator } from "../test/factories";

describe("workspace snapshot migration", () => {
  it("promotes a v1 outline snapshot into a v2 single-document workspace", () => {
    const document = makeDocumentWithTexts(["Saved"]);
    const view = createInitialView(document);

    const workspace = toWorkspaceSnapshot({ document, view }, makeIdGenerator("doc"), () => 10);

    expect(workspace.schemaVersion).toBe(2);
    expect(workspace.workspace.documentOrder).toEqual(["doc-1"]);
    expect(workspace.workspace.activeDocumentId).toBe("doc-1");
    expect(workspace.workspace.documents["doc-1"]).toMatchObject({
      id: "doc-1",
      title: "Untitled",
      rootId: document.rootId
    });
    expect(workspace.workspace.view.perDocument["doc-1"]).toEqual(view);
  });

  it("keeps existing v2 workspace snapshots unchanged", () => {
    const migrated = toWorkspaceSnapshot(
      { document: makeDocumentWithTexts(["A"]), view: { zoomNodeId: "root" } },
      makeIdGenerator("doc"),
      () => 10
    );

    expect(toWorkspaceSnapshot(migrated, makeIdGenerator("other"), () => 20)).toBe(migrated);
  });
});

describe("workspace document commands", () => {
  it("creates and switches documents with independent root and view state", () => {
    const now = makeClock(100);
    const createDocumentId = makeIdGenerator("doc");
    let workspace = toWorkspaceSnapshot(
      { document: makeDocumentWithTexts(["A"]), view: { zoomNodeId: "root", selectedNodeId: "n-1" } },
      createDocumentId,
      now
    );

    workspace = createDocumentInWorkspace(workspace, "Second Doc", createDocumentId, makeIdGenerator("node"), now);

    expect(workspace.workspace.documentOrder).toEqual(["doc-1", "doc-2"]);
    expect(workspace.workspace.activeDocumentId).toBe("doc-2");
    expect(workspace.workspace.documents["doc-2"].rootId).toBe("root");
    expect(workspace.workspace.documents["doc-2"].nodes.root.children).toEqual(["node-1"]);
    expect(workspace.workspace.view.perDocument["doc-1"].selectedNodeId).toBe("n-1");
    expect(workspace.workspace.view.perDocument["doc-2"].selectedNodeId).toBe("node-1");

    workspace = switchActiveDocument(workspace, "doc-1");
    expect(workspace.workspace.activeDocumentId).toBe("doc-1");
  });

  it("renames and deletes documents without changing document outline data", () => {
    const now = makeClock(100);
    const createDocumentId = makeIdGenerator("doc");
    let workspace = toWorkspaceSnapshot(
      { document: makeDocumentWithTexts(["A"]), view: { zoomNodeId: "root", selectedNodeId: "n-1" } },
      createDocumentId,
      now
    );
    workspace = createDocumentInWorkspace(workspace, "Second Doc", createDocumentId, makeIdGenerator("node"), now);
    const firstDocument = workspace.workspace.documents["doc-1"];

    workspace = renameDocumentInWorkspace(workspace, "doc-1", "Daily Notes", () => 200);
    expect(workspace.workspace.documents["doc-1"]).toMatchObject({
      title: "Daily Notes",
      slug: "daily-notes",
      rootId: firstDocument.rootId,
      nodes: firstDocument.nodes
    });

    workspace = deleteDocumentFromWorkspace(workspace, "doc-2", () => 300);
    expect(workspace.workspace.documentOrder).toEqual(["doc-1"]);
    expect(workspace.workspace.activeDocumentId).toBe("doc-1");
    expect(workspace.workspace.view.perDocument["doc-2"]).toBeUndefined();
  });
});
