# 개발 단계 개요

모든 Phase는 TDD로 진행한다. 각 기능은 실패하는 테스트를 먼저 만들고, 최소 구현으로 통과시킨 뒤, 리팩터링한다.

현재 구현 상태는 Phase 0~14까지 완료다. Phase 8은 Firebase-backed 원격 sync smoke 실환경 검증까지 완료되었고, Phase 9 검색/필터, Phase 10 태그/내부 링크/백링크, Phase 11 리치 포맷과 노트는 selector/metadata 기반 v1으로 완료되었다. Phase 12에서는 Firebase 사용량 급증 원인이던 snapshot 기반 append-log를 제거하고 `RemoteStoreV2` snapshot-primary sync로 전환한 뒤, optional patch capability를 추가해 큰 문서의 작은 편집이 full snapshot write/read로 반복 증폭되지 않게 했다. Phase 13에서는 OPML과 indentation plain text import/export, visible-only export, 전체 교체/root 병합/선택 노드 하위 삽입 import 정책을 추가했다. Phase 14에서는 로컬 snapshot history/restore, manual backup export, 문서와 분리된 preferences/keymap/settings UI를 추가했다.

현재 Phase 15 웹 버전 고도화와 파워 유저 기능, Phase 15.5 아웃라이닝 앱 폴리시와 타입라이터 스크롤까지 완료된 상태다. 다음 순서는 Phase 16 데스크톱 앱과 계정 기능, Phase 17 모바일 패키징이다. 모바일은 웹 버전의 편집 경험과 설정 체계가 충분히 견고해진 뒤 진행한다.
