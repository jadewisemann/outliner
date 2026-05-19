# Phase 8: 성능과 가상화 - 완료됨

### 목표

대량 노드 문서에서 화면에 보이는 노드만 효율적으로 계산하고 렌더링한다. active row만 Lexical을 마운트한다는 원칙은 유지한다.

### 먼저 작성할 테스트

- 10,000개 노드 fixture에서 visible node 계산이 제한 시간 안에 끝난다. - 완료됨
- 접힘 상태가 대량 fixture에서도 정확히 반영된다. - 완료됨
- 줌인 상태에서는 해당 subtree만 visible list에 포함된다. - 완료됨
- typing 중 active row 외 전체 row가 불필요하게 다시 렌더링되지 않는다. - 완료됨

### 구현 항목

- 대량 outline fixture generator - 완료됨
- visible node selector traversal 안정화 - 완료됨
- virtual list 적용 - 기본 렌더링 완료
- active row Lexical mount count 검증 - 완료됨
- browser-backed remote sync E2E - 완료됨
- Firebase-backed remote sync smoke - 완료됨
- render profiling 기준 정리 - 완료됨

### 완료 기준

- 10,000개 노드 fixture에서 사용 가능한 성능을 보인다.
- 입력 시 전체 트리를 불필요하게 재렌더링하지 않는다.
- 50,000개 노드 목표를 막는 구조적 병목은 원격 sync 비용 안정화와 import/export 이후 profiling에서 재평가한다.
