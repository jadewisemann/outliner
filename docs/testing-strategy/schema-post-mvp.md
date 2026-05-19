# MVP 이후 기능 테스트

```ts
describe("outline search", () => {
  it("finds text matches under the current zoom root", () => {}); // 완료됨
  it("includes matches inside collapsed descendants", () => {}); // 완료됨
  it("reveals collapsed ancestors when navigating to a match", () => {}); // 완료됨
  it("renders flat search results without changing the document structure", () => {}); // 완료됨
});

describe("tags and internal links", () => {
  it("extracts hash and at tags from node text", () => {}); // 완료됨
  it("filters visible results by tag", () => {}); // 완료됨
  it("stores internal links by target node id", () => {}); // 완료됨
  it("keeps links valid after the target text changes", () => {}); // 완료됨
  it("finds backlinks for a target node", () => {}); // 완료됨
});

describe("rich formatting and notes", () => {
  it("renders markdown-like inline formatting for inactive rows", () => {}); // 완료됨
  it("keeps active row editing in source text", () => {}); // 완료됨
  it("stores note text separately from node text", () => {}); // 완료됨
  it("applies heading, color, and numbered metadata without changing children order", () => {}); // 완료됨
});

describe("input stability", () => {
  it("keeps the active editor mounted while Korean IME composition updates text", () => {}); // 완료됨
  it("commits Korean text from IME composition end", () => {}); // 완료됨
  it("does not treat composing Enter or Backspace as outline commands", () => {}); // 완료됨
  it("keeps normal Enter and Backspace behavior after IME composition ends", () => {}); // 완료됨
});

describe("remote sync cost controls", () => {
  it("keeps Firebase disabled unless remote=firebase is explicit", () => {}); // 완료됨
  it("batches repeated local text commits before remote append", () => {}); // v1 guard 완료
  it("rejects remote append payloads over the byte budget", () => {}); // 완료됨
  it("compacts snapshot and cleans old update logs", () => {}); // v1 guard 완료
  it("meters fake remote read and write bytes", () => {}); // 완료됨
  it("queries only updates after the compacted cursor", () => {}); // v1 guard 완료
  it("does not replay old update logs as fresh subscription events", () => {}); // v1 guard 완료
  it("syncs through a RemoteStore without realtime subscribe", () => {}); // 완료됨
  it("keeps a 10 minute typing simulation under the stored byte budget", () => {}); // 완료됨
  it("rejects equal-version writes from different v2 clients", () => {}); // 완료됨
  it("retries a failed v2 snapshot write on focus", () => {}); // 완료됨
  it("backs up local changes when a newer remote snapshot wins", () => {}); // 완료됨
  it("keeps full-snapshot write/read bandwidth below the Phase 12-C budget", () => {}); // 완료됨
});

describe("import and export", () => {
  it("exports OPML while preserving hierarchy", () => {});
  it("imports OPML into node drafts without mutating the current document", () => {});
  it("exports only visible items when requested", () => {});
  it("rejects invalid import input without data loss", () => {});
});

describe("history and preferences", () => {
  it("stores restorable local snapshot history", () => {});
  it("restores a selected snapshot as one undoable action", () => {});
  it("keeps user preferences outside the outline undo stack", () => {});
});
```
