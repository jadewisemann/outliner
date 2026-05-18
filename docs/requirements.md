# 요구사항

## 1. 제품 목표

Dynalist의 핵심 경험인 무한 뎁스 아웃라이너를 로컬 퍼스트 방식으로 구현한다. 사용자는 네트워크와 무관하게 문서를 즉시 열고, 키보드만으로 빠르게 구조를 만들고, 개인의 여러 기기에서 발생한 변경을 데이터 유실 없이 병합할 수 있어야 한다.

## 2. MVP 범위

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
- TODO/checkbox 노드

### 제품 방향상 제외

- Dynalist식 파일/폴더/다중 문서 시스템은 만들지 않는다. 이 앱의 문서는 앱 안의 파일 pane이 아니라 로컬/동기화 저장소의 단일 workspace 또는 추후 외부 파일 기반 저장 전략으로 다룬다.
- 태스크 관리 기능은 제품 핵심에서 제외한다. TODO/checkbox, 완료 상태, due date, recurring date, calendar sync, overdue highlight는 구현하지 않는다.
- 공유와 협업 기능은 제외한다. 개인 다기기 동기화는 유지하지만, public share, collaborator, 권한 모델, 댓글/알림은 만들지 않는다.

## 2.1 MVP 이후 기능 후보

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
4. 가져오기/내보내기 확장
   - 현재 JSON/Markdown export에 더해 OPML export/import를 지원한다.
   - indentation plain text import/export를 명시적 메뉴로 제공한다.
   - visible items only export 옵션을 추가한다.
   - import는 기존 workspace에 붙여넣기, 새 root 하위로 병합, 전체 교체를 구분한다.
5. 히스토리와 백업
   - 로컬 snapshot history를 저장해 특정 시점으로 복원할 수 있게 한다.
   - 수동 백업 파일 다운로드와 자동 백업 정책을 제공한다.
   - 원격 update log compaction과 snapshot history 보존 정책을 함께 설계한다.
6. 사용자 설정과 접근성
   - 키보드 shortcut 커스터마이즈를 command registry 기반으로 제공한다.
   - theme, font size, spellcheck, word count, auto-focus, bullet click 동작 같은 개인 설정을 저장한다.
   - 설정은 문서 데이터와 분리된 local/user preference로 저장한다.

## 3. 핵심 사용자 시나리오

### 3.1 첫 실행

- 사용자는 앱을 열면 Root 문서에 바로 진입한다.
- 로그인 또는 네트워크 지연 때문에 편집이 막히지 않는다.
- 빈 문서라면 첫 노드 입력 위치가 준비되어 있다.

### 3.2 아웃라인 작성

- 사용자는 텍스트를 입력하고 `Enter`로 다음 노드를 만든다.
- `Tab`으로 현재 노드를 위 형제 노드의 자식으로 이동한다.
- `Shift+Tab`으로 현재 노드를 부모의 다음 형제로 승격한다.
- `ArrowUp`/`ArrowDown`으로 보이는 노드 사이를 이동한다.
- `Alt+ArrowUp`/`Alt+ArrowDown`으로 현재 노드를 위아래 visible 위치로 이동한다.
- 다중 노드가 선택된 상태에서 `Alt+ArrowUp`/`Alt+ArrowDown`을 누르면 선택 범위 전체가 순서를 유지한 채 위아래로 이동한다.

### 3.3 구조 탐색

- 사용자는 하위 노드가 있는 노드를 접고 펼칠 수 있다.
- 접힌 하위 노드는 화면과 키보드 이동 대상에서 제외된다.
- 사용자는 노드로 줌인하고 브레드크럼으로 상위 노드로 돌아간다.

### 3.4 오프라인 편집

- 사용자는 오프라인에서도 기존 문서를 열고 편집한다.
- 변경은 즉시 로컬에 저장된다.
- 네트워크가 복구되면 대기 중인 변경이 원격에 반영된다.

### 3.5 동시 편집

- 사용자는 두 브라우저 창 또는 두 기기에서 같은 문서를 편집한다.
- 같은 문서를 동시에 수정해도 변경이 충돌 복사본 없이 병합된다.
- 중복으로 수신한 원격 update는 데이터 중복을 만들지 않는다.

### 3.6 벌크 편집

