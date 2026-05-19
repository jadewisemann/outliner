# Phase 9: 검색과 필터 - 완료됨

### 목표

단일 workspace 안에서 텍스트를 빠르게 찾고, 검색 결과를 outline 문맥 또는 flat 목록으로 탐색한다. 파일/문서 전체 검색은 제품 범위가 아니며, 현재 root workspace 안의 노드 검색만 다룬다.

### 먼저 작성할 테스트

- 현재 zoom root 안에서 text substring이 포함된 노드를 찾는다. - 완료됨
- 접힌 subtree 내부의 match도 검색 결과에는 포함된다. - 완료됨
- 검색 결과로 이동하면 해당 노드가 선택되고 필요한 조상 collapse 상태가 해제된다. - 완료됨
- flat search view에서는 match node만 순서대로 표시하되, 원래 depth와 breadcrumb context를 유지한다. - 완료됨
- 10,000개 노드에서 기본 검색이 사용 가능한 시간 안에 끝난다. - 완료됨

### 구현 항목

- `searchOutline(document, query, options)` selector - 완료됨
- search UI와 query state - 완료됨
- result navigation: next/previous match - 완료됨
- outline context view와 flat result view - 완료됨
- collapsed ancestor reveal command - 완료됨
- 검색 성능 기준과 인덱싱 도입 조건 문서화 - 완료됨

### 완료 기준

- 사용자가 키보드로 검색을 열고 결과 사이를 이동할 수 있다.
- 접힌 항목 내부 텍스트도 잃지 않고 찾을 수 있다.
- 검색 상태는 편집 command, 줌인, Undo/Redo와 충돌하지 않는다.
