# 2.1 MVP 이후 기능 후보

MVP 이후 Dynalist와의 기능 차이는 아래 순서로 줄인다. 단, 제품 방향상 제외한 파일 시스템, 태스크 관리, 공유/협업은 이 목록에 포함하지 않는다.

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
   - heading, color label, numbered list는 노드 속성으로 분리해 구조 편집과 충돌하지 않게 한다.
   - 본문 `text`와 별도 `note` 필드를 추가해 아이템 설명을 접거나 보일 수 있게 한다.
   - TODO/checkbox와 date 계열은 리치 포맷 단계에서도 제외한다.
4. 원격 sync 비용 안정화
   - Firebase 원격 sync는 명시적 opt-in으로만 활성화한다.
   - 정상적인 텍스트 입력이 매 keypress마다 전체 문서 update를 원격에 append하지 않게 batching/debounce한다. - 완료됨
   - `RemoteStoreV2`는 최신 snapshot 1개를 primary artifact로 저장해 update log 저장량 폭증을 막는다. - 완료됨
   - 같은 version의 다른 client write는 conflict로 처리하고, 밀려난 local snapshot은 conflict backup에 보존한다. - 완료됨
   - 원격 payload size guard와 encoded read/write byte metering 테스트를 둔다. - 완료됨
   - 개인 다기기 동기화가 목표이므로 realtime subscription을 필수 요구사항으로 두지 않는다.
   - 최우선 미해결 과제는 full snapshot write/read bandwidth 비용이다. 큰 문서에서 작은 편집이 발생할 때 전체 snapshot을 반복 전송하지 않는 저장소 또는 sync protocol을 Phase 13보다 먼저 결정한다.
5. 가져오기/내보내기 확장
   - 현재 JSON/Markdown export에 더해 OPML export/import를 지원한다.
   - indentation plain text import/export를 명시적 메뉴로 제공한다.
   - visible items only export 옵션을 추가한다.
   - import는 기존 workspace에 붙여넣기, 새 root 하위로 병합, 전체 교체를 구분한다.
6. 히스토리와 백업
   - 로컬 snapshot history를 저장해 특정 시점으로 복원할 수 있게 한다.
   - 수동 백업 파일 다운로드와 자동 백업 정책을 제공한다.
   - 원격 update log compaction과 snapshot history 보존 정책을 함께 설계한다.
7. 사용자 설정과 접근성
   - 키보드 shortcut 커스터마이즈를 command registry 기반으로 제공한다.
   - theme, font size, spellcheck, word count, auto-focus, bullet click 동작 같은 개인 설정을 저장한다.
   - 설정은 문서 데이터와 분리된 local/user preference로 저장한다.
