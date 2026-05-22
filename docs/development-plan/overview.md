# 개발 단계 개요

모든 Phase는 TDD로 진행한다. 각 기능은 실패하는 테스트를 먼저 만들고, 최소 구현으로 통과시킨 뒤, 리팩터링한다.

현재 구현 상태는 Stage 0, 즉 단일 문서 MVC 아웃라이너 완성 단계까지 완료된 것으로 본다. Phase 8은 Firebase-backed 원격 sync smoke 실환경 검증까지 완료되었고, Phase 9 검색/필터, Phase 10 태그/내부 링크/백링크, Phase 11 리치 포맷과 노트는 selector/metadata 기반 v1으로 완료되었다. Phase 12에서는 Firebase 사용량 급증 원인이던 snapshot 기반 append-log를 제거하고 `RemoteStoreV2` snapshot-primary sync로 전환한 뒤, optional patch capability를 추가해 큰 문서의 작은 편집이 full snapshot write/read로 반복 증폭되지 않게 했다. Phase 13에서는 OPML과 indentation plain text import/export, visible-only export, 전체 교체/root 병합/선택 노드 하위 삽입 import 정책을 추가했다. Phase 14에서는 로컬 snapshot history/restore, manual backup export, 문서와 분리된 preferences/keymap/settings UI를 추가했다.

Phase 15 웹 버전 고도화와 파워 유저 기능, Phase 15.5 아웃라이닝 앱 폴리시와 타입라이터 스크롤까지 완료된 상태다. 이 지점까지를 MVC 완료로 닫고, 다음은 Stage 1 Product Core로 진입한다.

Stage 1의 목표는 단일 문서 아웃라이너를 Obsidian식 다중 문서 워크스페이스로 확장하는 것이다. 핵심 제품 모델은 `Workspace -> Documents -> Nodes`이며, 일반 `[[Document]]` 링크는 문서를, `[[Document^Node]]` 링크는 문서 내부 노드를 대상으로 한다. 사용자는 제목으로 링크하지만 시스템은 stable id로 저장하고, picker는 생성/해결/중복/깨짐 상태를 명시한다.

데스크톱 앱, 계정, sync 제품화는 Stage 2로 미룬다. 모바일 패키징, graph view 고도화, alias/transclusion, attachment vault, 공유/협업 같은 기능은 Stage 3 이후 추후 확장으로 둔다.
