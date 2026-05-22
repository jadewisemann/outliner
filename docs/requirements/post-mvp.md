# 2.1 MVC 이후 제품화 후보

Stage 0 MVC 이후에는 Dynalist 격차 축소가 아니라 Obsidian식 다중 문서 outliner 제품화로 방향을 전환한다. 이미 완료된 Phase 9~15.5는 단일 문서 MVC 기능으로 유지하고, 다음 우선순위는 Stage 단위로 관리한다.

## Stage 1 Product Core

1. 다중 문서 워크스페이스
   - `Workspace -> Documents -> Nodes` 모델을 도입한다.
   - 기존 단일 문서 데이터는 single-document workspace로 자동 승격한다.
   - 문서 생성, 전환, rename, delete, recent documents를 제공한다.
2. Obsidian식 링크와 전역 탐색
   - `[[Document]]`는 문서 링크로, `[[Document^Node]]`는 문서 내부 노드 링크로 해석한다.
   - 없는 문서는 picker의 명시적 create action으로 만든다.
   - 문서 backlinks와 block backlinks를 분리한다.
   - command palette는 문서와 노드를 함께 검색한다.

## Stage 2 Distribution

3. 데스크톱 앱, 계정, sync 제품화
   - 다중 문서 workspace 모델이 안정된 뒤 desktop packaging과 account flow를 붙인다.
   - remote sync는 workspace manifest와 per-document snapshot/patch 구조를 검토한다.

## Stage 3 Future Expansion

4. 모바일 패키징과 고급 확장
   - 모바일 persistence, 작은 화면 link picker, graph view, aliases, transclusion, attachments는 추후 확장으로 둔다.
   - 공유/협업과 태스크 관리 기능은 계속 제품 핵심에서 제외한다.

## 완료된 Stage 0 기능 기록

Stage 0에서 Dynalist와의 기능 차이는 아래 순서로 줄였다.

1. 검색과 필터
   - 현재 zoom root 안에서 빠르게 텍스트를 찾는다.
   - 접힌 subtree 안의 match를 발견하고, 사용자가 결과로 이동하면 필요한 조상 노드를 펼친다.
   - 검색 결과는 outline 문맥 보기와 flat 결과 보기를 모두 검토한다.
   - 초기 버전은 인메모리 선형 검색으로 구현하고, 대량 문서에서 병목이 확인될 때 인덱싱을 도입한다.
2. 태그, 내부 링크, 백링크
   - `#tag`, `@tag`를 텍스트 토큰으로 인식하고 tag filter와 tag list를 제공한다.
   - `[[...]]` 입력으로 같은 workspace 안의 노드 링크를 삽입한다.
   - 노드 id 기반 internal link를 저장해 rename 또는 text 변경에도 링크가 깨지지 않게 한다.
   - 링크된 노드의 참조 목록을 볼 수 있게 한다.
3. 리치 포맷과 노트
   - Markdown-like source를 유지하되 inactive row에서는 bold, italic, inline code, strikethrough, link, image link preview, LaTeX 표시를 단계적으로 지원한다.
   - heading, color label은 노드 속성으로 분리해 구조 편집과 충돌하지 않게 한다. numbered list는 현재 제품 범위에서 제외한다.
   - 본문 `text`와 별도 `note` 필드를 추가해 아이템 설명을 접거나 보일 수 있게 한다.
   - TODO list와 date 계열은 리치 포맷 단계에서도 제외한다. 단, `[]`/`[*]`로 시작하는 텍스트는 source marker 기반 완료 상태로만 표시/토글할 수 있다.
   - code block 내부 전용 줄바꿈 편집 기능은 제외한다. 코드 표시는 source text 보존과 inactive row 렌더링에 머문다.
4. 원격 sync 비용 안정화
   - Firebase 원격 sync는 명시적 opt-in으로만 활성화한다.
   - 정상적인 텍스트 입력이 매 keypress마다 전체 문서 update를 원격에 append하지 않게 batching/debounce한다. - 완료됨
   - `RemoteStoreV2`는 최신 snapshot 1개를 primary artifact로 저장해 update log 저장량 폭증을 막는다. - 완료됨
   - 같은 version의 다른 client write는 conflict로 처리하고, 밀려난 local snapshot은 conflict backup에 보존한다. - 완료됨
   - 원격 payload size guard와 encoded read/write byte metering 테스트를 둔다. - 완료됨
   - 개인 다기기 동기화가 목표이므로 realtime subscription을 필수 요구사항으로 두지 않는다.
   - 큰 문서에서 작은 편집이 발생할 때 전체 snapshot을 반복 전송하지 않도록 `RemoteStoreV2` optional patch capability를 추가했다. - 완료됨
5. 가져오기/내보내기 확장
   - 현재 JSON/Markdown export에 더해 OPML export/import를 지원한다. - 완료됨
   - indentation plain text import/export를 명시적 메뉴로 제공한다. - 완료됨
   - visible items only export 옵션을 추가한다. - 완료됨
   - import는 기존 workspace에 붙여넣기, 새 root 하위로 병합, 전체 교체를 구분한다. - 완료됨
6. 히스토리와 백업
   - 로컬 snapshot history를 저장해 특정 시점으로 복원할 수 있게 한다.
   - 수동 백업 파일 다운로드와 자동 백업 정책을 제공한다.
   - 원격 update log compaction과 snapshot history 보존 정책을 함께 설계한다.
7. 사용자 설정과 접근성
   - 키보드 shortcut 커스터마이즈를 command registry 기반으로 제공한다.
   - theme, font size, spellcheck, word count, auto-focus, bullet click 동작 같은 개인 설정을 저장한다.
   - 설정은 문서 데이터와 분리된 local/user preference로 저장한다.
   - bullet click 금지 설정을 제공한다. 이 설정이 켜지면 bullet은 클릭 대상이 아니며, 노드 row 왼쪽에 전체 메뉴 버튼과 `깊이 들어가기`, `완료로 표시` 퀵 버튼을 모두 노출한다.
