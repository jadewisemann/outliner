# Phase 15: 웹 버전 고도화와 파워 유저 기능

### 목표

Dynalist의 실질적인 대안이 되기 위해 웹 버전의 편집 깊이, 탐색 속도, 개인화 가능성을 강화한다. 모바일 패키징보다 먼저 웹 앱 자체의 핵심 사용성을 견고하게 만든다.

### 제품 범위

- Custom CSS 적용
- Rich text format 확장
- Command palette와 전역 검색
- 노드 메모 작성
- 줄바꿈과 멀티라인 편집
- 멀티 커서 편집 고도화
- LaTeX 지원
- 단축키 커스터마이징 확장
- 설정 창 정리

### 먼저 작성할 테스트

- 사용자가 Custom CSS를 저장하면 outline editor 영역에 적용되고, 잘못된 CSS가 앱 전체를 깨뜨리지 않는다.
- Rich text mark와 block format이 저장/복원/export 흐름에서 유지된다.
- `Ctrl+P` 또는 플랫폼별 동등 단축키가 command palette/global search를 열고, 명령과 노드를 키보드만으로 실행/이동할 수 있다.
- `Shift+Enter`가 현재 노드의 note editor를 열거나 note 입력으로 포커스를 이동한다.
- `Ctrl+Enter`가 현재 노드 본문 안에 새 줄을 삽입하며, 일반 `Enter`의 새 노드 생성 동작과 충돌하지 않는다.
- 여러 선택/커서에서 indent, outdent, move, delete, text insert 같은 핵심 편집 명령이 일관되게 적용된다.
- inline LaTeX와 block LaTeX가 저장/렌더링되고, 원문 편집으로 되돌아갈 수 있다.
- 사용자가 단축키를 변경하면 command registry가 새 keymap을 사용하고, 충돌하는 단축키를 감지한다.
- 설정 창에서 편집, 표시, 단축키, Custom CSS, 계정/동기화 준비 항목을 탐색할 수 있다.

### 구현 항목

- [x] Custom CSS
  - [x] CSS 입력/저장 UI를 설정 창에 추가한다.
  - [x] 적용 범위를 editor root 또는 app theme layer로 제한한다.
  - [x] CSS 비활성화, 초기화, 오류 표시를 제공한다.
- [ ] Rich text format 확장
  - heading
  - strikethrough
  - text color
  - inline code
  - code block
  - 기존 bold/italic/link 등과 함께 command registry에 통합한다.
- [ ] Command palette와 전역 검색
  - [x] `Ctrl+P` 기본 단축키를 추가한다.
  - [ ] 명령 실행, 노드 검색, 최근 문서/최근 노드 이동을 같은 palette에서 처리한다.
  - [ ] 검색 결과는 키보드 이동, preview, 현재 노드로 점프를 지원한다.
- [ ] 노드 메모
  - [x] `Shift+Enter`로 현재 노드의 note를 생성/편집한다.
  - [x] note는 본문과 분리된 보조 텍스트로 저장한다.
  - 접기/검색/export에서 note 포함 정책을 명확히 한다.
- [ ] 멀티라인 편집
  - [x] `Ctrl+Enter`로 노드 본문 안에 새 줄을 삽입한다.
  - plain text import/export에서 노드 경계와 본문 줄바꿈을 구분한다.
- [ ] 멀티 커서 편집 고도화
  - 여러 노드에서 동시 텍스트 입력/삭제를 지원한다.
  - 선택 범위와 커서 집합의 Undo/Redo 단위를 정의한다.
  - bulk operation과 충돌하지 않게 command 실행 경로를 정리한다.
- [ ] LaTeX 지원
  - inline LaTeX와 block LaTeX syntax를 정의한다.
  - 렌더링 라이브러리 도입 여부를 결정한다.
  - 접근성 label과 원문 편집 fallback을 제공한다.
- [ ] 단축키 커스터마이징
  - 모든 command에 사용자 지정 shortcut을 연결할 수 있게 한다.
  - reserved shortcut, OS별 shortcut, 충돌 shortcut을 구분한다.
  - 기본값 복원과 export/import를 제공한다.
- [ ] 설정 창
  - [x] Preferences를 한 화면이 아니라 섹션형 settings dialog로 정리한다.
  - [x] General, Editor, Appearance, Shortcuts, Custom CSS, Sync/Account 준비 섹션을 둔다.
  - [x] 설정 변경은 outline document Undo/Redo stack에 들어가지 않게 유지한다.

### 완료 기준

- 웹 앱에서 장시간 outline 작성, 탐색, 서식화, 검색, 개인화가 키보드 중심으로 가능하다.
- 사용자는 Dynalist에서 기대하는 핵심 파워 기능을 큰 마찰 없이 사용할 수 있다.
- Custom CSS와 keymap 변경이 문서 데이터와 분리되어 저장되고, 백업/복원 정책이 명확하다.
- Phase 16 데스크톱 앱과 Phase 17 모바일 패키징 전에 editor command/settings 구조가 안정화된다.

### 구현 메모

- Phase 11의 리치 포맷 v1은 selector/metadata 기반으로 완료된 상태지만, Phase 15에서는 실제 사용자-facing format command와 편집 UI까지 확장한다.
- Custom CSS는 생산성 기능이지만 앱 안정성 리스크가 있으므로, 적용 범위 제한과 reset escape hatch를 우선한다.
- Command palette는 검색 UI와 command registry를 연결하는 중심 진입점이다. 이후 데스크톱 앱 메뉴, 계정 기능, 모바일 command surface에서도 재사용할 수 있게 설계한다.