- 사용자는 여러 줄 텍스트를 붙여넣어 한 번에 여러 노드를 만든다.
- 붙여넣은 텍스트의 선행 공백 또는 탭은 노드 depth로 해석된다.
- 사용자는 `Shift+ArrowUp`/`Shift+ArrowDown`으로 보이는 노드 범위를 선택한다.
- 선택된 여러 노드는 `Tab`, `Shift+Tab`, `Backspace/Delete`, 접기/펼치기 명령을 한 번에 적용받는다.
- 사용자는 선택된 노드 범위를 복사해 indentation 기반 텍스트 또는 Markdown으로 다른 앱에 붙여넣을 수 있다.
- 선택 범위에 부모와 자식이 함께 포함된 경우, 같은 subtree가 중복 복사/삭제/이동되지 않아야 한다.

### 3.7 키보드 파워 편집

- 사용자는 마우스 없이 노드 순서를 바꾸고, 여러 위치에 같은 편집을 반복 적용할 수 있다.
- `Alt+ArrowUp`/`Alt+ArrowDown`은 텍스트 커서 이동이 아니라 노드 또는 선택 범위의 구조적 순서 변경으로 해석한다.
- `Mod+Alt+ArrowUp`/`Mod+Alt+ArrowDown`은 현재 active row 위아래 visible row에 보조 커서를 추가한다.
- 멀티 커서가 있는 상태에서 일반 텍스트 입력, `Backspace`, `Delete`는 모든 커서 위치에 같은 텍스트 편집을 적용한다.
- 멀티 커서가 있는 상태에서 `Enter`, `Tab`, `Shift+Tab`은 각 커서가 속한 노드에 같은 구조 명령을 적용하되, 명령 결과는 visible order 기준으로 안정적이어야 한다.
- `Escape`는 멀티 커서와 범위 선택을 해제하고 active row 하나만 남긴다.
- 멀티 커서와 범위 선택이 동시에 존재할 수 없으며, 한 모드가 시작되면 다른 모드는 정리된다.

## 4. 기능 요구사항

### 4.1 노드

- Root 노드는 항상 존재한다.
- Root 노드는 삭제할 수 없다.
- Root 노드의 텍스트는 MVP에서 편집하지 않는다.
- 일반 노드는 빈 텍스트를 가질 수 있다.
- 일반 노드는 0개 이상의 자식 노드를 가진다.
- 형제 노드는 안정적인 순서를 가진다.
- 각 노드는 안정적인 앱 레벨 `id`를 가진다.

### 4.2 편집 명령

- `createNodeAfter(nodeId)`는 대상 노드 뒤에 새 형제 노드를 만든다.
- `splitNode(nodeId, offset)`은 텍스트를 분리하고 뒤쪽 텍스트를 새 노드로 이동한다.
- `indentNode(nodeId)`는 현재 노드를 바로 위 형제의 마지막 자식으로 이동한다.
- `outdentNode(nodeId)`는 현재 노드를 부모의 다음 형제로 이동한다.
- `moveNodeUp(nodeId)`는 현재 노드를 visible order 기준 한 칸 위로 이동한다.
- `moveNodeDown(nodeId)`는 현재 노드를 visible order 기준 한 칸 아래로 이동한다.
- `toggleCollapse(nodeId)`는 자식이 있는 노드의 접힘 상태를 바꾼다.
- `zoomInto(nodeId)`는 현재 viewport root를 해당 노드로 바꾼다.
- `zoomToAncestor(nodeId)`는 브레드크럼 대상 노드로 viewport root를 바꾼다.
- `parseIndentedText(text)`는 여러 줄 텍스트를 depth가 있는 노드 draft 목록으로 변환한다.
- `insertNodesFromText(targetNodeId, text)`는 대상 노드 뒤에 indentation 구조를 유지한 노드들을 삽입한다.
- `selectVisibleRange(anchorNodeId, focusNodeId)`는 현재 visible node 기준 연속 범위를 선택한다.
- `bulkIndentNodes(nodeIds)`는 선택된 최상위 노드들을 한 단계 들여쓴다.
- `bulkOutdentNodes(nodeIds)`는 선택된 최상위 노드들을 한 단계 내어쓴다.
- `bulkMoveNodesUp(nodeIds)`는 선택된 최상위 노드 블록을 visible order 기준 한 칸 위로 이동한다.
- `bulkMoveNodesDown(nodeIds)`는 선택된 최상위 노드 블록을 visible order 기준 한 칸 아래로 이동한다.
- `bulkDeleteNodes(nodeIds)`는 선택된 최상위 노드와 하위 subtree를 삭제한다.
- `bulkToggleCollapse(nodeIds, collapsed)`는 선택된 노드 중 자식이 있는 노드들의 접힘 상태를 일괄 변경한다.
- `serializeNodesForClipboard(nodeIds)`는 선택 범위를 indentation 기반 plain text로 직렬화한다.
- `addCursorAbove(nodeId, offset)`은 현재 커서와 같은 text offset을 위 visible row에 보조 커서로 추가한다.
- `addCursorBelow(nodeId, offset)`은 현재 커서와 같은 text offset을 아래 visible row에 보조 커서로 추가한다.
- `applyTextToCursors(cursorIds, edit)`는 모든 커서 위치에 같은 텍스트 편집을 deterministic order로 적용한다.

