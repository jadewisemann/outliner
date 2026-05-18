# 개발 단계

모든 Phase는 TDD로 진행한다. 각 기능은 실패하는 테스트를 먼저 만들고, 최소 구현으로 통과시킨 뒤, 리팩터링한다.

현재 구현 상태는 Phase 0~11 완료다. Phase 8은 Firebase-backed 원격 sync smoke 실환경 검증까지 완료되었고, Phase 9 검색/필터, Phase 10 태그/내부 링크/백링크, Phase 11 리치 포맷과 노트는 selector/metadata 기반 v1으로 완료되었다. Phase 12 착수 전 active row의 한글 IME 입력 안정성 blocker를 수정해 composition 중 editor remount와 구조 키 interception 회귀 테스트를 추가했다. 또한 Firebase 사용량 급증 원인이 확인되어 import/export보다 원격 sync 비용 안정화를 먼저 진행한다. 이후 Dynalist와의 기능 차이는 파일/폴더/다중 문서, 태스크 관리, 공유/협업을 제외하고 원격 sync 비용 안정화, import/export, 히스토리/설정 순서로 줄인다.

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

## Phase 5: Yjs 런타임 통합과 Undo/Redo - 완료됨

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

## Phase 6: 개인 다기기 원격 동기화 - 완료됨

### 목표

snapshot + updates 방식으로 같은 사용자의 여러 브라우저/기기 변경을 병합한다. Firebase 연결보다 FakeRemoteStore 기반 통합 테스트를 먼저 완성한다.

### 완료된 산출물

- `RemoteStore` contract 기반 remote sync orchestration
- remote snapshot pull과 update log pull/push
- duplicate update applied id 관리
- append 실패 시 offline queue 유지와 재시도 flush
- subscribe 기반 remote update 반영
- snapshot 기반 two-client merge helper
- `useOutlineWorkspace`와 `App`의 optional `remoteStore` 연결
- runtime `syncStatus` badge 연결
- 명시적 `?remote=firebase` 설정 기반 optional adapter 생성
- Firebase 설정이 있더라도 명시적 remote mode가 없을 때 `local-only` fallback

### 완료된 테스트

- remote snapshot을 local Yjs workspace에 적용한다.
- remote update log를 수신 순서와 무관하게 적용한다.
- 같은 update를 여러 번 받아도 상태가 중복되지 않는다.
- append 실패 시 update가 offline queue에 남는다.
- 재연결 시 pending update가 flush되고 status가 `synced`가 된다.
- 두 fake client가 동시에 편집한 변경이 충돌 복사본 없이 병합된다.
- shared fake remote store를 통해 두 app runtime이 변경을 주고받는다.

### 구현 메모

- `RemoteStore` contract를 기준으로 sync orchestration을 앱에서 사용할 수 있게 정리한다.
- FakeRemoteStore 통합 테스트를 Firebase adapter 테스트보다 먼저 확장했다.
- Firebase configuration은 선택적 런타임 설정으로 둔다. 설정이 있어도 명시적 `?remote=firebase` 없이는 `local-only`로 동작한다.
- local Yjs update는 runtime client id와 client-local seq를 사용해 `${clientId}:${seq}` update id로 append한다.
- subscribe로 받은 remote update는 applied id set을 통해 중복 적용을 방지한다.
- offline queue flush와 sync status badge를 앱 상태에 연결한다.

### 완료 기준

- Firebase 없이 sync 로직 대부분이 테스트된다.
- 두 fake client의 동시 편집이 병합된다.
- 오프라인 편집 후 재연결 동기화가 통과한다.
- Firebase 설정이 있거나 없어도 명시적 remote mode 없이는 local-only MVP가 깨지지 않는다.

## Phase 7: 키보드 파워 편집 - 완료됨

### 목표

키보드 기반 아웃라이너로서 구조 편집의 속도를 높인다. `Alt+ArrowUp/Down` 노드 이동, 선택 범위 이동, 멀티 커서 생성을 domain command와 UI shortcut으로 연결한다.

