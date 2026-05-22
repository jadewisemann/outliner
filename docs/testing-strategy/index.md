# 테스트 전략 Index

TDD 루프와 테스트 스키마를 찾는 입구다. 구현할 기능과 가장 가까운 스키마만 열어 테스트 이름을 먼저 고정한다.

## 어디서 찾을까

- [TDD 루프](./tdd-loop.md): Red/Green/Refactor 기본 흐름
- [테스트 피라미드](./test-pyramid.md): 현재 통과 영역과 다음 테스트 우선순위
- [테스트 파일 구조](./file-structure.md): 권장 테스트 파일 배치
- [테스트 작성 규칙](./rules.md): 테스트 이름, fake, Firebase, Playwright 규칙
- [권장 명령](./commands.md): 로컬에서 실행할 테스트 명령
- [CI 후보](./ci-candidates.md): CI에서 강제할 명령 후보

## 테스트 스키마

- [도메인 테스트](./schema-domain.md)
- [Workspace 테스트](./schema-workspace.md)
- [벌크 편집 테스트](./schema-bulk-editing.md)
- [멀티 커서 테스트](./schema-multi-cursor.md)
- [Visible node 테스트](./schema-visible-nodes.md)
- [Persistence 테스트](./schema-persistence.md)
- [Yjs와 Undo/Redo 테스트](./schema-yjs-undo-redo.md)
- [Sync 테스트](./schema-sync.md)
- [E2E 테스트](./schema-e2e.md)
- [MVP 이후 기능 테스트](./schema-post-mvp.md)

## TODO / 다음 테스트 우선순위

- [x] Remote sync Phase 12-C: full-snapshot write/read bandwidth budget 테스트
- [x] OPML import/export round-trip
- [ ] 50,000 node 병목 profiling
- [ ] Phase 16 persistence/history/backup workspace schema 보존 테스트
- [ ] 히스토리/설정 E2E smoke
- [ ] 모바일 persistence adapter 계약 테스트
