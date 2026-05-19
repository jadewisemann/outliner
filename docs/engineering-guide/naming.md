# 3. 명명 규칙

- command 함수는 동사로 시작한다.
  - `createNodeAfter`
  - `splitNode`
  - `indentNode`
  - `outdentNode`
  - `toggleCollapse`
  - `bulkIndentNodes`
  - `bulkOutdentNodes`
  - `bulkDeleteNodes`
- selector 함수는 관찰 결과를 이름에 드러낸다.
  - `getVisibleNodes`
  - `getBreadcrumbPath`
  - `getNodeDepth`
- adapter는 외부 시스템 이름을 포함한다.
  - `lexicalAdapter`
  - `yjsAdapter`
  - `firebaseRemoteStore`
