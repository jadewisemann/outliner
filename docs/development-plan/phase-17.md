# Phase 17: 모바일 패키징 - 웹/데스크톱 이후

### 목표

Capacitor 앱으로 패키징하고 모바일 persistence 전략을 검증한다. 이 Phase는 웹 버전 고도화와 데스크톱/계정 기능 이후에 진행한다.

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
