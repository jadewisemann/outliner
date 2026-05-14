# 개발 단계

모든 Phase는 TDD로 진행한다. 각 기능은 실패하는 테스트를 먼저 만들고, 최소 구현으로 통과시킨 뒤, 리팩터링한다.

현재 구현 상태는 Phase 0~4 완료, Phase 5~6 기반 모듈 일부 구현이다. 다음 개발자는 Phase 5부터 이어가되, 이미 존재하는 `yjsAdapter`, `localPersistence`, `remoteSync`, `syncQueue`를 버리지 않고 앱 런타임에 연결하는 방향으로 진행한다.

## Phase 0: 프로젝트 부트스트랩 - 완료됨

### 목표

React + Vite + TypeScript 기반 프로젝트를 만들고, TDD 루프를 돌릴 수 있는 최소 환경을 준비한다.

### 완료된 산출물

- Vite + React + TypeScript 구성
- Vitest, React Testing Library, Playwright 구성
- `npm run test`, `npm run test:watch`, `npm run test:e2e`, `npm run typecheck` 스크립트
- Root outliner 화면과 smoke E2E

### 완료 기준

- 모든 테스트 명령이 실행 가능하다.
- Root 화면이 브라우저에서 보인다.
- 빈 문서에서 첫 입력 가능한 노드가 보인다.

## Phase 1: 순수 아웃라인 도메인 - 완료됨

### 목표

UI와 외부 라이브러리 없이 아웃라이너 트리 조작 규칙을 확정한다.

### 완료된 산출물

- normalized outline tree
- root 불변성, create, split, indent, outdent, collapse command
- visible node selector
- breadcrumb selector
- deterministic test factory

### 완료 기준

- 도메인 단위 테스트가 통과한다.
- UI 없이 편집 규칙 대부분을 검증할 수 있다.
- 경계 조건 테스트가 포함되어 있다.

## Phase 2: 로컬 UI 편집 - 완료됨

### 목표

도메인 command를 React UI와 연결해 키보드 중심 편집 경험을 만든다.

### 완료된 산출물

- Outliner, row, breadcrumb, sync status UI
- keyboard command mapping
- collapse toggle
- zoom/breadcrumb navigation
- focus/selection 상태

### 완료 기준

- 키보드만으로 3뎁스 이상 작성 가능하다.
- 핵심 편집 흐름의 컴포넌트 테스트가 통과한다.
- Playwright에서 기본 화면 진입이 통과한다.

## Phase 3: Lexical 통합 - 완료됨

### 목표

텍스트 편집 경험을 Lexical로 옮기고, 도메인 command와 충돌 없이 연결한다.

### 완료된 산출물

- active row Lexical editor
- inactive row plain text render
- Lexical command bridge
- markdown auto-transform 미연결
- active row text sync와 focus 안정화

### 완료 기준

- 선택된 row만 Lexical editor를 마운트한다.
- 텍스트 편집과 트리 command가 함께 동작한다.
- `- `, `* `, `# ` 입력은 플레인 텍스트로 유지된다.

## Phase 4: 벌크 편집 - 완료됨

### 목표

Dynalist식 빠른 구조 편집을 위해 멀티라인 붙여넣기, 다중 노드 선택, 선택 범위 일괄 명령, clipboard round-trip을 구현한다.

### 완료된 산출물

- `parseIndentedText`
- `insertNodesFromText`
- `selectVisibleRange`
- `normalizeTopLevelSelection`
- `bulkIndentNodes`
- `bulkOutdentNodes`
- `bulkDeleteNodes`
- `bulkToggleCollapse`
- `serializeNodesForClipboard`
- range selection state
- Lexical paste/copy keyboard bridge
- 선택 범위 하이라이트
- bulk editing E2E

### 완료 기준

- 멀티라인 paste가 indentation 구조를 유지한다.
- `Shift+ArrowUp/Down`, `Tab`, `Shift+Tab`, `Backspace/Delete`, copy/paste 벌크 흐름이 컴포넌트 테스트로 검증된다.
- Playwright에서 여러 줄 붙여넣기와 선택 범위 들여쓰기/삭제가 통과한다.
- 벌크 명령은 단일 노드 명령과 같은 domain model 위에서 동작한다.

## Phase 5: Yjs 런타임 통합과 Undo/Redo - 다음 구현 우선순위

### 목표

