# 4. 벌크 편집 구조

벌크 편집은 UI 이벤트가 아니라 도메인 command로 먼저 정의한다. UI는 visible node selection과 clipboard 이벤트를 domain command로 번역한다.

```ts
type PastedOutlineDraft = {
  text: string;
  depth: number;
};

type BulkSelection = {
  anchorNodeId: NodeId;
  focusNodeId: NodeId;
  selectedNodeIds: NodeId[];
};
```

규칙:

- 다중 선택은 현재 `zoomNodeId`의 visible node list를 기준으로 계산한다.
- 접힌 subtree 내부 노드는 선택 범위에 포함하지 않는다.
- 벌크 command는 선택된 노드를 `normalizeTopLevelSelection`으로 정규화한 뒤 적용한다.
- 부모와 자식이 함께 선택되면 부모 subtree만 작업 대상으로 삼는다.
- clipboard copy는 indentation 기반 plain text를 기본 형식으로 사용한다.
- clipboard paste는 선행 tab 또는 2개 이상의 space indentation을 depth로 해석한다.
- 벌크 명령도 Yjs/UndoManager에서는 하나의 사용자 action으로 묶여야 한다.
