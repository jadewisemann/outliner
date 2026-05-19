# 2. 테스트 피라미드

### 현재 통과 중인 영역

- 앱 첫 화면 smoke E2E
- outline domain command
- bulk outline command
- React Outliner component command mapping
- IndexedDB 기반 local persistence snapshot 복원
- Yjs snapshot encode/apply/idempotency 기초
- sync queue 기초 상태 전이
- FakeRemoteStore를 통한 remote snapshot/update pull-push, duplicate idempotency, offline queue flush, subscribe update, two-client merge
- Yjs-backed app runtime과 RemoteStore 통합: local-only fallback, remote pull, local push, offline status, shared fake remote two-runtime sync
- Firebase config가 있어도 명시적 `?remote=firebase` 없이는 remote adapter를 만들지 않는 opt-in guard
- 벌크 편집 E2E: indented paste, range indent, range delete
- 키보드 파워 편집 도메인/컴포넌트/E2E: node/range move, parent-boundary move, multi cursor editing

### 다음 테스트 우선순위

1. Remote sync 비용 안정화: Firebase opt-in guard, update batching, payload size guard, compaction cleanup, byte metering
2. OPML import/export round-trip
3. 50,000 node 병목 profiling
4. render profiling 기준 문서화
5. 히스토리/설정 E2E smoke
6. 히스토리와 preference store 테스트
7. 모바일 persistence adapter 계약 테스트

### 단위 테스트

가장 많이 작성한다. 빠르고 결정적이어야 한다.

대상:

- outline tree command
- bulk outline command
- indentation paste parser
- clipboard serializer
- visible node selector
- breadcrumb selector
- export serializer
- search selector
- tag/internal link parser
- backlink selector
- OPML parser/serializer
- preference reducer/store
- sync queue state machine
- Yjs helper encode/decode wrapper

### 통합 테스트

외부 라이브러리와 우리 adapter의 경계를 검증한다.

대상:

- React component + domain command
- Lexical adapter
- Yjs adapter
- IndexedDB persistence
- fake remote store sync
- remote byte metering and compaction cleanup

### E2E 테스트

핵심 사용자 흐름만 검증한다. 너무 많은 케이스를 E2E로 몰지 않는다.
sync 세부 병합, update 중복 처리, queue 상태 전이는 단위/통합 테스트 중심으로 검증하고, E2E는 사용자가 관찰할 수 있는 최종 흐름만 남긴다.

대상:

- 첫 화면 진입
- 노드 작성/들여쓰기/접기/줌인
- 멀티라인 붙여넣기와 다중 노드 일괄 편집
- 새로고침 복원
- 두 브라우저 컨텍스트 동시 편집
- 오프라인 후 재연결 동기화
