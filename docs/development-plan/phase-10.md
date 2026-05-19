# Phase 10: 태그, 내부 링크, 백링크 - 완료됨

### 목표

플레인 텍스트 기반 작성 속도를 유지하면서 `#tag`, `@tag`, `[[internal link]]`를 인식해 지식관리 탐색성을 높인다. 태그와 링크는 태스크 기능이 아니며 due date, checkbox, collaborator mention과 연결하지 않는다.

### 먼저 작성할 테스트

- 노드 텍스트에서 `#tag`와 `@tag` 토큰을 추출한다. - 완료됨
- tag filter가 해당 태그를 포함한 노드만 찾는다. - 완료됨
- `[[...]]` 링크 삽입 후보가 같은 workspace의 노드에서 검색된다. - 완료됨
- internal link는 node id를 대상으로 저장되어 대상 노드 text가 바뀌어도 깨지지 않는다. - 완료됨
- 특정 노드의 backlinks를 계산한다. - 완료됨
- 삭제된 노드를 가리키는 링크는 broken link 상태로 표시된다. - 완료됨

### 구현 항목

- tag/link parser와 selector - 완료됨
- node id 기반 link metadata - 완료됨
- tag list/tag filter UI - 완료됨
- internal link autocomplete UI - 완료됨
- backlink panel 또는 inline reference section - 완료됨
- broken link 표시와 selector - 완료됨

### 완료 기준

- 태그로 관련 노드를 빠르게 모아볼 수 있다.
- 다른 노드로 향하는 링크를 키보드 중심으로 삽입하고 이동할 수 있다.
- backlinks가 local-first 저장, sync, export에 포함된다.
