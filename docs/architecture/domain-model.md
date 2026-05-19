# 3. 도메인 모델

```ts
type NodeId = string;

type OutlineNode = {
  id: NodeId;
  text: string;
  children: NodeId[];
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
};

type OutlineDocument = {
  rootId: NodeId;
  nodes: Record<NodeId, OutlineNode>;
};

type ViewState = {
  zoomNodeId: NodeId;
  selectedNodeId?: NodeId;
  selectionAnchorNodeId?: NodeId;
  selectionFocusNodeId?: NodeId;
  cursors?: OutlineCursor[];
};

type OutlineCursor = {
  nodeId: NodeId;
  offset: number;
};
```

초기 도메인 모델은 테스트 용이성을 위해 normalized tree를 사용한다. Lexical/Yjs 통합 과정에서 실제 저장 구조가 달라져도 domain command의 관찰 동작은 유지한다.

### 3.1 후속 기능 확장 모델

MVP 이후에도 기본 단위는 단일 workspace 안의 `OutlineNode`다. Dynalist식 파일/폴더/다중 문서 시스템은 만들지 않으며, 태스크 관리와 공유/협업도 모델에 넣지 않는다.

후속 기능은 현재 모델을 아래 방향으로 확장한다.

```ts
type OutlineNode = {
  id: NodeId;
  text: string;
  note?: string;
  children: NodeId[];
  collapsed: boolean;
  metadata?: {
    heading?: 1 | 2 | 3;
    color?: string;
    numbered?: boolean;
    links?: NodeId[];
  };
  createdAt: number;
  updatedAt: number;
};

type UserPreferences = {
  keymap: Record<string, string>;
  theme: string;
  fontSize: number;
  spellcheck: boolean;
  showWordCount: boolean;
  autoFocusFirstItem: boolean;
};
```

설계 원칙:

- 검색, 태그, 백링크는 우선 selector로 계산하고 병목이 확인될 때 별도 인덱스를 도입한다.
- `#tag`, `@tag`, `[[link]]`는 사용자가 입력한 source text를 보존한다. 파생된 tag/link index는 언제든 재계산 가능해야 한다.
- internal link는 표시 텍스트가 아니라 node id를 기준으로 저장한다.
- 리치 포맷은 구조 편집 command와 분리한다. heading, color, numbered, note처럼 노드 속성인 것은 metadata에 저장하고, inline bold/code/link처럼 텍스트 안에 남는 것은 source text를 기준으로 렌더링한다.
- TODO/checkbox, date, recurring date, calendar sync는 metadata 확장 대상이 아니다.
- 사용자 설정은 outline document와 분리된 preference store에 저장한다. 설정 변경은 outline Undo/Redo stack에 들어가지 않는다.
- import/export adapter는 domain model 바깥에 두고, 가져오기 결과는 검증된 `OutlineSnapshot` 또는 삽입 가능한 node draft로 변환한 뒤 command를 통해 적용한다.