### 먼저 작성할 테스트

- 현재 노드를 `Alt+ArrowUp`으로 이전 형제 앞으로 이동한다.
- 현재 노드를 `Alt+ArrowDown`으로 다음 형제 뒤로 이동한다.
- 노드 이동은 같은 부모 안의 이전/다음 sibling block과 교환한다.
- 첫 자식/마지막 자식 경계에서는 이전/다음 부모 sibling의 자식으로 이동하거나 현재 부모 앞/뒤로 outdent한다.
- Root 레벨의 첫 visible 노드를 위로 이동하거나 마지막 visible 노드를 아래로 이동하면 no-op이다.
- 접힌 부모 노드를 이동하면 hidden descendants가 함께 이동한다.
- 선택된 visible range를 `Alt+ArrowUp/Down`으로 순서를 유지해 이동한다.
- 이동 후 선택 anchor/focus가 유지된다.
- `Mod+Alt+ArrowUp/Down`으로 위아래 visible row에 보조 커서를 추가한다.
- 멀티 커서 상태에서 텍스트 입력, `Backspace`, `Delete`가 모든 커서 위치에 적용된다.
- 멀티 커서 상태에서 `Escape`가 보조 커서를 정리한다.

### 구현 항목

- `moveNodeUp`, `moveNodeDown`
- `bulkMoveNodesUp`, `bulkMoveNodesDown`
- `OutlineCursor`와 multi cursor view state
- Lexical active row command bridge 확장
- 보조 커서 row overlay와 focus 유지
- Undo/Redo transaction grouping
- keyboard power editing E2E

### 완료된 검증

- `npm run typecheck` 통과
- `npm run test` 통과: 80 tests
- `npm run test:e2e` 통과: 10 Playwright tests

### 완료 기준

- 마우스 없이 노드 작성, depth 변경, 접기/펼치기, 순서 이동, 범위 이동이 가능하다.
- 멀티 커서로 여러 row에 같은 텍스트 편집을 적용할 수 있다.
- 모든 파워 편집 명령이 도메인 테스트와 컴포넌트 shortcut 테스트를 가진다.
- Undo/Redo가 노드 이동과 멀티 커서 편집을 사용자 action 단위로 되돌린다.

## Phase 8: 성능과 가상화 - 완료됨

### 목표

대량 노드 문서에서 화면에 보이는 노드만 효율적으로 계산하고 렌더링한다. active row만 Lexical을 마운트한다는 원칙은 유지한다.

### 먼저 작성할 테스트

- 10,000개 노드 fixture에서 visible node 계산이 제한 시간 안에 끝난다. - 완료됨
- 접힘 상태가 대량 fixture에서도 정확히 반영된다. - 완료됨
- 줌인 상태에서는 해당 subtree만 visible list에 포함된다. - 완료됨
- typing 중 active row 외 전체 row가 불필요하게 다시 렌더링되지 않는다. - 완료됨

### 구현 항목

- 대량 outline fixture generator - 완료됨
- visible node selector traversal 안정화 - 완료됨
- virtual list 적용 - 기본 렌더링 완료
- active row Lexical mount count 검증 - 완료됨
- browser-backed remote sync E2E - 완료됨
- Firebase-backed remote sync smoke - 완료됨
- render profiling 기준 정리 - 완료됨

### 완료 기준

- 10,000개 노드 fixture에서 사용 가능한 성능을 보인다.
- 입력 시 전체 트리를 불필요하게 재렌더링하지 않는다.
- 50,000개 노드 목표를 막는 구조적 병목은 원격 sync 비용 안정화와 import/export 이후 profiling에서 재평가한다.

## Phase 9: 검색과 필터 - 완료됨

### 목표

단일 workspace 안에서 텍스트를 빠르게 찾고, 검색 결과를 outline 문맥 또는 flat 목록으로 탐색한다. 파일/문서 전체 검색은 제품 범위가 아니며, 현재 root workspace 안의 노드 검색만 다룬다.

### 먼저 작성할 테스트

