# 개발 단계

모든 Phase는 TDD로 진행한다. 각 기능은 실패하는 테스트를 먼저 만들고, 최소 구현으로 통과시킨 뒤, 리팩터링한다.

## Phase 0: 프로젝트 부트스트랩

### 목표

React + Vite + TypeScript 기반 프로젝트를 만들고, TDD 루프를 돌릴 수 있는 최소 환경을 준비한다.

### 먼저 작성할 테스트

- 앱이 Root 화면을 렌더링한다.
- 빈 문서에서 첫 입력 가능한 노드가 보인다.
- smoke E2E가 앱 첫 화면을 연다.

### 구현 항목

- Vite + React + TypeScript 구성
- Vitest 구성
- React Testing Library 구성
- Playwright 구성
- `npm run test`, `npm run test:watch`, `npm run test:e2e`, `npm run typecheck` 스크립트
- 기본 레이아웃
- Root 문서 placeholder

### 완료 기준

- 모든 테스트 명령이 실행 가능하다.
- 실패 테스트 작성 후 Green까지 확인했다.
- Root 화면이 브라우저에서 보인다.

## Phase 1: 순수 아웃라인 도메인

### 목표

UI와 외부 라이브러리 없이 아웃라이너 트리 조작 규칙을 확정한다.

### 먼저 작성할 테스트

- Root는 삭제할 수 없다.
- 노드를 대상 노드 뒤에 생성한다.
- 텍스트 중간에서 노드를 분리한다.
- 첫 형제 노드는 indent되지 않는다.
- 노드는 위 형제의 마지막 자식으로 indent된다.
- Root 직속 노드는 outdent되지 않는다.
- 노드는 부모의 다음 형제로 outdent된다.
- collapsed 노드의 자식은 visible list에서 제외된다.
- breadcrumb path를 계산한다.

### 구현 항목

- `src/domain/outline.ts`
- `src/domain/outline.test.ts`
- 트리 자료구조
- command 함수
- visible node selector
- breadcrumb selector

### 완료 기준

- 도메인 단위 테스트가 통과한다.
- UI 없이 편집 규칙 대부분을 검증할 수 있다.
- 경계 조건 테스트가 포함되어 있다.

## Phase 2: 로컬 UI 편집

### 목표

도메인 command를 React UI와 연결해 키보드 중심 편집 경험을 만든다.

### 먼저 작성할 테스트

- `Enter`가 새 노드를 만든다.
- `Tab`이 현재 노드를 들여쓴다.
- `Shift+Tab`이 현재 노드를 내어쓴다.
- 접힘 토글 후 자식 노드가 보이지 않는다.
- 브레드크럼 클릭으로 상위 노드로 이동한다.

### 구현 항목

- Outliner component
- node row component
- keyboard command mapping
- collapse toggle
- breadcrumb
- focus/selection 상태

### 완료 기준

- 키보드만으로 3뎁스 이상 작성 가능하다.
- 핵심 편집 흐름의 컴포넌트 테스트가 통과한다.
- Playwright에서 기본 편집 흐름이 통과한다.

## Phase 3: Lexical 통합

### 목표

텍스트 편집 경험을 Lexical로 옮기고, 도메인 command와 충돌 없이 연결한다.

### 먼저 작성할 테스트

- Lexical 입력이 노드 텍스트 상태로 반영된다.
- Enter command가 노드 split/create command를 호출한다.
- Tab command가 브라우저 포커스 이동 대신 indent command를 호출한다.
- `- `, `* `, `# ` 입력이 자동 리스트/헤딩 변환 없이 플레인 텍스트로 유지된다.

### 구현 항목

- Lexical editor setup
- Active row Lexical adapter 구현. 선택되지 않은 row는 plain text로 렌더링한다.
- markdown shortcut plugin은 MVP에서 연결하지 않는다.
- command bridge
- selection bridge

### 완료 기준

- Lexical 내부 구현에 과도하게 의존하지 않는 adapter 테스트가 있다.
- 텍스트 편집과 트리 command가 함께 동작한다.

## Phase 4: Yjs와 로컬 퍼시스턴스

### 목표

문서 상태를 Y.Doc에 저장하고, 새로고침 후 복원한다.

### 먼저 작성할 테스트

- Yjs update를 다른 doc에 적용하면 같은 outline 상태가 된다.
- 같은 update를 두 번 적용해도 결과가 깨지지 않는다.
- 로컬 저장 후 reload 시 문서가 복원된다.
- Undo가 노드 생성과 텍스트 변경을 되돌린다.
- Redo가 되돌린 변경을 다시 적용한다.

### 구현 항목

- Yjs adapter
- Lexical/Yjs binding
- y-indexeddb provider
- UndoManager
- app state persistence: zoom, collapsed metadata

### 완료 기준

- 새로고침 후 문서와 UI 상태가 복원된다.
- Yjs adapter 테스트가 통과한다.
- Undo/Redo 통합 테스트가 통과한다.

## Phase 5: 원격 동기화

### 목표

snapshot + updates 방식으로 여러 클라이언트 변경을 병합한다.

### 먼저 작성할 테스트

- 원격 snapshot을 로컬 doc에 적용한다.
- 원격 update log를 순서와 무관하게 적용한다.
- 중복 update를 받아도 상태가 중복되지 않는다.
- 오프라인 큐가 재연결 시 flush된다.
- 두 fake client의 동시 변경이 병합된다.

### 구현 항목

- remote store interface
- fake remote store
- Firebase adapter
- snapshot read/write
- updates append/listen
- sync status state machine
- offline queue

### 완료 기준

- Firebase 없이 sync 로직 대부분이 테스트된다.
- 두 브라우저 창에서 동시 편집이 병합된다.
- 오프라인 편집 후 재연결 동기화가 통과한다.

## Phase 6: 성능과 가상화

### 목표

대량 노드 문서에서 화면에 보이는 노드만 효율적으로 계산하고 렌더링한다.

### 먼저 작성할 테스트

- 10,000개 노드에서 visible node 계산이 제한 시간 안에 끝난다.
- 접힘 상태가 대량 fixture에서도 정확히 반영된다.
- 줌인 상태에서는 해당 subtree만 visible list에 포함된다.

### 구현 항목

- flatten selector 최적화
- 대량 fixture generator
- virtual list
- render profiling

### 완료 기준

- 10,000개 노드 fixture에서 사용 가능한 성능을 보인다.
- 입력 시 전체 트리를 불필요하게 재렌더링하지 않는다.

## Phase 7: 모바일 패키징

### 목표

Capacitor 앱으로 패키징하고 모바일 persistence 전략을 검증한다.

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
