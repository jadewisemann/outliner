# 벌크 편집 테스트

```ts
describe("bulk outline commands", () => {
  it("parses indented multiline text into outline drafts", () => {});
  it("inserts pasted multiline text while preserving indentation", () => {});
  it("selects a visible range with shift arrow navigation", () => {});
  it("excludes hidden descendants from range selection", () => {});
  it("normalizes nested selections to top-level selected subtrees", () => {});
  it("indents selected sibling blocks while preserving order", () => {});
  it("outdents selected sibling blocks while preserving order", () => {});
  it("moves selected sibling blocks up while preserving order", () => {});
  it("moves selected sibling blocks down while preserving order", () => {});
  it("keeps range selection after moving selected blocks", () => {});
  it("deletes selected top-level subtrees", () => {});
  it("serializes selected nodes as indented plain text", () => {});
});
```
