# 테스트 전략

이 프로젝트는 TDD를 기본 개발 방식으로 사용한다. 테스트는 구현 후 확인 도구가 아니라 요구사항을 코드로 고정하는 설계 도구다.

## 1. TDD 루프

1. Red: 실패하는 테스트를 먼저 작성한다.
2. Green: 테스트를 통과시키는 최소 구현을 작성한다.
3. Refactor: 테스트를 통과한 채 구조를 정리한다.
4. Repeat: 다음 사용자 관찰 동작으로 넘어간다.

## 2. 테스트 피라미드

### 현재 통과 중인 영역

- 앱 첫 화면 smoke E2E
- outline domain command
- bulk outline command
- React Outliner component command mapping
- IndexedDB 기반 local persistence snapshot 복원
- Yjs snapshot encode/apply/idempotency 기초
- sync queue 기초 상태 전이
- FakeRemoteStore를 통한 remote snapshot/update pull-push 기초
- 벌크 편집 E2E: indented paste, range indent, range delete

### 다음 테스트 우선순위

1. reload 후 문서, collapsed state, zoom state 복원 E2E
2. Yjs-backed app state와 Undo/Redo 통합 테스트
3. Fake two-client remote sync 병합 테스트
4. offline queue reconnect flush 테스트
5. duplicate remote update idempotency 테스트
6. 10,000 node visible selector 성능 테스트

### 단위 테스트

가장 많이 작성한다. 빠르고 결정적이어야 한다.

대상:

- outline tree command
- bulk outline command
- indentation paste parser
- clipboard serializer
- visible node selector
- breadcrumb selector
- export serializer
- sync queue state machine
- Yjs helper encode/decode wrapper

### 통합 테스트

외부 라이브러리와 우리 adapter의 경계를 검증한다.

대상:

- React component + domain command
- Lexical adapter
- Yjs adapter
- IndexedDB persistence
- fake remote store sync

### E2E 테스트

핵심 사용자 흐름만 검증한다. 너무 많은 케이스를 E2E로 몰지 않는다.
sync 세부 병합, update 중복 처리, queue 상태 전이는 단위/통합 테스트 중심으로 검증하고, E2E는 사용자가 관찰할 수 있는 최종 흐름만 남긴다.

대상:

- 첫 화면 진입
- 노드 작성/들여쓰기/접기/줌인
- 멀티라인 붙여넣기와 다중 노드 일괄 편집
- 새로고침 복원
- 두 브라우저 컨텍스트 동시 편집
- 오프라인 후 재연결 동기화

## 3. 테스트 파일 구조

```txt
src/
  domain/
    outline.ts
    outline.test.ts
    bulkOutline.ts
    bulkOutline.test.ts
  editor/
    lexicalAdapter.ts
    lexicalAdapter.test.ts
  sync/
    yjsAdapter.ts
    yjsAdapter.test.ts
    remoteSync.ts
    remoteSync.test.ts
    syncQueue.ts
    syncQueue.test.ts
  persistence/
    localPersistence.ts
    localPersistence.test.ts
  components/
    Outliner.tsx
    Outliner.test.tsx
e2e/
  smoke.spec.ts
  bulk-editing.spec.ts
  persistence.spec.ts
  sync.spec.ts
```

## 4. 테스트 스키마

### 4.1 도메인 테스트

```ts
describe("outline commands", () => {
  it("creates a node after the target sibling", () => {});
  it("splits a node at the cursor offset", () => {});
  it("moves the current node under the previous sibling when indenting", () => {});
  it("does nothing when indenting the first sibling", () => {});
  it("moves the current node after its parent when outdenting", () => {});
  it("does nothing when outdenting a root child", () => {});
});
```

### 4.2 벌크 편집 테스트

```ts
describe("bulk outline commands", () => {
  it("parses indented multiline text into outline drafts", () => {});
  it("inserts pasted multiline text while preserving indentation", () => {});
  it("selects a visible range with shift arrow navigation", () => {});
  it("excludes hidden descendants from range selection", () => {});
  it("normalizes nested selections to top-level selected subtrees", () => {});
  it("indents selected sibling blocks while preserving order", () => {});
  it("outdents selected sibling blocks while preserving order", () => {});
  it("deletes selected top-level subtrees", () => {});
  it("serializes selected nodes as indented plain text", () => {});
});
```

### 4.3 Visible node 테스트

```ts
describe("visible outline nodes", () => {
  it("includes descendants of expanded nodes", () => {});
  it("excludes descendants of collapsed nodes", () => {});
  it("limits visible nodes to the zoomed subtree", () => {});
  it("keeps stable order after indenting and outdenting", () => {});
});
```

### 4.4 Persistence 테스트

```ts
describe("local persistence", () => {
  it("restores the local document before remote sync completes", () => {});
  it("restores collapsed state and zoom state", () => {});
  it("does not block editing while remote sync is unavailable", () => {});
  it("restores a Yjs-backed outline snapshot into the app runtime", () => {});
});
```

### 4.5 Yjs와 Undo/Redo 테스트

```ts
describe("yjs workspace runtime", () => {
  it("renders the current outline snapshot from a Yjs workspace", () => {});
  it("records text and structure commands as undoable transactions", () => {});
  it("undoes and redoes text edits", () => {});
  it("undoes and redoes structure edits", () => {});
});
```

### 4.6 Sync 테스트

```ts
describe("remote sync", () => {
  it("applies a remote snapshot to the local document", () => {});
  it("applies update logs in any order", () => {});
  it("ignores duplicate updates", () => {});
  it("flushes queued local updates after reconnecting", () => {});
  it("merges concurrent edits from two clients", () => {});
});
```

### 4.7 E2E 테스트

```ts
test("creates and structures an outline with the keyboard", async ({ page }) => {});
test("pastes an indented outline as multiple nodes", async ({ page }) => {});
test("bulk indents and deletes a selected visible range", async ({ page }) => {});
test("restores the outline after reload", async ({ page }) => {});
test("syncs edits between two browser contexts", async ({ browser }) => {});
test("keeps offline edits and syncs them after reconnect", async ({ page }) => {});
```

## 5. 테스트 작성 규칙

- 테스트 이름은 구현 방식이 아니라 사용자 관찰 동작을 설명한다.
- 버그 수정은 재현 테스트를 먼저 추가한다.
- 단위 테스트는 네트워크, 브라우저, 타이머에 직접 의존하지 않는다.
- 시간과 ID는 주입 가능한 fake를 사용한다.
- Firebase는 대부분의 테스트에서 fake remote store로 대체한다.
- Playwright는 핵심 흐름 검증에만 사용한다.
- snapshot test는 UI 구조가 자주 바뀌는 초기 MVP에서는 남발하지 않는다.

## 6. 권장 명령

```sh
npm run test
npm run test:watch
npm run test:e2e
npm run typecheck
```

## 7. CI에서 강제할 후보

- `npm run typecheck`
- `npm run test`
- 핵심 Playwright smoke test

전체 E2E와 성능 테스트는 시간이 길면 nightly 또는 수동 검증으로 분리할 수 있다.
