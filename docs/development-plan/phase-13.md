# Phase 13: 가져오기/내보내기 확장

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
