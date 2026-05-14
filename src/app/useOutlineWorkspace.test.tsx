import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialView, createNodeAfter } from "../domain/outline";
import type { OutlineSnapshot } from "../domain/outlineTypes";
import type { LocalPersistence } from "../persistence/localPersistence";
import { makeDocumentWithTexts } from "../test/factories";
import { useOutlineWorkspace } from "./useOutlineWorkspace";

function memoryPersistence(initial: OutlineSnapshot | null = null): LocalPersistence & { saved: OutlineSnapshot[] } {
  const saved: OutlineSnapshot[] = [];
  let current = initial;
  return {
    saved,
    async load() {
      return current;
    },
    async save(snapshot) {
      current = snapshot;
      saved.push(snapshot);
    },
    async clear() {
      current = null;
    }
  };
}

describe("useOutlineWorkspace", () => {
  it("loads a persisted snapshot into a Yjs-backed runtime", async () => {
    const document = makeDocumentWithTexts(["Saved"]);
    const persistence = memoryPersistence({ document, view: createInitialView(document) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => 1
      })
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const childId = document.nodes[document.rootId].children[0];
    expect(result.current.snapshot.document.nodes[childId].text).toBe("Saved");
  });

  it("commits snapshots and persists the latest runtime state", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const second = makeDocumentWithTexts(["B"]);
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => 1
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });

    const childId = second.nodes[second.rootId].children[0];
    await waitFor(() => expect(result.current.snapshot.document.nodes[childId].text).toBe("B"));
    await waitFor(() => expect(persistence.saved.at(-1)?.document.nodes[childId].text).toBe("B"));
  });

  it("undoes and redoes committed snapshots", async () => {
    const first = makeDocumentWithTexts(["A"]);
    const created = createNodeAfter(first, first.nodes[first.rootId].children[0], () => "n-2", () => 2);
    const second = created.document;
    const persistence = memoryPersistence({ document: first, view: createInitialView(first) });
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: () => "new",
        now: () => 1
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.commitSnapshot({ document: second, view: createInitialView(second) });
    });
    await waitFor(() => expect(result.current.snapshot.document.nodes[second.rootId].children).toHaveLength(2));
    act(() => {
      result.current.undo();
    });

    await waitFor(() => expect(result.current.snapshot.document.nodes[first.rootId].children).toHaveLength(1));

    act(() => {
      result.current.redo();
    });

    await waitFor(() => expect(result.current.snapshot.document.nodes[second.rootId].children).toHaveLength(2));
  });

  it("keeps an editable node after undoing to an empty document", async () => {
    const persistence = memoryPersistence(null);
    const { result } = renderHook(() =>
      useOutlineWorkspace({
        persistence,
        createId: vi.fn(() => "editable"),
        now: () => 1
      })
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const empty = {
      ...result.current.snapshot.document,
      nodes: {
        root: {
          ...result.current.snapshot.document.nodes.root,
          children: []
        }
      }
    };

    act(() => {
      result.current.commitSnapshot({ document: empty, view: createInitialView(empty) });
    });

    expect(result.current.snapshot.document.nodes.root.children).toHaveLength(1);
  });
});
