# 결정 기록 Index

확정된 제품/기술 결정을 찾는 입구다. 결정을 바꾸거나 새 결정을 내리면 ADR 파일을 추가한다.

## 어디서 찾을까

- [ADR-001: Local-First를 기본 철학으로 한다](./adr-001.md)
- [ADR-002: TDD를 기본 개발 방식으로 한다](./adr-002.md)
- [ADR-003: 원격 동기화는 snapshot + updates 구조를 사용한다](./adr-003.md)
- [ADR-004: 외부 라이브러리는 adapter로 격리한다](./adr-004.md)
- [ADR-005: 원격 저장소 선택](./adr-005.md)
- [ADR-006: 모바일 persistence 전략](./adr-006.md)
- [ADR-007: Lexical 모델링 방식](./adr-007.md)
- [ADR-008: MVP는 플레인 텍스트와 키보드 속도를 우선한다](./adr-008.md)
- [ADR-009: 협업 범위는 개인 다기기 동기화로 제한한다](./adr-009.md)
- [ADR-010: 자식 있는 빈 노드 Backspace는 자식을 승격한다](./adr-010.md)
- [ADR-011: Dynalist식 벌크 편집을 MVP 핵심 범위에 포함한다](./adr-011.md)
- [ADR-012: MVP Yjs 모델은 OutlineSnapshot adapter를 우선한다](./adr-012.md)
- [ADR-013: 원격 동기화는 선택적 RemoteStore 주입으로 연결한다](./adr-013.md)
- [ADR-014: 키보드 파워 편집은 visible order 기반 domain command로 구현한다](./adr-014.md)
- [ADR-015: Dynalist 격차 축소 범위](./adr-015.md)
- [ADR-016: 원격 sync 비용 안정화를 import/export보다 우선한다](./adr-016.md)
- [ADR-017: 원격 저장소는 realtime보다 저비용 개인 sync를 우선한다](./adr-017.md)

## TODO / 확인 포인트

- [ ] Phase 12-C 저장소 또는 sync protocol 결정이 나면 새 ADR로 남긴다.
- [ ] 기존 ADR을 뒤집는 경우 새 ADR에서 supersedes 관계를 명시한다.
