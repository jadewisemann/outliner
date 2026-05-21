# Outliner 개발 문서

이 폴더는 Local-First Outliner를 개발할 때 필요한 기준 문서 모음이다. 다음 agent는 먼저 이 파일과 관련 폴더의 `index.md`만 읽고, 필요한 세부 문서만 추가로 열면 된다. 폴더 전체를 한 번에 훑지 않는다.

## 빠른 길잡이

- 제품 범위와 사용자 관찰 동작: [requirements/index.md](./requirements/index.md)
- 구현 구조와 adapter 경계: [architecture/index.md](./architecture/index.md)
- 현재 개발 우선순위와 Phase 상태: [development-plan/index.md](./development-plan/index.md)
- 테스트 우선순위와 작성 규칙: [testing-strategy/index.md](./testing-strategy/index.md)
- 개발 규칙과 Definition of Done: [engineering-guide/index.md](./engineering-guide/index.md)
- 확정된 의사결정 기록: [decisions/index.md](./decisions/index.md)

## 다음 agent 시작 순서

1. [development-plan/index.md](./development-plan/index.md)에서 현재 최우선 Phase를 확인한다.
2. 작업 대상 기능이 어느 요구사항에 속하는지 [requirements/index.md](./requirements/index.md)에서 찾는다.
3. 관련 아키텍처 조각만 [architecture/index.md](./architecture/index.md)에서 열어본다.
4. 테스트를 먼저 추가할 때 [testing-strategy/index.md](./testing-strategy/index.md)의 해당 스키마만 참고한다.
5. 제품/기술 결정을 바꾸면 [decisions/index.md](./decisions/index.md)에 남긴다.

## Index-first 탐색 규칙

- 시작점은 항상 이 파일이고, 다음 단계는 작업 성격에 맞는 폴더의 `index.md`다.
- `index.md`가 가리키는 세부 문서 중 현재 작업에 직접 필요한 파일만 연다.
- `rg --files docs` 같은 전체 목록 확인은 구조 파악에만 쓰고, 내용을 읽을 때는 index 링크를 따라간다.
- 새 문서를 추가하면 해당 폴더의 `index.md`에 길찾기 문장과 TODO를 함께 반영한다.

## TODO / 작업 큐

- [x] Phase 12-C: full snapshot write/read bandwidth 비용을 줄이는 patch 기반 sync protocol 완성
- [x] Phase 13: OPML과 indentation plain text import/export 확장
- [x] Phase 14: 히스토리, 백업, 사용자 설정
- [x] Phase 15: 웹 버전 고도화와 Dynalist 대안 기능
- [x] Phase 15.5: 아웃라이닝 앱 폴리시와 타입라이터 스크롤
- [ ] Phase 16: 데스크톱 앱과 계정 기능 명세 구체화
- [ ] Phase 17: 모바일 패키징은 웹/데스크톱 이후 별도 검증

## 문서 유지 규칙

- 각 폴더의 `index.md`는 길찾기와 TODO만 담고, 세부 내용은 하위 문서로 분리한다.
- 구현과 문서가 어긋나면 같은 작업에서 함께 수정한다.
- 결정되지 않은 내용은 암묵적으로 구현하지 않고 `확정 필요` 또는 TODO로 표시한다.
- 테스트가 제품 동작을 정의한다. 요구사항 변경은 테스트 변경을 동반해야 한다.
