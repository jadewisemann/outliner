# Phase 4: 벌크 편집 - 완료됨

### 목표

Dynalist식 빠른 구조 편집을 위해 멀티라인 붙여넣기, 다중 노드 선택, 선택 범위 일괄 명령, clipboard round-trip을 구현한다.

### 완료된 산출물

- `parseIndentedText`
- `insertNodesFromText`
- `selectVisibleRange`
- `normalizeTopLevelSelection`
- `bulkIndentNodes`
- `bulkOutdentNodes`
- `bulkDeleteNodes`
- `bulkToggleCollapse`
- `serializeNodesForClipboard`
- range selection state
- Lexical paste/copy keyboard bridge
- 선택 범위 하이라이트
- bulk editing E2E

### 완료 기준

- 멀티라인 paste가 indentation 구조를 유지한다.
- `Shift+ArrowUp/Down`, `Tab`, `Shift+Tab`, `Backspace/Delete`, copy/paste 벌크 흐름이 컴포넌트 테스트로 검증된다.
- Playwright에서 여러 줄 붙여넣기와 선택 범위 들여쓰기/삭제가 통과한다.
- 벌크 명령은 단일 노드 명령과 같은 domain model 위에서 동작한다.
