# Workspace 테스트

Phase 16부터 최상위 저장 단위가 단일 `OutlineSnapshot`에서 `WorkspaceSnapshot`으로 확장된다. 워크스페이스 테스트는 UI보다 먼저 순수 도메인 command와 schema migration을 고정한다.

```ts
describe("workspace snapshot migration", () => {
  it("promotes a v1 outline snapshot into a v2 single-document workspace", () => {});
  it("keeps existing v2 workspace snapshots unchanged", () => {});
});

describe("workspace document commands", () => {
  it("creates and switches documents with independent root and view state", () => {});
  it("renames and deletes documents without changing document outline data", () => {});
});

describe("workspace json import and export", () => {
  it("preserves workspace schema version when exporting and importing json", () => {});
});
```

다음 Red 후보:

- 문서 생성/이름 변경/삭제가 outline Undo/Redo stack에 들어가지 않는 앱 런타임 테스트를 추가한다.
- active document switcher UI가 문서 생성/전환/이름 변경/삭제를 수행한다.
- recent documents/targets가 workspace view state에 보존된다.
