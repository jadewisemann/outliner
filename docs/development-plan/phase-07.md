# Phase 7: 키보드 파워 편집 - 완료됨

### 목표

키보드 기반 아웃라이너로서 구조 편집의 속도를 높인다. `Alt+ArrowUp/Down` 노드 이동, 선택 범위 이동, 멀티 커서 생성을 domain command와 UI shortcut으로 연결한다.

### 먼저 작성할 테스트

- 현재 노드를 `Alt+ArrowUp`으로 이전 형제 앞으로 이동한다.
- 현재 노드를 `Alt+ArrowDown`으로 다음 형제 뒤로 이동한다.
- 노드 이동은 같은 부모 안의 이전/다음 sibling block과 교환한다.
- 첫 자식/마지막 자식 경계에서는 이전/다음 부모 sibling의 자식으로 이동하거나 현재 부모 앞/뒤로 outdent한다.
- Root 레벨의 첫 visible 노드를 위로 이동하거나 마지막 visible 노드를 아래로 이동하면 no-op이다.
- 접힌 부모 노드를 이동하면 hidden descendants가 함께 이동한다.
- 선택된 visible range를 `Alt+ArrowUp/Down`으로 순서를 유지해 이동한다.
- 이동 후 선택 anchor/focus가 유지된다.
- `Mod+Alt+ArrowUp/Down`으로 위아래 visible row에 보조 커서를 추가한다.
- 멀티 커서 상태에서 텍스트 입력, `Backspace`, `Delete`가 모든 커서 위치에 적용된다.
- 멀티 커서 상태에서 `Escape`가 보조 커서를 정리한다.

### 구현 항목

- `moveNodeUp`, `moveNodeDown`
- `bulkMoveNodesUp`, `bulkMoveNodesDown`
- `OutlineCursor`와 multi cursor view state
- Lexical active row command bridge 확장
- 보조 커서 row overlay와 focus 유지
- Undo/Redo transaction grouping
- keyboard power editing E2E

### 완료된 검증

- `npm run typecheck` 통과
- `npm run test` 통과: 80 tests
- `npm run test:e2e` 통과: 10 Playwright tests

### 완료 기준

- 마우스 없이 노드 작성, depth 변경, 접기/펼치기, 순서 이동, 범위 이동이 가능하다.
- 멀티 커서로 여러 row에 같은 텍스트 편집을 적용할 수 있다.
- 모든 파워 편집 명령이 도메인 테스트와 컴포넌트 shortcut 테스트를 가진다.
- Undo/Redo가 노드 이동과 멀티 커서 편집을 사용자 action 단위로 되돌린다.
