# 5. 비기능 요구사항

- Cold start: 로컬 문서 1초 이내 표시
- Scale target: MVP 수용 기준은 10,000개 노드, 구조 설계 목표는 50,000개 노드
- Reliability: 오프라인 편집 후 재연결 시 변경 유실 없음
- Testability: 핵심 트리 조작은 UI 없이 단위 테스트 가능
- Maintainability: 외부 라이브러리 호출은 adapter로 격리
