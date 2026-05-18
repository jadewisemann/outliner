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

현재 MVP 구현에서는 domain normalized tree가 행동의 기준이다. React UI는 domain command 결과를 표시하고, Lexical은 active row의 텍스트 입력 adapter로만 동작한다. 앱 런타임은 local persistence에서 복원한 `OutlineSnapshot`을 Yjs-backed workspace의 source of truth로 사용하고, 선택적으로 `RemoteStore`를 연결해 원격 update를 pull/push/subscribe한다.

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

## 4.1 키보드 파워 편집 구조

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

현재 원격 sync의 앱 기본 경계는 `RemoteStoreV2` snapshot-primary sync다. v2는 전체 문서 상태를 update log에 계속 append하지 않고 최신 snapshot 1개를 덮어쓴다. 이로써 저장량과 신규 클라이언트 최초 sync가 과거 누적 로그에 비례해 폭증하는 문제는 줄었다.

단, v2 snapshot-primary는 최종 비용 해법이 아니다. 문서가 커진 상태에서 작은 편집이 발생해도 remote write payload는 전체 snapshot 크기에 비례한다. Firebase RTDB에 realtime listener가 붙어 있으면 다른 클라이언트의 read bandwidth도 전체 snapshot 크기에 비례할 수 있다. 따라서 Phase 12 이후 최우선 과제는 full-snapshot write/read bandwidth를 줄이는 저장소 또는 sync protocol 재설계다.

원격 sync의 제품 목표는 다중 사용자 공동편집이 아니라 개인 다기기 동기화다. 따라서 아키텍처의 우선순위는 항상 켜진 realtime stream보다 예측 가능한 비용, 작은 payload, bounded log, 복구 가능한 local-first 동작이다. RTDB는 현재 adapter 중 하나일 뿐이며, 저장소 교체 가능성을 `RemoteStore` 경계 안에 유지한다.

```txt
users/{userId}/workspaces/root/
  v2/snapshot
    version: number
    clientId: string
    updatedAt: number
    state: string
    vector?: string

  # legacy only
  snapshot/{state, vector, updatedAt}
  updates/{updateId}/
```

동작:

1. 앱은 로컬 persistence에서 먼저 Y.Doc 또는 `OutlineSnapshot`을 복원한다.
2. 원격 설정이 있으면 v2 latest snapshot을 가져와 Yjs workspace에 적용한다.
3. 로컬 변경은 debounce 후 v2 latest snapshot으로 conditional write한다.
4. 같은 version의 다른 client write는 reject/conflict로 처리한다.
5. 더 최신 remote snapshot이 pending local change를 밀어내면 현재 local snapshot을 conflict backup에 저장하고 `conflict` 상태를 표시한다.
6. 앱 시작, 포커스 복귀, optional adapter notification에서 remote pull을 수행한다.

앱의 런타임 흐름은 `local persistence -> Yjs workspace -> RemoteStoreV2 sync` 순서다. `RemoteStoreV2`가 주입되지 않으면 Firebase 설정이 없는 것으로 보고 `local-only` 상태로 기존 로컬 편집/저장/Undo/Redo 동작을 유지한다.

Phase 12-A 단기 비용 안정화 규칙:

- 원격 append는 keypress 단위가 아니라 의미 있는 transaction 또는 debounce window 단위로 batch한다.
- 단일 remote payload에는 byte budget을 두고, 초과 시 append하지 않는다.
- snapshot compaction은 오래된 update log cleanup과 함께 실행되어야 한다.
- RemoteStore 테스트 더블은 read/write byte count를 기록해 비용 회귀를 테스트한다.
- 새 클라이언트 sync는 최신 snapshot과 필요한 update만 읽어야 한다.
- Firebase RTDB `listUpdates`는 전체 `updates` tree를 읽고 클라이언트에서 자르지 않는다. 서버 query 또는 compacted cursor 기준으로 필요한 범위만 읽는다.
- `subscribe`는 과거 log 전체를 실시간 이벤트처럼 다시 적용하지 않게 start cursor를 가져야 한다.
- 비용 guard가 실패하면 remote 상태를 `error`로 보여주고 local persistence는 계속 유지한다.

