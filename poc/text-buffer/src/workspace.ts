export type ExternalChange =
  | { kind: "replace"; text: string }
  | { kind: "keep-local" }
  | { kind: "conflict"; base: string; local: string; remote: string };

export function reconcileExternal(base: string, local: string, remote: string): ExternalChange {
  if (local === base) return { kind: "replace", text: remote };
  if (remote === base || remote === local) return { kind: "keep-local" };
  return { kind: "conflict", base, local, remote };
}

export type SaveSnapshot = { revision: number; text: string };

/** Tracks durability without becoming a second editable copy of the document. */
export class FileSession {
  private base = "";
  private revision = 0;
  private savedRevision = 0;

  open(text: string) {
    this.base = text;
    this.revision = 0;
    this.savedRevision = 0;
  }

  changed() {
    this.revision += 1;
  }

  beginSave(text: string): SaveSnapshot {
    return { revision: this.revision, text };
  }

  completeSave(snapshot: SaveSnapshot): boolean {
    this.base = snapshot.text;
    this.savedRevision = snapshot.revision;
    return this.revision === snapshot.revision;
  }

  external(local: string, remote: string): ExternalChange {
    return reconcileExternal(this.base, local, remote);
  }

  acceptRemote(remote: string) {
    this.base = remote;
    this.revision = 0;
    this.savedRevision = 0;
  }

  get dirty(): boolean {
    return this.revision !== this.savedRevision;
  }
}
