# Phase 3: Lexical 통합 - 완료됨

### 목표

텍스트 편집 경험을 Lexical로 옮기고, 도메인 command와 충돌 없이 연결한다.

### 완료된 산출물

- active row Lexical editor
- inactive row plain text render
- Lexical command bridge
- markdown auto-transform 미연결
- active row text sync와 focus 안정화

### 완료 기준

- 선택된 row만 Lexical editor를 마운트한다.
- 텍스트 편집과 트리 command가 함께 동작한다.
- `- `, `* `, `# ` 입력은 플레인 텍스트로 유지된다.
