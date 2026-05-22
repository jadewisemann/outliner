# Phase 16: 다중 문서 워크스페이스 기반 - 예정

Stage 1 Product Core의 첫 Phase다. 목표는 기존 단일 `OutlineSnapshot`을 다중 문서 `WorkspaceSnapshot`으로 올리되, 기존 사용자 데이터는 자동으로 단일 문서 workspace로 승격하는 것이다.

### 목표

- `Workspace -> Documents -> Nodes` 모델을 도입한다.
- 기존 v1 `{ document, view }` 데이터를 v2 single-document workspace로 migration한다.
- 문서 생성, 전환, 이름 변경, 삭제, 최근 문서 이동을 최소 제품 표면으로 제공한다.
- 단일 문서 편집 경험은 깨지지 않게 유지한다.

### 먼저 작성할 테스트

- v1 `OutlineSnapshot`을 읽으면 `WorkspaceSnapshot` v2로 자동 승격된다.
- workspace는 여러 문서를 보관하고 active document를 전환할 수 있다.
- 각 문서는 독립된 `rootId`, `nodes`, `ViewState`를 가진다.
- document rename/delete/create가 preferences와 outline Undo/Redo 의미를 섞지 않는다.
- local persistence, manual backup, JSON export/import가 schema version을 보존한다.

### 구현 항목

- `DocumentId`, `WorkspaceSnapshot`, `WorkspaceViewState` 타입 추가
- `OutlineDocument`에 `id`, `title`, `slug`, timestamps 추가
- v1 snapshot -> v2 workspace migration
- active document switcher와 recent documents
- document create/rename/delete 기본 command
- local persistence/history/backup의 workspace snapshot 대응

### 완료 기준

- 사용자는 하나의 workspace 안에서 여러 outline document를 만들고 오갈 수 있다.
- 기존 단일 문서 데이터는 별도 수동 조치 없이 열린다.
- 문서 단위 상태와 노드 단위 상태가 타입과 selector에서 구분된다.

### 보류

- 문서 간 링크 해석, backlinks, broken link UX는 Phase 17에서 다룬다.
- 데스크톱/계정/sync 제품화는 Stage 2로 미룬다.