### 4.3 삭제/병합

- 텍스트가 있는 노드에서 `Backspace`는 텍스트를 삭제한다.
- 빈 노드에서 `Backspace`는 이전 노드와 병합하거나 현재 빈 노드를 삭제한다.
- 자식이 있는 빈 노드에서 `Backspace`를 누르면 빈 부모를 제거하고 자식 노드를 같은 레벨로 승격한다.
- 삭제/병합 동작은 자식 데이터를 자동으로 삭제하지 않는다.

### 4.4 마크다운 입력

- MVP에서는 마크다운 자동 변환을 필수 기능으로 두지 않는다.
- `- `, `* `는 새 리스트 구조로 변환하지 않고 현재 노드의 텍스트로 유지한다.
- `# `, `**text**`, `` `text` ``, `[label](url)` 등은 후속 단계에서 검토한다.
- TODO/checkbox 노드는 MVP에서 제외한다.

### 4.5 저장과 복원

- 모든 로컬 변경은 즉시 IndexedDB 또는 모바일 persistence에 저장된다.
- 새로고침 후 문서 내용, 접힘 상태, 줌 위치가 복원된다.
- 원격 동기화는 로컬 복원 이후 비동기로 진행된다.

### 4.6 동기화

- 원격 저장소는 전체 문서 덮어쓰기만 사용하지 않는다.
- 원격은 snapshot과 update log를 분리한다.
- 로컬 변경은 Yjs update로 append한다.
- 원격 update는 수신 순서와 무관하게 적용 가능해야 한다.
- 이미 적용한 update는 다시 적용해도 결과가 깨지지 않아야 한다.

### 4.7 벌크 편집 규칙

- 벌크 명령은 현재 화면에 보이는 visible node 순서를 기준으로 동작한다.
- 접힌 subtree 내부 노드는 범위 선택 대상에 포함되지 않는다.
- 선택 범위에 부모와 자식이 모두 포함되면 부모만 최상위 작업 대상으로 삼는다.
- 여러 노드 들여쓰기는 선택 범위의 첫 최상위 노드 바로 위 형제를 기준으로 전체 블록을 이동한다.
- 선택 범위의 첫 최상위 노드 위에 형제가 없으면 bulk indent는 아무 동작도 하지 않는다.
- 여러 노드 내어쓰기는 각 최상위 노드를 부모의 다음 형제 위치로 순서를 유지해 이동한다.
- bulk delete는 명시적으로 선택된 최상위 subtree를 삭제한다. 단일 빈 노드 Backspace의 자식 승격 정책과 구분한다.
- 멀티라인 paste는 active row의 커서 위치에서 현재 노드를 split하고, 붙여넣은 첫 줄은 split 이후 현재 위치에 들어가며 나머지 줄은 indentation 구조로 이어 붙인다.

### 4.8 키보드 파워 편집 규칙

- 노드 순서 이동은 현재 노드의 parent/children 순서를 변경한다.
- `Alt+ArrowUp`/`Alt+ArrowDown`은 현재 노드 또는 선택 범위를 같은 부모 안의 이전/다음 sibling block과 교환하는 명령이다.
- 첫 자식을 위로 이동하거나 마지막 자식을 아래로 이동하는 경우에는 부모 경계를 넘는다.
- 부모 경계를 넘을 때 이전/다음 부모 sibling이 있으면 그 sibling의 마지막/첫 자식으로 이동한다.
- 부모 경계를 넘을 때 이전/다음 부모 sibling이 없으면 현재 부모 앞/뒤로 outdent한다.
- 예를 들어 `a > a.a`, `b > b.a`에서 `b.a`를 위로 이동하면 `a > a.a, b.a`, `b`가 된다.
- 같은 구조에서 `a.a`를 위로 이동하면 `a.a`, `a`, `b > b.a`가 된다.
- 같은 구조에서 `a.a`를 아래로 이동하면 `a`, `b > a.a, b.a`가 된다.
- 같은 구조에서 `b.a`를 아래로 이동하면 `a > a.a`, `b`, `b.a`가 된다.
- 접힌 subtree는 하나의 visible 블록으로 취급한다. 접힌 부모를 이동하면 hidden descendants도 함께 이동한다.
- 선택 범위 이동은 `normalizeTopLevelSelection` 결과를 기준으로 하며, 부모와 자식이 함께 선택된 경우 부모 subtree만 이동한다.
- 선택 범위 이동 후에도 선택 anchor/focus는 같은 node id를 유지한다.
- Root 레벨의 첫 visible 블록을 위로 이동하거나 마지막 visible 블록을 아래로 이동하는 명령은 no-op이다.
- 멀티 커서는 node id와 text offset 목록으로 표현한다. offset이 대상 텍스트 길이를 넘으면 해당 노드의 끝으로 clamp한다.
- 멀티 커서 텍스트 편집은 아래 visible row부터 위 visible row 순서로 적용해 offset shift가 다른 커서에 영향을 주지 않게 한다.
- 멀티 커서 구조 명령은 `normalizeTopLevelSelection`과 같은 중복 subtree 제거 규칙을 사용한다.
- Undo/Redo에서 노드 이동, 범위 이동, 멀티 커서 편집은 각각 하나의 사용자 action으로 되돌아가야 한다.

