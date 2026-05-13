# 결정 기록

Architecture Decision Record 형식으로 제품/기술 결정을 남긴다. 결정은 나중에 바뀔 수 있지만, 왜 그렇게 정했는지 기록해야 한다.

## ADR-001: Local-First를 기본 철학으로 한다

- 상태: 확정
- 결정: 앱은 로컬 데이터를 먼저 복원하고, 원격 동기화는 이후 비동기로 수행한다.
- 이유: 오프라인에서도 즉시 열리고 편집되는 경험이 제품 핵심이다.
- 영향: 원격 서버는 source of truth가 아니라 동기화 릴레이에 가깝다.

## ADR-002: TDD를 기본 개발 방식으로 한다

- 상태: 확정
- 결정: 모든 핵심 기능은 실패하는 테스트를 먼저 작성한다.
- 이유: 트리 조작, 동기화, 오프라인 큐는 회귀가 발생하기 쉬우며 테스트 가능한 설계가 중요하다.
- 영향: 도메인 로직은 UI/라이브러리에서 분리한다.

## ADR-003: 원격 동기화는 snapshot + updates 구조를 사용한다

- 상태: 확정
- 결정: 전체 문서 blob 하나를 덮어쓰지 않고 snapshot과 update log를 분리한다.
- 이유: 동시 편집 상황에서 마지막 쓰기 덮어쓰기 방식은 변경 유실 위험이 있다.
- 영향: update compaction과 cleanup 정책이 필요하다.

## ADR-004: 외부 라이브러리는 adapter로 격리한다

- 상태: 확정
- 결정: Lexical, Yjs, Firebase 직접 호출은 adapter 계층에 모은다.
- 이유: 테스트 가능성과 교체 가능성을 확보한다.
- 영향: UI 컴포넌트는 adapter 또는 command 인터페이스를 통해서만 상태를 변경한다.

## ADR-005: 원격 저장소 선택

- 상태: 확정
- 결정: Firebase Realtime Database를 사용한다.
- 이유: Dynalist 대안을 빠르게 만들기 위해 realtime subscription과 단순 update append를 우선한다.
- 영향: update log compaction과 보안 규칙은 Firebase RTDB 기준으로 설계한다.

## ADR-006: 모바일 persistence 전략

- 상태: 확정
- 결정: 모바일 앱 패키징과 모바일 persistence는 웹 MVP 이후로 분리한다.
- 이유: MVP의 핵심은 키보드 중심 웹 아웃라이너의 속도와 안정성이다.
- 영향: Phase 0~4는 웹과 IndexedDB를 우선하며, 모바일에서는 IndexedDB 유지와 SQLite 전환을 별도 검증한다.

## ADR-007: Lexical 모델링 방식

- 상태: 확정
- 결정: MVP는 active row에만 Lexical editor를 마운트하고, 선택되지 않은 row는 plain text로 렌더링한다.
- 이유: Lexical의 IME/selection 안정성과 향후 리치 포맷 확장성을 얻으면서, 노드마다 editor를 마운트하는 비용을 피한다.
- 영향: 도메인 outline tree가 행동의 기준이고, Lexical은 선택된 row의 텍스트 편집 adapter로 동작한다.
- 후속 검증: 리치텍스트 단계에서 custom node 또는 `@lexical/yjs` 중심 구조가 필요한지 다시 평가한다.

## ADR-008: MVP는 플레인 텍스트와 키보드 속도를 우선한다

- 상태: 확정
- 결정: MVP 텍스트는 플레인 텍스트 중심으로 구현하고, 리치텍스트/마크다운 자동 변환/TODO 노드는 제외한다.
- 이유: Dynalist 대안의 핵심은 빠른 입력, 들여쓰기, 접기, 줌인이다.
- 영향: Phase 1~2는 트리 조작과 키보드 UX에 집중하고, 리치텍스트는 후속 옵션으로 둔다.

## ADR-009: 협업 범위는 개인 다기기 동기화로 제한한다

- 상태: 확정
- 결정: MVP 동기화는 같은 사용자의 여러 기기 병합을 목표로 하며, 다중 사용자 공동편집과 공유 권한은 제외한다.
- 이유: 협업 권한 모델은 MVP 속도를 늦추며 Dynalist 대안의 개인 지식관리 흐름과 분리 가능하다.
- 영향: 서버 모델은 사용자별 단일 workspace를 기준으로 단순화한다.

## ADR-010: 자식 있는 빈 노드 Backspace는 자식을 승격한다

- 상태: 확정
- 결정: 자식이 있는 빈 노드에서 `Backspace`를 누르면 빈 부모를 제거하고 자식들을 같은 레벨로 승격한다.
- 이유: 키보드 중심 편집에서 구조를 빠르게 정리하되 데이터 삭제 위험을 피한다.
- 영향: `removeEmptyParentAndPromoteChildren` 계열 도메인 테스트가 필요하다.

## ADR-011: Dynalist식 벌크 편집을 MVP 핵심 범위에 포함한다

- 상태: 확정
- 결정: 멀티라인 붙여넣기, 다중 visible range 선택, 선택 범위 일괄 들여쓰기/내어쓰기/삭제/접기, clipboard round-trip을 MVP 핵심 범위에 포함한다.
- 이유: Dynalist 대안에서 속도는 단일 노드 편집만으로 부족하다. 사용자는 외부 텍스트와 기존 outline을 빠르게 가져오고, 여러 노드를 키보드로 한 번에 구조화할 수 있어야 한다.
- 영향: 기본 키보드 편집과 Lexical active row 통합 이후, persistence/Yjs 동기화 전에 bulk domain command와 UI selection state를 구현한다.
- 제약: 벌크 편집은 현재 visible node list 기준으로 동작하며, 접힌 subtree 내부 노드는 범위 선택에 포함하지 않는다.
