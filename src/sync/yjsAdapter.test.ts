import { describe, expect, it } from "vitest";
import { createInitialView } from "../domain/outline";
import { toActiveOutlineSnapshot, toWorkspaceSnapshot } from "../domain/workspace";
import { makeDocumentWithTexts } from "../test/factories";
import {
  applyUpdate,
  createYjsWorkspace,
  encodeState,
  getYjsSnapshot,
  mergeIntoNewWorkspace,
  setYjsSnapshot
} from "./yjsAdapter";

describe("yjs adapter", () => {
  it("applies an encoded update to another workspace", () => {
    const document = makeDocumentWithTexts(["A", "B"]);
    const snapshot = { document, view: createInitialView(document) };
    const source = createYjsWorkspace(snapshot);
    const target = mergeIntoNewWorkspace(encodeState(source));
    expect(toActiveOutlineSnapshot(getYjsSnapshot(target)!).document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
  });

  it("keeps duplicate updates idempotent", () => {
    const document = makeDocumentWithTexts(["A"]);
    const source = createYjsWorkspace({ document, view: createInitialView(document) });
    const update = encodeState(source);
    const target = createYjsWorkspace();
    applyUpdate(target, update);
    applyUpdate(target, update);
    expect(toActiveOutlineSnapshot(getYjsSnapshot(target)!).document.nodes[document.rootId].children).toHaveLength(1);
  });

  it("preserves workspace schema version in encoded updates", () => {
    const document = makeDocumentWithTexts(["Workspace"]);
    const snapshot = toWorkspaceSnapshot({ document, view: createInitialView(document) }, () => "doc-1", () => 1);
    const source = createYjsWorkspace(snapshot);
    const target = mergeIntoNewWorkspace(encodeState(source));

    expect(getYjsSnapshot(target)).toMatchObject({ schemaVersion: 2 });
  });

  it("undoes and redoes snapshot changes", () => {
    const document = makeDocumentWithTexts(["A"]);
    const workspace = createYjsWorkspace({ document, view: createInitialView(document) });
    const nextDocument = makeDocumentWithTexts(["B"]);
    setYjsSnapshot(workspace, { document: nextDocument, view: createInitialView(nextDocument) });
    workspace.undoManager.undo();
    expect(toActiveOutlineSnapshot(getYjsSnapshot(workspace)!).document.nodes[document.rootId].children).toEqual(
      document.nodes[document.rootId].children
    );
    workspace.undoManager.redo();
    expect(toActiveOutlineSnapshot(getYjsSnapshot(workspace)!).document.nodes[nextDocument.rootId].children).toEqual(
      nextDocument.nodes[nextDocument.rootId].children
    );
  });
});