## 5. 비기능 요구사항

- Cold start: 로컬 문서 1초 이내 표시
- Scale target: MVP 수용 기준은 10,000개 노드, 구조 설계 목표는 50,000개 노드
- Reliability: 오프라인 편집 후 재연결 시 변경 유실 없음
- Testability: 핵심 트리 조작은 UI 없이 단위 테스트 가능
- Maintainability: 외부 라이브러리 호출은 adapter로 격리

## 6. 수용 기준

### 구현 완료된 핵심 기준

- 키보드만으로 3뎁스 이상 아웃라인을 작성할 수 있다.
- 접힘 상태가 visible node 계산과 키보드 이동에 반영된다.
- 멀티라인 붙여넣기가 indentation 구조를 유지해 여러 노드를 만든다.
- 다중 노드 선택 후 들여쓰기/내어쓰기/삭제/접기 명령이 한 번에 적용된다.
- 선택 범위 복사/붙여넣기가 outline 구조를 보존한다.
- 모든 핵심 도메인 동작은 실패 테스트를 먼저 가진다.
- 새로고침 후 작성한 노드와 접힘/줌 상태가 유지된다.
- Yjs-backed runtime Undo/Redo가 텍스트와 구조 변경에 적용된다.
- FakeRemoteStore 기반 두 runtime 동시 편집이 병합된다.
- 오프라인 후 재연결 시 pending update가 flush된다.
- `Alt+ArrowUp/Down`으로 현재 노드 또는 선택 범위를 위아래로 이동할 수 있다.
- 첫 자식/마지막 자식의 `Alt+ArrowUp/Down` 부모 경계 이동 규칙이 도메인 테스트와 E2E로 검증된다.
- `Mod+Alt+ArrowUp/Down`으로 멀티 커서를 만들고 같은 텍스트 편집을 여러 row에 적용할 수 있다.

### 남은 MVP 체크리스트

- browser-backed 원격 sync E2E는 추가되었다.
- Firebase-backed 환경의 원격 sync smoke를 실제 프로젝트 설정으로 검증한다.
- 10,000개 노드 fixture에서 visible 계산과 기본 편집이 사용 가능한 성능을 보인다. - 완료됨

## 7. 제품 결정

- Phase 0~6은 로그인 없는 로컬 단일 문서, Yjs-backed local runtime, optional RemoteStore sync를 우선한다.
- 원격 동기화 저장소는 Firebase Realtime Database를 사용한다.
- MVP 텍스트는 플레인 텍스트 중심이다.
- TODO/checkbox 노드는 MVP에서 제외한다.
- 자식 있는 빈 노드에서 `Backspace`를 누르면 자식을 같은 레벨로 승격한다.
- bullet 클릭은 줌인이다.
- 모바일 앱은 웹 MVP 이후로 분리한다.
- 협업 범위는 개인 다기기 동기화다.
- JSON과 Markdown 내보내기를 모두 지원한다.
- MVP 성능 수용 기준은 10,000개 노드, 구조 설계 목표는 50,000개 노드다.
- Dynalist 대안으로서 벌크 편집은 MVP 핵심 범위에 포함한다. 구현 순서는 기본 키보드 편집 이후, 로컬 persistence/Yjs 동기화 전에 넣는다.
- 벌크 편집, Yjs 런타임 통합, 개인 다기기 sync는 MVP 핵심 기능으로 구현 완료되었고, 이후 작업은 키보드 파워 편집과 성능 검증 순서로 진행한다.