- 현재 zoom root 안에서 text substring이 포함된 노드를 찾는다. - 완료됨
- 접힌 subtree 내부의 match도 검색 결과에는 포함된다. - 완료됨
- 검색 결과로 이동하면 해당 노드가 선택되고 필요한 조상 collapse 상태가 해제된다. - 완료됨
- flat search view에서는 match node만 순서대로 표시하되, 원래 depth와 breadcrumb context를 유지한다. - 완료됨
- 10,000개 노드에서 기본 검색이 사용 가능한 시간 안에 끝난다. - 완료됨

### 구현 항목

- `searchOutline(document, query, options)` selector - 완료됨
- search UI와 query state - 완료됨
- result navigation: next/previous match - 완료됨
- outline context view와 flat result view - 완료됨
- collapsed ancestor reveal command - 완료됨
- 검색 성능 기준과 인덱싱 도입 조건 문서화 - 완료됨

### 완료 기준

- 사용자가 키보드로 검색을 열고 결과 사이를 이동할 수 있다.
- 접힌 항목 내부 텍스트도 잃지 않고 찾을 수 있다.
- 검색 상태는 편집 command, 줌인, Undo/Redo와 충돌하지 않는다.

## Phase 10: 태그, 내부 링크, 백링크 - 완료됨

### 목표

플레인 텍스트 기반 작성 속도를 유지하면서 `#tag`, `@tag`, `[[internal link]]`를 인식해 지식관리 탐색성을 높인다. 태그와 링크는 태스크 기능이 아니며 due date, checkbox, collaborator mention과 연결하지 않는다.

### 먼저 작성할 테스트

- 노드 텍스트에서 `#tag`와 `@tag` 토큰을 추출한다. - 완료됨
- tag filter가 해당 태그를 포함한 노드만 찾는다. - 완료됨
- `[[...]]` 링크 삽입 후보가 같은 workspace의 노드에서 검색된다. - 완료됨
- internal link는 node id를 대상으로 저장되어 대상 노드 text가 바뀌어도 깨지지 않는다. - 완료됨
- 특정 노드의 backlinks를 계산한다. - 완료됨
- 삭제된 노드를 가리키는 링크는 broken link 상태로 표시된다. - 완료됨

### 구현 항목

- tag/link parser와 selector - 완료됨
- node id 기반 link metadata - 완료됨
- tag list/tag filter UI - 완료됨
- internal link autocomplete UI - 완료됨
- backlink panel 또는 inline reference section - 완료됨
- broken link 표시와 selector - 완료됨

### 완료 기준

- 태그로 관련 노드를 빠르게 모아볼 수 있다.
- 다른 노드로 향하는 링크를 키보드 중심으로 삽입하고 이동할 수 있다.
- backlinks가 local-first 저장, sync, export에 포함된다.

## Phase 11: 리치 포맷과 노트 - 완료됨

### 목표

작성 중에는 Markdown-like source를 유지하고, inactive row에서는 읽기 좋은 렌더링을 제공한다. TODO/checkbox, date, recurring date, calendar sync는 이 Phase에서도 제외한다.

### 먼저 작성할 테스트

- inactive row가 bold, italic, inline code, strikethrough, link를 렌더링한다. - 완료됨
- active row는 원본 Markdown-like source를 편집한다. - 완료됨
- heading, color label, numbered list 속성이 노드 단위로 저장되고 export에 반영된다. - 완료됨
- note 필드가 node text와 별도로 저장되고 접기/펼치기 표시 상태를 가진다. - 완료됨
- 리치 포맷이 indent/outdent, move, bulk selection, paste와 충돌하지 않는다. - 완료됨

### 구현 항목

- `OutlineNode` metadata 확장: `note`, `noteVisible`, `heading`, `color`, `numbered` - 완료됨
- Markdown-like inline renderer - 완료됨
- link/image link preview 전략 - 기본 링크 렌더링 완료
- LaTeX 렌더링 adapter 검토 - 후속 확장으로 보류
- note editor와 note visibility setting - 완료됨
- Lexical custom node 또는 row-level renderer 유지 여부 재평가 - row-level renderer 유지

