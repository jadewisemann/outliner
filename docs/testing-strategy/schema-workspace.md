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
```

다음 Red 후보:

- local persistence가 v1/v2 저장값을 모두 읽고 v2 schema version을 보존한다.
- manual backup이 `WorkspaceSnapshot`과 분리된 preferences/history를 함께 직렬화한다.
- JSON export/import가 workspace schema version을 유지한다.
- 문서 생성/이름 변경/삭제가 outline Undo/Redo stack에 들어가지 않는 앱 런타임 테스트를 추가한다.
