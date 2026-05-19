# 도메인 테스트

```ts
describe("outline commands", () => {
  it("creates a node after the target sibling", () => {});
  it("splits a node at the cursor offset", () => {});
  it("moves the current node under the previous sibling when indenting", () => {});
  it("does nothing when indenting the first sibling", () => {});
  it("moves the current node after its parent when outdenting", () => {});
  it("does nothing when outdenting a root child", () => {});
  it("moves the current node before the previous visible sibling with alt arrow up", () => {});
  it("moves the current node after the next visible sibling with alt arrow down", () => {});
  it("moves a first child up into the previous parent sibling when it preserves structure", () => {});
  it("outdents a first child above its parent when no previous parent sibling exists", () => {});
  it("moves a last child down into the next parent sibling when it preserves structure", () => {});
  it("outdents a last child below its parent when no next parent sibling exists", () => {});
  it("does nothing when moving the first visible node up", () => {});
  it("does nothing when moving the root-level last visible node down", () => {});
  it("moves a collapsed subtree as one visible block", () => {});
});
```