Phase 12-B 중기 저장소 재검토 규칙:

- `RemoteStoreV2`는 최신 compacted snapshot을 primary artifact로 두며, 현재 앱 런타임은 v2 adapter를 사용한다.
- realtime subscription은 필수 contract가 아니다. provider가 realtime을 지원하지 않으면 앱 시작, 포커스 복귀, 수동 sync, 짧은 polling/debounce sync로 동작할 수 있어야 한다.
- 저장소 후보는 RTDB, Firestore, Supabase/Postgres, object storage 기반 snapshot 저장소를 같은 비용 모델로 비교한다.
- 기본 판단 기준은 10분 입력 테스트, 1시간 입력 테스트, 새 기기 최초 sync, 오프라인 후 재연결에서의 write bytes, read bytes, stored bytes다.
- 개인 다기기 동기화만 필요하면 정적 snapshot/blob 중심 저장소를 우선 후보로 둔다.

Phase 12-C 최우선 비용 과제:

- snapshot-primary v2는 remote stored bytes를 bounded하게 만들지만, write/read bandwidth는 문서 크기와 편집 빈도에 비례한다.
- Firebase RTDB를 계속 쓰는 경우 realtime listener는 전체 snapshot read를 반복할 수 있으므로 비용 검증 전까지 기본 요구사항이 아니다.
- 다음 구현은 full snapshot을 매 편집마다 보내지 않는 방향을 우선한다. 후보는 chunked snapshot, content-addressed blob/object storage, metadata-only CAS, 작고 bounded한 delta log, 서버/API 기반 compaction이다.

## 7. Sync 상태

```ts
type SyncStatus =
  | "local-only"
  | "offline"
  | "syncing"
  | "synced"
  | "error"
  | "conflict";
```

- `local-only`: Phase 0~5의 기본 상태. 로그인 또는 원격 설정 없이 로컬만 사용
- `offline`: 원격 설정은 있으나 네트워크 없음
- `syncing`: 원격 update 송수신 중
- `synced`: 로컬 대기 update 없음
- `error`: 마지막 원격 작업 실패
- `conflict`: 더 최신 remote snapshot이 pending local change를 밀어냈고, 밀려난 local snapshot을 conflict backup에 저장함

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

테스트와 앱 통합 순서는 FakeRemoteStore가 먼저다. Firebase Realtime Database adapter는 같은 인터페이스를 구현한다. `App`은 선택적 `remoteStore`를 받을 수 있고, `?remote=firebase`가 명시된 경우에만 Firebase adapter를 만든다. `VITE_FIREBASE_*`와 `VITE_OUTLINER_USER_ID` 설정이 있어도 명시적 remote mode가 없으면 `local-only`로 유지한다.

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

- 원격 sync는 optional `RemoteStore` adapter 뒤에서 동작한다.
- Firebase Realtime Database는 현재 구현된 adapter이지만 Phase 12에서 기본 저장소 여부를 재검토한다.
- 모바일 앱은 웹 MVP 이후로 분리한다.
- MVP는 플레인 텍스트와 키보드 속도를 우선한다.
- Dynalist식 벌크 편집은 MVP 핵심 범위에 포함한다.
- 파일/폴더/다중 문서 시스템은 제품 범위에서 제외한다.
- 태스크 관리 기능은 제품 범위에서 제외한다.
- 공유/협업 범위는 제외하고 개인 다기기 동기화만 유지한다.
- MVP 이후 기능은 검색, 태그/내부 링크/백링크, 리치 포맷/노트, 원격 sync 비용 안정화, import/export 확장, 히스토리/백업/설정 순서로 검토한다.

검증 필요:

- 검색/태그/링크를 selector 재계산으로 충분히 처리할 수 있는지, 별도 인덱스가 필요한지
- 리치텍스트 단계에서 Lexical custom node 또는 `@lexical/yjs` 중심 구조가 필요한지
- snapshot 기반 Yjs adapter가 10,000개 노드, Undo/Redo, 원격 sync 비용에서 충분한지
- 모바일 단계에서 IndexedDB를 유지할지 SQLite로 전환할지