현재 앱의 `useState + IndexedDB snapshot save` 흐름을 Yjs-backed workspace 흐름으로 승격한다. MVP에서는 normalized `OutlineSnapshot`을 Y.Doc에 저장하고, domain command 결과를 Yjs transaction으로 반영한다. `@lexical/yjs` 직접 binding은 리치텍스트 단계 전까지 보류한다.

### 현재 기반

- `src/sync/yjsAdapter.ts`는 snapshot 저장, update encode/apply, UndoManager 기본 테스트를 가진다.
- `src/persistence/localPersistence.ts`는 IndexedDB snapshot 저장/복원을 가진다.
- `src/sync/remoteSync.ts`와 `syncQueue.ts`는 원격 sync의 기초 상태 전이를 가진다.

### 먼저 작성할 테스트

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

## Phase 6: 개인 다기기 원격 동기화

### 목표

snapshot + updates 방식으로 같은 사용자의 여러 브라우저/기기 변경을 병합한다. Firebase 연결보다 FakeRemoteStore 기반 통합 테스트를 먼저 완성한다.

### 먼저 작성할 테스트

- remote snapshot을 local Yjs workspace에 적용한다.
- remote update log를 수신 순서와 무관하게 적용한다.
- 같은 update를 여러 번 받아도 상태가 중복되지 않는다.
- append 실패 시 update가 offline queue에 남는다.
- 재연결 시 pending update가 flush되고 status가 `synced`가 된다.
- 두 fake client가 동시에 편집한 변경이 충돌 복사본 없이 병합된다.
- 두 browser context가 같은 fake 또는 Firebase-backed workspace를 통해 변경을 주고받는다.

### 구현 항목

- `RemoteStore` contract를 기준으로 sync orchestration을 앱에서 사용할 수 있게 정리한다.
- FakeRemoteStore 통합 테스트를 Firebase adapter 테스트보다 먼저 확장한다.
- Firebase configuration은 선택적 런타임 설정으로 둔다. 설정이 없으면 `local-only`로 동작한다.
- local Yjs update를 `RemoteUpdate`로 변환하는 client id, seq, update id 생성 규칙을 확정한다.
- subscribe로 받은 remote update는 applied id set을 통해 중복 적용을 방지한다.
- offline queue flush와 sync status badge를 앱 상태에 연결한다.

### 완료 기준

- Firebase 없이 sync 로직 대부분이 테스트된다.
- 두 fake client의 동시 편집이 병합된다.
- 오프라인 편집 후 재연결 동기화가 통과한다.
- Firebase 설정이 없어도 local-only MVP가 깨지지 않는다.

## Phase 7: 성능과 가상화

### 목표

대량 노드 문서에서 화면에 보이는 노드만 효율적으로 계산하고 렌더링한다. active row만 Lexical을 마운트한다는 원칙은 유지한다.

### 먼저 작성할 테스트

- 10,000개 노드 fixture에서 visible node 계산이 제한 시간 안에 끝난다.
- 접힘 상태가 대량 fixture에서도 정확히 반영된다.
- 줌인 상태에서는 해당 subtree만 visible list에 포함된다.
- typing 중 active row 외 전체 row가 불필요하게 다시 렌더링되지 않는다.

### 구현 항목

- 대량 outline fixture generator
- visible node selector memoization 강화
- virtual list 적용
- active row Lexical mount count 검증
- render profiling 기준 정리

### 완료 기준

- 10,000개 노드 fixture에서 사용 가능한 성능을 보인다.
- 입력 시 전체 트리를 불필요하게 재렌더링하지 않는다.
- 50,000개 노드 목표를 막는 구조적 병목이 문서화되어 있다.

## Phase 8: 모바일 패키징 - 웹 MVP 이후

### 목표

Capacitor 앱으로 패키징하고 모바일 persistence 전략을 검증한다. 이 Phase는 웹 MVP 완료 전 구현 대상이 아니다.

### 먼저 작성할 테스트

- 모바일 persistence adapter 계약 테스트
- viewport resize 시 편집 중인 노드가 가려지지 않는다.
- 앱 재시작 후 로컬 문서가 복원된다.

### 구현 항목

- Capacitor setup
- iOS/Android run config
- mobile keyboard handling
- SQLite persistence 검증 또는 IndexedDB fallback
- 모바일 sync 검증

### 완료 기준

- 에뮬레이터에서 오프라인 편집과 복원이 가능하다.
- 네트워크 복귀 후 원격 동기화가 된다.
