# Phase 1: 순수 아웃라인 도메인 - 완료됨

### 목표

UI와 외부 라이브러리 없이 아웃라이너 트리 조작 규칙을 확정한다.

### 완료된 산출물

- normalized outline tree
- root 불변성, create, split, indent, outdent, collapse command
- visible node selector
- breadcrumb selector
- deterministic test factory

### 완료 기준

- 도메인 단위 테스트가 통과한다.
- UI 없이 편집 규칙 대부분을 검증할 수 있다.
- 경계 조건 테스트가 포함되어 있다.
