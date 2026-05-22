# Phase 17: Obsidian식 링크와 전역 탐색 - 예정

Stage 1 Product Core의 두 번째 Phase다. 목표는 다중 문서 workspace 위에서 Obsidian식 링크 생성, 해결, 이동, backlink를 제품 경험으로 완성하는 것이다.

### 목표

- `[[Document]]`는 문서 링크로 해석한다.
- `[[Document^Node]]`는 문서 내부 노드 링크로 해석한다.
- 없는 문서는 picker에서 명시적 `Create document "..."` action으로 만든다.
- 링크 source text는 보존하되 저장 target은 stable id를 사용한다.

### 링크 정책

- 사용자는 제목으로 링크하지만 시스템은 id로 저장한다.
- `OutlineLink.target`은 `{ kind: "document"; documentId }` 또는 `{ kind: "node"; documentId; nodeId }` 형태다.
- `^Node`는 영구 anchor text가 아니라 노드 후보 검색어다.
- 문서명 중복은 허용하되 picker는 path, 최근 수정일, preview로 구분한다.
- broken link는 `missing document`, `missing block`, `ambiguous title`을 구분한다.

### 먼저 작성할 테스트

- `[[Project]]` 선택 시 document id 기반 링크가 저장되고 rename 후에도 유지된다.
- `[[Project^Auth flow]]` 선택 시 document id와 node id가 저장된다.
- 후보가 없을 때 create action으로 새 문서를 만들고 현재 source에 연결한다.
- 같은 제목 문서가 여러 개일 때 자동 resolve하지 않고 선택을 요구한다.
- document backlinks와 block backlinks가 분리되어 계산된다.
- `Ctrl+P` 전역 검색은 문서와 노드를 함께 찾고, `[[` picker는 링크 resolve/create에 집중한다.

### 구현 항목

- workspace-aware link parser와 link candidate selector
- document candidate, block candidate, create action을 포함한 picker
- document backlinks / block backlinks selector
- inactive row의 document link와 block link 렌더링
- command palette의 workspace-wide document/node search
- 기존 `targetNodeId` 링크를 현재 문서의 node target으로 승격하는 migration

### 완료 기준

- 사용자는 링크를 통해 문서와 문서 내부 노드 사이를 키보드 중심으로 오갈 수 있다.
- 없는 문서를 링크 작성 흐름 안에서 만들 수 있다.
- 링크, backlinks, broken link가 문서 rename과 노드 rename에 안정적이다.

### 보류

- graph view, transclusion/embed, aliases, folders, attachments는 Stage 3 이후 확장으로 둔다.
