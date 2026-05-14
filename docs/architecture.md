# 아키텍처

## 1. 설계 목표

- 편집은 즉시 반응한다.
- 로컬 저장이 원격 동기화보다 우선한다.
- 동시 편집은 CRDT로 병합한다.
- 외부 라이브러리는 adapter로 감싼다.
- 핵심 트리 조작은 UI 없이 테스트 가능해야 한다.

## 2. 계층 구조

```txt
UI Components
  -> Editor Adapter
  -> Domain Commands
  -> Yjs Document Adapter
  -> Persistence / Remote Sync
```

현재 MVP 구현에서는 domain normalized tree가 행동의 기준이다. React UI는 domain command 결과를 표시하고, Lexical은 active row의 텍스트 입력 adapter로만 동작한다. Yjs adapter는 현재 `OutlineSnapshot`을 Y.Doc에 저장하는 snapshot 기반 adapter이며, 다음 단계에서 앱 런타임 상태의 중심으로 승격한다.

### UI Components

- 화면 렌더링과 사용자 입력을 담당한다.
- 직접 트리를 변경하지 않는다.
- command 함수를 호출하고 결과 상태를 표시한다.

### Editor Adapter

- Lexical과 앱 도메인 사이의 번역 계층이다.
- Lexical command를 domain command로 연결한다.
- Lexical selection과 앱 selection state를 동기화한다.
- MVP에서는 선택된 active row에만 Lexical editor를 마운트하고, 나머지 visible row는 plain text로 렌더링한다.

### Domain Commands

- outline tree를 변경하는 순수 함수 모음이다.
- 가장 많은 단위 테스트를 가진다.
- React, Lexical, Yjs, Firebase를 import하지 않는다.

### Yjs Document Adapter

- domain state와 Y.Doc 사이의 변환/적용을 담당한다.
- update encode/decode를 담당한다.
- UndoManager 연결을 담당한다.

### Persistence / Remote Sync

- 로컬 저장과 원격 업데이트 송수신을 담당한다.
- sync status를 계산한다.
- 네트워크 실패와 재시도를 관리한다.

## 3. 도메인 모델

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
};
```

초기 도메인 모델은 테스트 용이성을 위해 normalized tree를 사용한다. Lexical/Yjs 통합 과정에서 실제 저장 구조가 달라져도 domain command의 관찰 동작은 유지한다.

## 4. 벌크 편집 구조

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

## 5. Yjs 구조

```ts
type WorkspaceYDoc = {
  outline: Y.Map<OutlineSnapshot>;
};
```

MVP 저장 전략:

- `OutlineSnapshot`은 normalized `OutlineDocument`와 `ViewState`를 포함한다.
- domain command 결과를 Yjs transaction 안에서 snapshot으로 반영한다.
- UndoManager는 snapshot 변경을 사용자 action 단위로 되돌린다.
- 로컬 persistence와 remote sync는 encoded Yjs update 또는 snapshot을 adapter 뒤에서 다룬다.
- `@lexical/yjs` 직접 binding, Lexical custom node, rich text AST 저장은 리치텍스트 단계 전까지 보류한다.

이 선택은 플레인 텍스트 MVP에서 도메인 command 테스트를 행동 기준으로 유지하기 위한 것이다. 저장 구조가 나중에 더 세분화되어도 command의 관찰 동작은 유지해야 한다.

## 6. 원격 동기화 구조

전체 문서 blob을 계속 덮어쓰지 않는다. 동시 업데이트 유실을 피하기 위해 snapshot과 updates를 분리한다.

```txt
users/{userId}/workspaces/root/
  snapshot/
    state: string
    vector: string
    updatedAt: number
  updates/{updateId}/
    clientId: string
    seq: number
    update: string
    createdAt: number
```

동작:

1. 앱은 로컬 persistence에서 먼저 Y.Doc 또는 `OutlineSnapshot`을 복원한다.
2. 원격 snapshot을 가져와 `Y.applyUpdate` 한다.
3. 아직 적용하지 않은 updates를 적용한다.
4. 로컬 변경은 update log에 append한다.
5. 일정 기준을 넘으면 snapshot을 다시 만들고 오래된 updates를 정리한다.

## 7. Sync 상태

```ts
type SyncStatus =
  | "local-only"
  | "offline"
  | "syncing"
  | "synced"
  | "error";
```

- `local-only`: Phase 0~5의 기본 상태. 로그인 또는 원격 설정 없이 로컬만 사용
- `offline`: 원격 설정은 있으나 네트워크 없음
- `syncing`: 원격 update 송수신 중
- `synced`: 로컬 대기 update 없음
- `error`: 마지막 원격 작업 실패

## 8. 주요 인터페이스 초안

```ts
type RemoteUpdate = {
  id: string;
  clientId: string;
  seq: number;
  update: Uint8Array;
  createdAt: number;
};

interface RemoteStore {
  readSnapshot(): Promise<Uint8Array | null>;
  writeSnapshot(snapshot: Uint8Array, vector: Uint8Array): Promise<void>;
  appendUpdate(update: RemoteUpdate): Promise<void>;
  listUpdates(after?: string): Promise<RemoteUpdate[]>;
  subscribe(onUpdate: (update: RemoteUpdate) => void): () => void;
}
```

테스트와 앱 통합 순서는 FakeRemoteStore가 먼저다. Firebase Realtime Database adapter는 같은 인터페이스를 구현하되, FakeRemoteStore 기반으로 two-client merge, duplicate update, offline queue flush가 검증된 뒤 앱 설정에 연결한다.

## 9. 오프라인 큐

- 로컬 변경은 즉시 Y.Doc와 로컬 DB에 반영된다.
- 원격 전송 실패 시 update를 queue에 남긴다.
- 재연결 시 seq 순서대로 전송을 시도한다.
- 전송 성공 후 queue에서 제거한다.
- 중복 전송되어도 Yjs 병합 결과는 같아야 한다.

## 10. 성능 전략

- visible node list는 memoized selector로 계산한다.
- 접힌 subtree는 flatten 대상에서 제외한다.
- 줌인 상태에서는 zoom root의 subtree만 계산한다.
- 대량 문서는 virtual list로 렌더링한다.
- 입력 중 전체 tree object를 매번 새로 만들지 않도록 변경 범위를 제한한다.
- 다중 선택과 벌크 명령은 visible node list를 재사용하고, 전체 tree traversal을 반복하지 않는다.

## 11. 확정된 제품 방향과 남은 구조 검증

확정:

- 원격 저장소는 Firebase Realtime Database를 사용한다.
- 모바일 앱은 웹 MVP 이후로 분리한다.
- MVP는 플레인 텍스트와 키보드 속도를 우선한다.
- Dynalist식 벌크 편집은 MVP 핵심 범위에 포함한다.
- 협업 범위는 개인 다기기 동기화다.

검증 필요:

- 리치텍스트 단계에서 Lexical custom node 또는 `@lexical/yjs` 중심 구조가 필요한지
- snapshot 기반 Yjs adapter가 10,000개 노드와 Undo/Redo에서 충분한지
- 모바일 단계에서 IndexedDB를 유지할지 SQLite로 전환할지
