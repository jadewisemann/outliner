# Phase 15.5: 아웃라이닝 앱 폴리시와 타입라이터 스크롤

Phase 15.5는 Phase 15 파워 유저 기능 위에 실제 아웃라이닝 앱처럼 오래 쓰기 좋은 화면 밀도와 포커스 유지 경험을 얹는 보강 단계다. Phase 16의 다중 문서/workspace 모델로 넘어가기 전에 단일 문서 편집 화면의 질을 먼저 마감한다.

## 목표

- 첫 화면을 랜딩 페이지나 데모가 아니라 실제 작업 중인 아웃라이너처럼 보이게 한다.
- 편집 화면의 시각적 우선순위를 문서 본문, 선택 노드, 키보드 조작 피드백에 둔다.
- 현재 포커스 노드를 화면 중앙 근처에 유지하는 타입라이터 스크롤을 설정에서 켜고 끌 수 있게 한다.
- 타입라이터 스크롤 기준점을 화면 중앙에서 위/아래로 옮길 수 있는 offset 설정을 제공한다.
- 설정 변경은 preferences에만 저장하고 outline undo/redo stack에는 넣지 않는다.

## 디자인 범위

- 상단 chrome은 compact하게 유지하고, 문서 편집 영역을 화면의 주 경험으로 만든다.
- 반복 노드 row는 밀도 있게 읽히되 active, selected, power selection 상태는 명확히 구분한다.
- toolbar와 상태 정보는 실제 편집 도구처럼 스캔 가능하게 정리한다.
- settings modal은 기존 구조를 유지하되 Editor 섹션에 타입라이터 스크롤 설정을 추가한다.
- 마케팅성 hero, 장식용 그래픽, 큰 카드형 소개 영역은 만들지 않는다.

## 타입라이터 스크롤 동작

- 새 preferences 필드:
  - `typewriterScrollEnabled: boolean`
  - `typewriterScrollOffsetPx: number`
- 기본값:
  - `typewriterScrollEnabled`는 `false`다. 기존 사용자의 스크롤 습관을 갑자기 바꾸지 않는다.
  - `typewriterScrollOffsetPx`는 `0`이다.
- offset 범위:
  - `-240`부터 `240`까지 허용한다.
  - 음수는 포커스 노드를 화면 중앙보다 위에 둔다.
  - 양수는 포커스 노드를 화면 중앙보다 아래에 둔다.
- 스크롤 기준:
  - 타입라이터 스크롤이 켜져 있고 selected/focused node가 바뀌면 editor scroll container가 움직인다.
  - 목표 위치는 `scroll container center + typewriterScrollOffsetPx`다.
  - 실제 scrollTop은 컨테이너의 최소/최대 스크롤 범위로 clamp한다.
- 전역 UI와의 관계:
  - command palette, settings modal 진입은 선택 노드 상태를 불필요하게 지우지 않는다.
  - Escape의 기존 power selection 해제 정책은 유지한다.
  - 타입라이터 스크롤은 문서 내용을 바꾸지 않으며 undo/redo action으로 기록되지 않는다.

## 먼저 작성할 테스트

- preferences normalize가 새 필드를 기본값으로 보강하고 offset을 허용 범위로 clamp한다.
- Settings > Editor에서 타입라이터 스크롤 toggle과 offset 입력이 preferences에 반영된다.
- 타입라이터 스크롤이 꺼져 있으면 selected node 변경만으로 scrollTop이 바뀌지 않는다.
- 타입라이터 스크롤이 켜져 있으면 selected node의 row center가 `container center + offset`에 맞춰진다.
- offset이 음수/양수일 때 계산 방향이 안정적이다.
- 스크롤 목표가 문서 위/아래 범위를 넘으면 clamp된다.
- 기존 keyboard navigation, multi-cursor, command palette 테스트가 계속 통과한다.

## 구현 순서

- [x] Phase 15.5 명세 문서를 추가하고 개발 계획 index에 연결한다.
- [x] preferences 타입, 기본값, normalize, settings UI를 추가한다.
- [x] Outliner에 타입라이터 스크롤 계산과 테스트를 추가한다.
- [x] 실제 아웃라이닝 앱에 맞게 shell, toolbar, outline list, row 상태 스타일을 정리한다.
- [x] 문서 완료 상태를 갱신하고 전체 테스트를 통과시킨다.

## 완료 기준

- 타입라이터 스크롤은 설정에서 켜고 끌 수 있으며 offset 값이 즉시 반영된다.
- 기능 설정은 preferences/local persistence 경로로 저장되고 outline undo/redo에는 영향을 주지 않는다.
- 디자인은 단일 문서 편집 앱처럼 본문 중심으로 보이며, 기존 기능 버튼과 상태 표시를 잃지 않는다.
- Phase 15.5 테스트와 기존 regression suite가 통과한다.
