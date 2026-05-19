# 4.1 키보드 파워 편집 구조

키보드 파워 편집은 visible node list를 공통 기준으로 사용하되, domain command는 실제 tree 관계를 직접 변경한다. UI shortcut은 active row의 Lexical command를 앱 command로 번역하고, domain command 결과만 document/view state에 반영한다.

```ts
type MoveDirection = "up" | "down";

type MultiCursorState = {
  primary: OutlineCursor;
  cursors: OutlineCursor[];
};
```

규칙:

- `Alt+ArrowUp/Down`은 현재 active node 또는 range selection을 이동하는 구조 command다.
- 노드 이동은 기본적으로 같은 부모 안의 이전/다음 sibling block과 순서를 교환한다.
- 첫 자식을 위로 이동하거나 마지막 자식을 아래로 이동하는 경우에는 부모 경계를 넘는다. 이전/다음 부모 sibling이 있으면 그 sibling의 마지막/첫 자식으로 이동하고, 없으면 현재 부모 앞/뒤로 outdent한다.
- 다중 선택 이동은 `normalizeTopLevelSelection`으로 중복 subtree를 제거한 뒤 하나의 블록으로 처리한다.
- 접힌 노드는 hidden descendants를 포함한 subtree 단위로 이동한다.
- 이동 후 selection anchor/focus와 active node id는 가능하면 유지한다.
- `Mod+Alt+ArrowUp/Down`은 visible row에 `OutlineCursor`를 추가한다.
- 멀티 커서가 시작되면 range selection은 해제되고, range selection이 시작되면 멀티 커서는 해제된다.
- 멀티 커서 텍스트 편집은 domain command가 여러 node text 변경을 하나의 transaction으로 만든다.
- Lexical은 primary cursor가 있는 active row의 IME/editor adapter로 남고, 보조 커서는 앱 state와 row overlay로 표현한다.
- 키보드 파워 편집 명령도 Yjs/UndoManager에서는 하나의 사용자 action으로 묶여야 한다.
