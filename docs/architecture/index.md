# 아키텍처 Index

구조 판단이 필요할 때 여기를 먼저 읽는다. 전체 아키텍처를 한 번에 열지 말고 작업 대상 레이어만 따라간다.

## 어디서 찾을까

- [설계 목표](./goals.md): 아키텍처 원칙
- [계층 구조](./layers.md): UI, editor adapter, domain, Yjs, persistence/sync 책임
- [도메인 모델](./domain-model.md): OutlineDocument, ViewState, 후속 확장 모델
- [벌크 편집 구조](./bulk-editing.md): 다중 선택, paste/copy, bulk command 경계
- [키보드 파워 편집 구조](./keyboard-power-editing.md): node/range move와 multi cursor 구조
- [Yjs 구조](./yjs.md): snapshot 기반 Yjs workspace 전략
- [원격 동기화 구조](./remote-sync.md): RemoteStoreV2와 Phase 12 비용 전략
- [Sync 상태](./sync-status.md): local-only/offline/syncing/synced/error/conflict
- [주요 인터페이스](./interfaces.md): RemoteStore 초안
- [오프라인 큐](./offline-queue.md): 실패 update queue 정책
- [성능 전략](./performance.md): visible selector, virtual list, 대량 문서 전략
- [제품 방향과 검증](./decisions-and-open-questions.md): 확정 방향과 남은 구조 검증

## TODO / 확인 포인트

- [ ] Phase 12-C에서 full snapshot bandwidth를 줄이는 저장소 또는 sync protocol을 결정한다.
- [ ] 리치텍스트가 커지면 Lexical custom node 또는 @lexical/yjs 중심 구조가 필요한지 재검토한다.
- [ ] 모바일 단계에서 IndexedDB 유지 또는 SQLite 전환을 검증한다.
