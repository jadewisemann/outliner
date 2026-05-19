# 11. 확정된 제품 방향과 남은 구조 검증

확정:

- 원격 sync는 optional `RemoteStore` adapter 뒤에서 동작한다.
- Firebase Realtime Database는 현재 구현된 adapter이지만 Phase 12에서 기본 저장소 여부를 재검토한다.
- 모바일 앱은 웹 MVP 이후로 분리한다.
- MVP는 플레인 텍스트와 키보드 속도를 우선한다.
- Dynalist식 벌크 편집은 MVP 핵심 범위에 포함한다.
- 파일/폴더/다중 문서 시스템은 제품 범위에서 제외한다.
- 태스크 관리 기능은 제품 범위에서 제외한다.
- 공유/협업 범위는 제외하고 개인 다기기 동기화만 유지한다.
- MVP 이후 기능은 검색, 태그/내부 링크/백링크, 리치 포맷/노트, 원격 sync 비용 안정화, import/export 확장, 히스토리/백업/설정 순서로 검토한다.

검증 필요:

- 검색/태그/링크를 selector 재계산으로 충분히 처리할 수 있는지, 별도 인덱스가 필요한지
- 리치텍스트 단계에서 Lexical custom node 또는 `@lexical/yjs` 중심 구조가 필요한지
- snapshot 기반 Yjs adapter가 10,000개 노드, Undo/Redo, 원격 sync 비용에서 충분한지
- 모바일 단계에서 IndexedDB를 유지할지 SQLite로 전환할지
