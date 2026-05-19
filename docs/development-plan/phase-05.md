# Phase 5: Yjs 런타임 통합과 Undo/Redo - 완료됨

### 목표

현재 앱의 `useState + IndexedDB snapshot save` 흐름을 Yjs-backed workspace 흐름으로 승격한다. MVP에서는 normalized `OutlineSnapshot`을 Y.Doc에 저장하고, domain command 결과를 Yjs transaction으로 반영한다. `@lexical/yjs` 직접 binding은 리치텍스트 단계 전까지 보류한다.

### 완료된 산출물

- `src/sync/yjsAdapter.ts`는 snapshot 저장, update encode/apply, UndoManager 기본 테스트를 가진다.
- `src/persistence/localPersistence.ts`는 IndexedDB snapshot 저장/복원을 가진다.
- `src/sync/remoteSync.ts`와 `syncQueue.ts`는 원격 sync의 기초 상태 전이를 가진다.
- `useOutlineWorkspace`는 local persistence snapshot을 Yjs-backed runtime으로 복원한다.
- 앱은 Yjs-backed snapshot을 렌더링하고 `Mod+Z`, `Mod+Shift+Z`, `Mod+Y` Undo/Redo shortcut을 처리한다.

### 완료된 테스트

- 앱 시작 시 local persistence snapshot을 Yjs workspace로 복원한다.
- Yjs workspace snapshot이 React 화면 상태로 렌더링된다.
- 노드 생성, 텍스트 변경, indent/outdent, bulk command가 Yjs transaction으로 기록된다.
- `Mod+Z`가 텍스트 변경과 구조 변경을 되돌린다.
- `Mod+Shift+Z` 또는 `Mod+Y`가 redo를 수행한다.
- reload 후 문서 내용, collapsed state, zoom state, selected node가 복원된다.
- Undo/Redo 이후에도 기존 domain command 테스트의 관찰 동작이 유지된다.

### 구현 항목

- App-level workspace hook 또는 adapter를 추가해 `OutlineSnapshot`을 Yjs source of truth로 다룬다.
- 모든 document/view 변경은 domain command 결과를 `setYjsSnapshot`으로 반영한다.
- Yjs update 발생 시 local persistence에 snapshot 또는 encoded update를 저장한다.
- UndoManager는 텍스트/구조/벌크 명령을 사용자 action 단위로 되돌린다.
- Undo/Redo keyboard bridge를 Outliner 또는 app shell에 연결한다.
- 기존 `LocalPersistence` contract는 유지하되, 저장 단위가 Yjs snapshot으로 바뀌어도 호출부는 adapter 뒤에 숨긴다.

### 완료 기준

- 새로고침 후 문서와 UI 상태가 복원된다.
- Undo/Redo가 텍스트와 구조 편집 모두에서 동작한다.
- Yjs adapter 테스트와 앱 통합 테스트가 통과한다.
- remote sync 구현 전에도 local-only 편집은 안정적으로 동작한다.
