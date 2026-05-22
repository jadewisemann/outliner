# 2. MVP 범위

### 포함

- 단일 Root 워크스페이스
- 노드 기반 무한 뎁스 아웃라인
- 키보드 중심 편집
- Dynalist식 벌크 편집: 멀티라인 붙여넣기, 다중 노드 선택, 일괄 들여쓰기/내어쓰기/삭제/접기
- 키보드 파워 편집: 노드 순서 이동, 범위 이동, 멀티 커서 입력
- 들여쓰기/내어쓰기
- 접기/펼치기
- 줌인/브레드크럼 탐색
- 로컬 저장과 새로고침 복원
- Yjs 기반 Undo/Redo
- 여러 브라우저 창 기준 동시 편집 병합
- JSON 내보내기
- Markdown 내보내기

### MVP 제외

- 파일/폴더 시스템
- 다중 문서
- 공유 문서와 권한 관리
- 댓글, 멘션, 알림
- 이미지/첨부파일
- E2EE
- 서버 사이드 비즈니스 로직
- 고급 검색 인덱싱
- 모바일 앱 패키징
- 리치텍스트/마크다운 자동 변환
- TODO list와 checkbox task 노드. 단, `[]`/`[*]` source marker로 시작하는 노드를 lightweight 완료 상태로 표시/토글하는 것은 허용한다.
- code block 내부 전용 줄바꿈 편집기

### 제품 방향상 제외

- Stage 0 MVC에서는 Dynalist식 파일/폴더/다중 문서 시스템을 만들지 않는다.
- Stage 1 Product Core에서는 Obsidian식 다중 문서 workspace를 도입한다. 단, 전통적인 파일/폴더 pane을 먼저 만들지 않고 `Workspace -> Documents -> Nodes` 모델과 `[[Document]]`, `[[Document^Node]]` 링크 경험을 우선한다.
- 태스크 관리 기능은 제품 핵심에서 제외한다. TODO list, due date, recurring date, calendar sync, overdue highlight는 구현하지 않는다. `[]`/`[*]`는 source text 기반 완료 표시 예외로만 다룬다.
- 공유와 협업 기능은 제외한다. 개인 다기기 동기화는 유지하지만, public share, collaborator, 권한 모델, 댓글/알림은 만들지 않는다.