### 완료 기준

- 리치 표시가 구조 편집의 속도와 키보드 흐름을 해치지 않는다.
- 저장 모델이 plain text MVP 데이터를 migration 없이 읽을 수 있다.
- formatting command는 Undo/Redo와 sync에 하나의 사용자 action으로 기록된다.

## Phase 12: 원격 sync 비용 안정화

### 목표

현재 snapshot 기반 update append 구조가 정상 사용량보다 큰 Firebase read/write를 만들 수 있음을 명시하고, 원격 sync가 dev와 실제 사용 환경에서 비용 상한을 넘지 않게 재설계한다. 이 Phase가 끝나기 전까지 Firebase sync는 명시적 opt-in 상태로 유지하며, import/export 확장보다 우선한다.

Phase 12는 두 단계로 나눈다.

- Phase 12-A 단기 안정화: 기존 RTDB adapter에서 즉시 비용 누수를 막는다.
- Phase 12-B 중기 재설계: 개인 다기기 sync에 맞는 저비용 `RemoteStore` v2와 저장소 후보를 결정한다.

제품 범위는 다중 사용자 공동편집이 아니라 개인 다기기 동기화다. 따라서 realtime subscription은 있으면 좋은 구현 옵션이지 필수 요구사항이 아니다. 기본 목표는 local-first 동작을 유지하면서 작은 payload, bounded log, 예측 가능한 비용으로 여러 기기를 맞추는 것이다.

### 먼저 작성할 테스트

- Firebase configuration이 있어도 `?remote=firebase` 없이는 remote adapter를 만들지 않는다. - 완료됨
- 로컬 텍스트 입력 여러 번이 원격 append 여러 번으로 즉시 증폭되지 않고 debounce/batch된다.
- 단일 update payload가 정해진 byte budget을 넘으면 append하지 않고 `error` 또는 `offline` 상태로 전환한다.
- snapshot compaction 후 오래된 update log를 정리해 새 클라이언트가 전체 누적 로그를 다시 읽지 않는다.
- 앱 시작 시 remote pull이 snapshot 이후 필요한 update만 읽고, 이미 compact된 update를 다시 받지 않는다.
- sync 비용 회귀를 잡기 위해 fake remote store가 read/write byte count를 기록한다.
- RTDB adapter가 `updates` 전체 tree를 읽지 않고 cursor 이후 update만 읽는다.
- RTDB subscribe가 과거 log 전체를 새 이벤트처럼 다시 처리하지 않는다.
- RemoteStore v2 fake adapter가 realtime subscription 없이 앱 시작/포커스 복귀 sync를 통과한다.
- 10분 입력 시뮬레이션에서 write bytes/read bytes/stored bytes가 문서 크기에 비례하는 상한 안에 머문다.

### Phase 12-A 구현 항목

- Firebase remote mode는 명시적 `?remote=firebase` opt-in 유지
- remote update debounce/batching
- update payload size guard와 사용자에게 보이는 sync error 상태
- snapshot compaction trigger와 update log cleanup contract
- `RemoteStore` read/write byte accounting test helper
- Firebase adapter cursor query 적용
- subscribe start cursor 적용
- Firebase emulator 또는 fake metering 기반 비용 회귀 테스트
- 비용 guard 실패 시 로컬 저장은 계속 성공하고 remote status만 `error`로 표시

### Phase 12-B 구현 항목

- `RemoteStore` v2 contract 초안 작성
  - 최신 compacted snapshot 읽기/쓰기
  - snapshot version 또는 cursor
  - 제한된 change log 읽기/쓰기
  - 선택적 realtime subscribe
  - byte metering hook
