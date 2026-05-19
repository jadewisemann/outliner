# 10. 성능 전략

- visible node list는 memoized selector로 계산한다.
- 접힌 subtree는 flatten 대상에서 제외한다.
- 줌인 상태에서는 zoom root의 subtree만 계산한다.
- 대량 문서는 virtual list로 렌더링한다.
- 입력 중 전체 tree object를 매번 새로 만들지 않도록 변경 범위를 제한한다.
- 다중 선택과 벌크 명령은 visible node list를 재사용하고, 전체 tree traversal을 반복하지 않는다.
