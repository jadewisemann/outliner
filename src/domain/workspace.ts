import {
  createEmptyDocument,
  createInitialView,
  ensureEditableNode
} from "./outline";
import type {
  Clock,
  DocumentId,
  IdGenerator,
  OutlineDocument,
  OutlineSnapshot,
  StoredSnapshot,
  ViewState,
  WorkspaceSnapshot
} from "./outlineTypes";

export function isWorkspaceSnapshot(snapshot: StoredSnapshot): snapshot is WorkspaceSnapshot {
  return snapshot.schemaVersion === 2;
}

export function toActiveOutlineSnapshot(snapshot: StoredSnapshot): OutlineSnapshot {
  if (!isWorkspaceSnapshot(snapshot)) {
    return snapshot;
  }
  return {
    document: getActiveDocument(snapshot),
    view: getActiveView(snapshot)
  };
}

export function toWorkspaceSnapshot(
  snapshot: StoredSnapshot,
  createDocumentId: IdGenerator,
  now: Clock = Date.now
): WorkspaceSnapshot {
  if (isWorkspaceSnapshot(snapshot)) {
    return snapshot;
  }
  const timestamp = now();
  const documentId = snapshot.document.id ?? createDocumentId();
  const document = normalizeWorkspaceDocument(snapshot.document, {
    id: documentId,
    title: snapshot.document.title ?? "Untitled",
    timestamp
  });
  return {
    schemaVersion: 2,
    workspace: {
      id: "workspace",
      documentOrder: [documentId],
      activeDocumentId: documentId,
      documents: {
        [documentId]: document
      },
      view: {
        activeDocumentId: documentId,
        perDocument: {
          [documentId]: snapshot.view
        }
      },
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

export function getActiveDocument(workspace: WorkspaceSnapshot): OutlineDocument {
  return workspace.workspace.documents[workspace.workspace.activeDocumentId];
}

export function getActiveView(workspace: WorkspaceSnapshot): ViewState {
  return workspace.workspace.view.perDocument[workspace.workspace.activeDocumentId];
}

export function createDocumentInWorkspace(
  workspace: WorkspaceSnapshot,
  title: string,
  createDocumentId: IdGenerator,
  createNodeId: IdGenerator,
  now: Clock = Date.now
): WorkspaceSnapshot {
  const timestamp = now();
  const documentId = createDocumentId();
  const editable = ensureEditableNode(createEmptyDocument(() => timestamp), createNodeId, now);
  const document = normalizeWorkspaceDocument(editable.document, {
    id: documentId,
    title,
    timestamp
  });
  const view = createInitialView(document);
  return {
    ...workspace,
    workspace: {
      ...workspace.workspace,
      documentOrder: [...workspace.workspace.documentOrder, documentId],
      activeDocumentId: documentId,
      documents: {
        ...workspace.workspace.documents,
        [documentId]: document
      },
      view: {
        ...workspace.workspace.view,
        activeDocumentId: documentId,
        perDocument: {
          ...workspace.workspace.view.perDocument,
          [documentId]: view
        }
      },
      updatedAt: timestamp
    }
  };
}

export function switchActiveDocument(workspace: WorkspaceSnapshot, documentId: DocumentId): WorkspaceSnapshot {
  if (!workspace.workspace.documents[documentId]) {
    return workspace;
  }
  return {
    ...workspace,
    workspace: {
      ...workspace.workspace,
      activeDocumentId: documentId,
      view: {
        ...workspace.workspace.view,
        activeDocumentId: documentId
      }
    }
  };
}

export function renameDocumentInWorkspace(
  workspace: WorkspaceSnapshot,
  documentId: DocumentId,
  title: string,
  now: Clock = Date.now
): WorkspaceSnapshot {
  const document = workspace.workspace.documents[documentId];
  if (!document) {
    return workspace;
  }
  const timestamp = now();
  return {
    ...workspace,
    workspace: {
      ...workspace.workspace,
      documents: {
        ...workspace.workspace.documents,
        [documentId]: {
          ...document,
          title,
          slug: slugifyTitle(title),
          updatedAt: timestamp
        }
      },
      updatedAt: timestamp
    }
  };
}

export function deleteDocumentFromWorkspace(
  workspace: WorkspaceSnapshot,
  documentId: DocumentId,
  now: Clock = Date.now
): WorkspaceSnapshot {
  if (!workspace.workspace.documents[documentId] || workspace.workspace.documentOrder.length <= 1) {
    return workspace;
  }
  const timestamp = now();
  const documentOrder = workspace.workspace.documentOrder.filter((id) => id !== documentId);
  const documents = { ...workspace.workspace.documents };
  const perDocument = { ...workspace.workspace.view.perDocument };
  delete documents[documentId];
  delete perDocument[documentId];
  const activeDocumentId =
    workspace.workspace.activeDocumentId === documentId ? documentOrder[0] : workspace.workspace.activeDocumentId;
  return {
    ...workspace,
    workspace: {
      ...workspace.workspace,
      documentOrder,
      activeDocumentId,
      documents,
      view: {
        ...workspace.workspace.view,
        activeDocumentId,
        perDocument
      },
      updatedAt: timestamp
    }
  };
}

function normalizeWorkspaceDocument(
  document: OutlineDocument,
  options: { id: DocumentId; title: string; timestamp: number }
): OutlineDocument {
  return {
    ...document,
    id: options.id,
    title: options.title,
    slug: document.slug ?? slugifyTitle(options.title),
    createdAt: document.createdAt ?? options.timestamp,
    updatedAt: document.updatedAt ?? options.timestamp
  };
}

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}
