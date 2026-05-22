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

### 3.1 MVC 확장 모델

Stage 0 MVC까지의 기본 단위는 단일 workspace 안의 `OutlineNode`였다. 태스크 관리와 공유/협업은 계속 모델에 넣지 않는다.

Stage 0 기능은 현재 모델을 아래 방향으로 확장했다.

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
    numbered?: boolean; // legacy field: 현재 제품 표면에서는 사용하지 않는다.
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

### 3.2 Stage 1 다중 문서 워크스페이스 모델

Phase 16부터 최상위 저장 단위는 단일 `OutlineDocument`가 아니라 `WorkspaceSnapshot`이다. 기존 v1 `{ document, view }` 데이터는 v2 single-document workspace로 자동 승격한다.

```ts
type DocumentId = string;

type WorkspaceSnapshot = {
  schemaVersion: 2;
  workspace: {
    id: string;
    title?: string;
    documentOrder: DocumentId[];
    activeDocumentId: DocumentId;
    documents: Record<DocumentId, OutlineDocument>;
    view: WorkspaceViewState;
  };
};

type OutlineDocument = {
  id: DocumentId;
  title: string;
  slug: string;
  rootId: NodeId;
  nodes: Record<NodeId, OutlineNode>;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceViewState = {
  activeDocumentId: DocumentId;
  perDocument: Record<DocumentId, ViewState>;
  recentTargets?: LinkTarget[];
};

type LinkTarget =
  | { kind: "document"; documentId: DocumentId }
  | { kind: "node"; documentId: DocumentId; nodeId: NodeId };

type OutlineLink = {
  source: string;
  label: string;
  target: LinkTarget;
  unresolved?: {
    documentTitle?: string;
    nodeAnchor?: string;
  };
};
```

설계 원칙:

- 검색, 태그, 백링크는 우선 selector로 계산하고 병목이 확인될 때 별도 인덱스를 도입한다.
- `#tag`, `@tag`, `[[Document]]`, `[[Document^Node]]`는 사용자가 입력한 source text를 보존한다. 파생된 tag/link index는 언제든 재계산 가능해야 한다.
- internal link는 표시 텍스트가 아니라 stable id를 기준으로 저장한다. 문서 링크는 `documentId`, 노드 링크는 `{ documentId, nodeId }`를 target으로 둔다.
- 사용자는 제목으로 링크하지만 시스템은 id로 저장하고, picker는 생성/해결/중복/깨짐 상태를 명시한다.
- 문서명 중복은 허용할 수 있으나 picker는 path, 최근 수정일, preview로 반드시 구분한다.
- 리치 포맷은 구조 편집 command와 분리한다. heading, color, note처럼 노드 속성인 것은 metadata에 저장하고, inline bold/code/link처럼 텍스트 안에 남는 것은 source text를 기준으로 렌더링한다. `numbered`는 과거 metadata 실험 필드로 남아 있을 수 있지만 현재 제품 표면, export/import, 편집 UI에서는 제외한다.
- TODO/checkbox, date, recurring date, calendar sync는 metadata 확장 대상이 아니다.
- 사용자 설정은 outline document와 분리된 preference store에 저장한다. 설정 변경은 outline Undo/Redo stack에 들어가지 않는다.
- import/export adapter는 domain model 바깥에 두고, Stage 1 이후 가져오기 결과는 검증된 `WorkspaceSnapshot` 또는 삽입 가능한 document/node draft로 변환한 뒤 command를 통해 적용한다.
