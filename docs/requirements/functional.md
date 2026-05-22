# 4. 기능 요구사항

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
- TODO list 기능은 제품 핵심에서 제외한다. 단, 노드 텍스트가 `[]` 또는 `[*]` source marker로 시작하는 경우만 lightweight 완료 상태로 취급할 수 있다.
- `[]`/`[*]` marker는 별도 task metadata가 아니라 사용자가 편집할 수 있는 source text다. due date, recurring date, calendar sync, overdue highlight와 연결하지 않는다.
- code block 내부 전용 줄바꿈 기능은 제품 표면에서 제외한다. 코드와 일반 본문은 source text를 우선 보존하고, 별도 코드 편집기처럼 동작하지 않는다.

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
- 원격 sync는 keypress마다 전체 문서를 전송하지 않는다.
- update log는 compaction과 cleanup으로 크기 상한을 가진다.
- realtime subscription은 optional capability이며, 앱 시작/포커스 복귀/수동 sync만으로도 개인 다기기 동기화가 가능해야 한다.

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

### 4.9 워크스페이스와 문서 사이드바

- Stage 1부터 앱의 최상위 작업 단위는 workspace이며, workspace는 1개 이상의 outline document를 가진다.
- 여러 문서가 있는 workspace에서는 왼쪽 사이드바가 문서 탐색의 기본 UI다.
- 사이드바는 현재 workspace의 문서 목록을 `documentOrder` 순서로 보여준다.
- 사이드바는 active document를 명확히 표시한다.
- 사용자는 사이드바에서 문서를 클릭해 active document를 전환할 수 있다.
- 사용자는 사이드바에서 새 문서를 만들 수 있다.
- 사용자는 사이드바 또는 문서 항목 메뉴에서 문서 이름 변경과 삭제 흐름에 진입할 수 있다.
- 문서 삭제는 active document가 사라지는 경우 남은 문서 중 하나로 안전하게 전환해야 한다.
- 마지막 남은 문서는 삭제할 수 없거나, 삭제 대신 빈 기본 문서로 대체되어 workspace가 항상 최소 1개 문서를 유지해야 한다.
- 단일 문서 workspace에서도 사이드바는 접을 수 있어야 하며, 기존 단일 문서 편집 화면의 집중감을 해치지 않아야 한다.
- 사이드바의 열림/닫힘, 폭, 최근 접근 문서 같은 UI 상태는 outline node Undo/Redo stack과 분리한다.
- 사이드바의 문서 생성, 이름 변경, 삭제, 전환은 문서 내부 노드 편집 Undo/Redo에 섞이지 않아야 한다.

### 4.10 노드 row 조작 표면

- 각 노드 row는 불렛 왼쪽에 두 개의 조작 표면을 제공한다.
- 첫 번째 버튼은 전체 메뉴다. 전체 메뉴에는 현재 노드에서 수행 가능한 모든 조작을 모은다.
- 두 번째 버튼은 퀵 버튼이다. 퀵 버튼은 `깊이 들어가기` 또는 `완료로 표시` 중 하나를 노출한다.
- 퀵 버튼이 `깊이 들어가기`를 노출하면 불렛 클릭은 `완료로 표시`를 담당한다. 퀵 버튼이 `완료로 표시`를 노출하면 불렛 클릭은 `깊이 들어가기`를 담당한다.
- 설정에서 불렛 클릭을 금지한 경우 불렛은 조작 대상이 아니며, 불렛 왼쪽에 퀵 버튼 두 개를 모두 노출한다.
- `완료로 표시`는 `[]`/`[*]` source marker를 토글하는 동작으로 한정한다. 일반 TODO list, task filtering, 일정 기능은 만들지 않는다.
