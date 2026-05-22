# Phase 11: 리치 포맷과 노트 - 완료됨

### 목표

작성 중에는 Markdown-like source를 유지하고, inactive row에서는 읽기 좋은 렌더링을 제공한다. TODO list, date, recurring date, calendar sync는 이 Phase에서도 제외한다. `[]`/`[*]` source marker 기반 완료 표시는 task metadata 없이 다룬다.

### 먼저 작성할 테스트

- inactive row가 bold, italic, inline code, strikethrough, link를 렌더링한다. - 완료됨
- active row는 원본 Markdown-like source를 편집한다. - 완료됨
- heading, color label 속성이 노드 단위로 저장되고 export에 반영된다. numbered list는 Phase 15에서 제품 범위에서 제외하기로 결정했다. - 완료됨
- note 필드가 node text와 별도로 저장되고 접기/펼치기 표시 상태를 가진다. - 완료됨
- 리치 포맷이 indent/outdent, move, bulk selection, paste와 충돌하지 않는다. - 완료됨

### 구현 항목

- `OutlineNode` metadata 확장: `note`, `noteVisible`, `heading`, `color`; `numbered`는 legacy field로만 남긴다. - 완료됨
- Markdown-like inline renderer - 완료됨
- link/image link preview 전략 - 기본 링크 렌더링 완료
- LaTeX 렌더링 adapter 검토 - 후속 확장으로 보류
- note editor와 note visibility setting - 완료됨
- Lexical custom node 또는 row-level renderer 유지 여부 재평가 - row-level renderer 유지

### 완료 기준

- 리치 표시가 구조 편집의 속도와 키보드 흐름을 해치지 않는다.
- 저장 모델이 plain text MVP 데이터를 migration 없이 읽을 수 있다.
- formatting command는 Undo/Redo와 sync에 하나의 사용자 action으로 기록된다.
