import * as Y from "yjs";
import type { OutlineSnapshot } from "../domain/outlineTypes";

const SNAPSHOT_KEY = "snapshot";

export type YjsWorkspace = {
  doc: Y.Doc;
  state: Y.Map<OutlineSnapshot>;
  undoManager: Y.UndoManager;
};

export function createYjsWorkspace(initial?: OutlineSnapshot): YjsWorkspace {
  const doc = new Y.Doc();
  const state = doc.getMap<OutlineSnapshot>("outline");
  if (initial) {
    state.set(SNAPSHOT_KEY, initial);
  }
  const undoManager = new Y.UndoManager(state);
  return { doc, state, undoManager };
}

export function getYjsSnapshot(workspace: YjsWorkspace): OutlineSnapshot | undefined {
  return workspace.state.get(SNAPSHOT_KEY);
}

export function setYjsSnapshot(workspace: YjsWorkspace, snapshot: OutlineSnapshot): void {
  workspace.state.set(SNAPSHOT_KEY, snapshot);
}

export function encodeState(workspace: YjsWorkspace): Uint8Array {
  return Y.encodeStateAsUpdate(workspace.doc);
}

export function encodeStateVector(workspace: YjsWorkspace): Uint8Array {
  return Y.encodeStateVector(workspace.doc);
}

export function applyUpdate(workspace: YjsWorkspace, update: Uint8Array): void {
  Y.applyUpdate(workspace.doc, update);
}

export function mergeIntoNewWorkspace(update: Uint8Array): YjsWorkspace {
  const workspace = createYjsWorkspace();
  applyUpdate(workspace, update);
  return workspace;
}
