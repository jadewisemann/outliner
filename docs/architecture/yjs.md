# 5. Yjs 구조

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
