# Phase 16: 다중 문서 워크스페이스 기반 - 완료

Stage 1 Product Core의 첫 Phase다. 목표는 기존 단일 `OutlineSnapshot`을 다중 문서 `WorkspaceSnapshot`으로 올리되, 기존 사용자 데이터는 자동으로 단일 문서 workspace로 승격하는 것이다.

### 목표

- `Workspace -> Documents -> Nodes` 모델을 도입한다.
- 기존 v1 `{ document, view }` 데이터를 v2 single-document workspace로 migration한다.
- 문서 생성, 전환, 이름 변경, 삭제, 최근 문서 이동을 최소 제품 표면으로 제공한다.
- 다중 문서 워크스페이스에서는 왼쪽 사이드바를 기본 탐색 표면으로 제공한다.
- 단일 문서 편집 경험은 깨지지 않게 유지한다.

### 먼저 작성할 테스트

- [x] v1 `OutlineSnapshot`을 읽으면 `WorkspaceSnapshot` v2로 자동 승격된다.
- [x] workspace는 여러 문서를 보관하고 active document를 전환할 수 있다.
- [x] 각 문서는 독립된 `rootId`, `nodes`, `ViewState`를 가진다.
- [x] document rename/delete/create가 preferences와 outline Undo/Redo 의미를 섞지 않는다.
- [x] local persistence, manual backup, JSON export/import가 schema version을 보존한다.
- [x] workspace sidebar는 문서 목록, active document 표시, 문서 생성/전환/이름 변경/삭제 진입점을 제공한다.
- [x] single-document workspace에서도 sidebar를 접거나 최소 폭으로 둘 수 있어 기존 단일 문서 편집 집중 흐름을 해치지 않는다.

### 구현 항목

- [x] `DocumentId`, `WorkspaceSnapshot`, `WorkspaceViewState` 타입 추가
- [x] `OutlineDocument`에 `id`, `title`, `slug`, timestamps 추가
- [x] v1 snapshot -> v2 workspace migration
- [x] active document switcher와 recent documents
- [x] workspace sidebar와 document list UI
- [x] document create/rename/delete 기본 command
- [x] local persistence/history/backup의 workspace snapshot 대응

### 완료 기준

- 사용자는 하나의 workspace 안에서 여러 outline document를 만들고 오갈 수 있다.
- 사용자는 사이드바에서 현재 workspace의 문서 목록을 보고 active document를 전환할 수 있다.
- 사용자는 사이드바에서 새 문서를 만들고, 문서 이름 변경과 삭제 흐름에 진입할 수 있다.
- 사이드바는 접을 수 있어 단일 문서 작성 화면의 집중감을 유지한다.
- 기존 단일 문서 데이터는 별도 수동 조치 없이 열린다.
- 문서 단위 상태와 노드 단위 상태가 타입과 selector에서 구분된다.

### 보류

- 문서 간 링크 해석, backlinks, broken link UX는 Phase 17에서 다룬다.
- 데스크톱/계정/sync 제품화는 Stage 2로 미룬다.

### 진행 기록

- 2026-05-22: `src/domain/workspace.ts`에 v1 `OutlineSnapshot` -> v2 `WorkspaceSnapshot` 승격과 문서 생성/전환/이름 변경/삭제 순수 도메인 명령을 추가했다.
- 2026-05-22: `src/domain/workspace.test.ts`로 migration, active document 전환, 문서별 독립 view state, rename/delete의 outline data 보존을 검증했다.
- 2026-05-22: local persistence/history/conflict backup/manual backup/JSON export-import가 v2 `WorkspaceSnapshot.schemaVersion`을 보존하도록 타입과 테스트를 확장했다.
- 2026-05-22: `useOutlineWorkspace`와 Yjs snapshot runtime을 v2 `WorkspaceSnapshot` 기준으로 승격하고, outline edit undo/redo와 workspace document command를 분리했다.
- 2026-05-22: 왼쪽 workspace sidebar에서 문서 목록, active 표시, 생성, 전환, inline rename, 삭제, collapse 흐름을 제공하도록 UI와 테스트를 추가했다.
- 2026-05-22: 완료 체크 UI는 항상 노출하지 않고, 텍스트가 `[]` 또는 `[*]` marker로 시작할 때만 lightweight 완료 상태로 승격하도록 TDD로 구현했다. 편집 중에는 완료 상태가 `[]`/`[*]` source marker로 보이며, TODO list나 task metadata로 확장하지 않는다.
- 2026-05-22: `Ctrl+A` 확장 선택은 텍스트 선택 이후 현재 노드, 형제 범위, 부모 순서로 확장한다. `Ctrl+L`은 현재 줄 선택, `Ctrl+Shift+K`는 현재 줄 삭제로 추가했다.
- 2026-05-22: 추가 단축키 후보였던 `Ctrl+Shift+L`, `Ctrl+Shift+A`, `Ctrl+Shift+Enter`는 이번 범위에서 구현하지 않았다.
- 2026-05-22: 노드 row 조작 표면은 불렛 왼쪽의 전체 메뉴 버튼과 퀵 버튼을 기본으로 한다. 퀵 버튼과 불렛 클릭은 `깊이 들어가기`/`완료로 표시`를 나눠 맡고, 설정에서 불렛 클릭을 금지하면 퀵 버튼 두 개를 모두 노출한다.

### 최종 확인

- `npm run typecheck`
- `npm test -- src/components/Outliner.test.tsx`
- `npm test` (213 tests)
- `npm run build`
