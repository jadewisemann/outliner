# 개발 단계 개요

모든 Phase는 TDD로 진행한다. 각 기능은 실패하는 테스트를 먼저 만들고, 최소 구현으로 통과시킨 뒤, 리팩터링한다.

현재 구현 상태는 Phase 0~12-B까지 완료다. Phase 8은 Firebase-backed 원격 sync smoke 실환경 검증까지 완료되었고, Phase 9 검색/필터, Phase 10 태그/내부 링크/백링크, Phase 11 리치 포맷과 노트는 selector/metadata 기반 v1으로 완료되었다. Phase 12에서는 Firebase 사용량 급증 원인이던 snapshot 기반 append-log를 제거하고 `RemoteStoreV2` snapshot-primary sync로 전환했다. v2는 저장량과 과거 로그 read 폭증을 막지만, 큰 문서에서 작은 편집마다 전체 snapshot을 write/read하는 bandwidth 비용은 아직 남아 있다. 따라서 다음 최우선 과제는 import/export가 아니라 full-snapshot bandwidth 비용을 줄이는 Phase 12-C다.