- 저장소 후보별 비용/복잡도 비교 문서 작성
  - Firebase RTDB: realtime은 쉽지만 bandwidth와 listener 비용 관리가 필요하다.
  - Firestore: document 단위 read/write 과금이라 update log를 작게 쪼갤 수 있지만 listener/read 비용과 index overhead를 관리해야 한다.
  - Supabase/Postgres 또는 서버 API: query와 compaction 제어가 쉽지만 auth/API 운영이 필요하다.
  - Object storage 기반 snapshot/blob: 개인 sync에는 가장 정적이고 저렴할 수 있지만 충돌 병합과 auth URL 설계가 필요하다.
- 기본 후보를 정적 snapshot/blob 중심 저장소로 둘지 결정
- 현재 RTDB adapter를 유지, 축소, 제거 중 하나로 결정
- Phase 13 이후 import/export/history가 저장소 구현에 직접 의존하지 않도록 경계 재확인

### 완료 기준

- 일반 dev 실행은 Firebase env가 있어도 `local-only`이며, 실수로 원격 비용을 발생시키지 않는다.
- 정상적인 텍스트 입력이 매 keypress마다 전체 문서 update를 Firebase에 append하지 않는다.
- 누적 update log가 무한히 커지지 않고 compact/cleanup된다.
- 새 클라이언트가 동기화할 때 과거 전체 로그를 반복 read하지 않는다.
- 10분 입력 테스트가 GB 단위 사용량으로 증폭되지 않는다.
- 원격 sync 비용 모델과 한계가 문서화되어 Phase 13 이후 기능이 안전하게 원격 데이터를 다룰 수 있다.
- 중기 저장소 방향이 결정되어 RTDB를 계속 쓸지, 정적/저비용 저장소로 바꿀지 다음 구현 Phase로 넘길 수 있다.

## Phase 13: 가져오기/내보내기 확장

### 목표

현재 JSON/Markdown export를 보완해 OPML과 indentation plain text round-trip을 지원한다. Dynalist에서 데이터를 가져오거나 다른 outliner로 나갈 수 있는 통로를 만든다.

### 먼저 작성할 테스트

- OPML export가 outline hierarchy를 보존한다.
- OPML import가 hierarchy, note, collapsed, formatting metadata 중 지원 가능한 필드를 복원한다.
- indentation plain text import/export가 depth를 보존한다.
- visible items only export가 접힌 subtree와 검색 필터 결과를 제외한다.
- invalid import input은 기존 workspace를 훼손하지 않고 오류를 반환한다.

### 구현 항목

- OPML parser/serializer
- import preview와 conflict 정책
- 전체 교체, root 하위 병합, 현재 노드 아래 삽입 모드
- visible-only export 옵션
- export/import E2E

### 완료 기준

- 사용자가 주요 outliner 형식으로 데이터를 안전하게 가져오고 내보낼 수 있다.
- import 실패가 기존 로컬 데이터와 sync queue를 손상시키지 않는다.

## Phase 14: 히스토리, 백업, 설정

### 목표

개인 로컬 우선 앱으로서 장기 사용 안정성을 높인다. 협업 권한, public share, 서버 사이드 비즈니스 로직은 포함하지 않는다.

### 먼저 작성할 테스트

- 일정 간격 또는 의미 있는 edit transaction마다 local snapshot history가 저장된다.
- 사용자가 이전 snapshot을 미리 보고 현재 workspace로 복원할 수 있다.
- 수동 백업 파일이 현재 workspace와 view/preference 중 필요한 데이터를 포함한다.
- shortcut/theme/font/spellcheck/word count 설정이 document와 분리되어 저장된다.
- 설정 변경은 outline Undo/Redo stack에 들어가지 않는다.

### 구현 항목

- snapshot history store
- restore preview와 restore transaction
- manual backup export
- remote snapshot/update compaction 정책
- preference store와 command registry
- keymap customization UI
- theme/font/spellcheck/word count/auto-focus settings

### 완료 기준

- 실수나 sync 문제 발생 시 사용자가 과거 상태로 되돌아갈 수 있다.
- 개인 설정이 문서 데이터와 분리되어 sync/export 정책을 명확히 가진다.

## Phase 15: 모바일 패키징 - 웹 MVP 이후

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
