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
- 사용자가 노드 본문에서 `# `, `## `, `### `를 입력하고 Space를 누르면 Markdown처럼 heading 1/2/3으로 변환되고 marker는 본문에서 제거된다.
- heading 노드는 inactive row뿐 아니라 active editor에서도 WYSIWYG로 보이며, 편집 중 텍스트 크기/굵기가 heading level을 반영한다.
- 사용자가 `==highlight==` 또는 `== highlight ==` 형태로 입력하면 inactive row에서 형광펜 mark로 렌더링되고, 편집 중에는 원문으로 되돌아갈 수 있다.
- `Ctrl+P` 또는 플랫폼별 동등 단축키가 command palette/global search를 열고, 명령과 노드를 키보드만으로 실행/이동할 수 있다.
- `Shift+Enter`가 현재 노드 바로 아래의 Dynalist-style note editor를 열고 note 입력으로 포커스를 이동하며, note 입력에서 다시 `Shift+Enter`를 누르면 note editor를 닫고 노드 본문 편집으로 돌아간다.
- `Ctrl+Enter`가 현재 노드 본문 안에 새 줄을 삽입하며, 일반 `Enter`의 새 노드 생성 동작과 충돌하지 않는다.
- 노드 본문에서 `Enter`로 새 노드를 만들면 새 노드가 active row가 되고, 브라우저의 실제 caret과 selection anchor가 새 노드 editor 안에 있어야 한다.
- 여러 선택/커서에서 indent, outdent, move, delete, text insert 같은 핵심 편집 명령이 일관되게 적용된다.
- 멀티라인 paste는 하나의 outline structure transaction으로 처리되며, 중간 Lexical DOM 변화가 문서 Undo/Redo stack에 별도 텍스트 transaction으로 들어가지 않는다.
- inline LaTeX와 block LaTeX가 저장/렌더링되고, 원문 편집으로 되돌아갈 수 있다.
- 사용자가 단축키를 변경하면 command registry가 새 keymap을 사용하고, 충돌하는 단축키를 감지한다.
- 설정 창에서 편집, 표시, 단축키, Custom CSS, 계정/동기화 준비 항목을 탐색할 수 있다.

### 구현 항목

- [x] 2026-05-20 사용자 피드백 반영
  - `Shift+Enter`는 현재 노드의 note editor 접근/복귀 전용 단축키다.
  - [x] `Ctrl+Enter`/`Cmd+Enter`는 커서 위치와 무관하게 현재 노드 바로 아래에 같은 부모를 가진 형제 노드를 만든다. 본문 내부 줄바꿈 단축키로 쓰지 않는다.
  - [x] note 접근과 형제 노드 생성 단축키는 Settings의 Shortcuts에서 사용자가 변경할 수 있어야 한다.
  - [x] 메모는 전역 표시 토글이 꺼져 있으면 보이지 않는다. 전역 표시 토글이 켜져 있고 note 내용이 있으면 기본적으로 plain text preview로 보인다.
  - [x] note는 보기 상태에서 textarea처럼 보이면 안 된다. 사용자가 `Shift+Enter` 등으로 편집에 진입했을 때만 textarea editor가 나타난다.
  - [x] Settings는 editor 상단에 펼쳐지는 인라인 패널이 아니라 프로덕션 앱처럼 backdrop을 가진 modal dialog로 열린다.
  - [x] 화면에 항상 노출되는 검색창은 제거한다. `Ctrl+P`/`Cmd+P`는 기본적으로 노드 검색 palette를 열고, 입력 맨 앞의 `>`가 command mode를 의미한다.
  - [x] `Ctrl+Shift+P`/`Cmd+Shift+P`는 바로 command mode palette를 연다.
  - [x] Heading은 사용자에게 마법처럼 보이면 안 된다. 편집 중에는 Markdown source처럼 `# `, `## `, `### ` marker가 보여야 하며, 사용자가 marker를 지우면 일반 노드로 돌아가야 한다.
  - [x] 내부 구현은 metadata를 유지할 수 있지만, 사용자 조작 모델은 WYSIWYG-only가 아니라 Markdown을 직접 만지는 수동적인 감각을 우선한다.
- [x] 2026-05-20 추가 편집 피드백 반영
  - [x] `numbered` 노드 기능은 현재 제품 범위에서 제외한다. 기존 데이터 필드가 남아 있더라도 UI, inactive row 렌더링, Markdown/OPML export/import 표면에서는 numbered list로 드러나지 않게 한다.
  - [x] 노드 본문 또는 note에서 위/아래 방향키로 노드를 이동할 때 사용자의 커서 수평 위치를 유지한다.
  - [x] 커서 수평 위치는 `현재 노드 시작부터 커서 문자까지의 거리 + node depth * indent size`로 계산한다. 현재 CSS indent size는 24px이며, 텍스트 offset 단위와 합산해 안정적인 column intent로 사용한다.
  - [x] 위/아래 이동을 반복하는 동안에는 최초 수평 위치를 계속 유지한다. 사용자가 좌우 방향키, 마우스 클릭, Home/End, 텍스트 입력처럼 수평 위치를 변경하는 이벤트를 만들 때에만 기억된 수평 위치를 갱신한다.
  - [x] 대상 노드의 `depth * indent size + text length`가 기억된 수평 위치보다 작으면 대상 노드의 맨 뒤에 커서를 둔다. 기억된 수평 위치가 대상 노드 시작보다 왼쪽이면 offset 0으로 둔다.
  - [x] 노드 이동 후 새 active editor가 렌더되는 동안 포커스와 selection을 짧게 재시도해 커서가 깜빡이거나 body로 떨어지지 않게 한다.
- [x] 2026-05-20 새 노드 caret 안정화
  - [x] 본문에서 `Enter`로 split/create된 새 노드는 생성 직후 active row가 되고, contenteditable DOM focus와 native selection/caret이 새 노드 editor 안으로 들어간다.
  - [x] `Ctrl+Enter`/`Cmd+Enter`로 만든 같은 레벨 형제 노드도 생성 직후 새 노드 editor에 focus된다.
  - [x] note editor에서 본문으로 돌아올 때는 기존 노드 본문 끝으로 caret이 복귀한다.
  - [x] Lexical focus request는 React memo 비교에 포함해 같은 active row 안에서 offset만 바뀌는 경우에도 재실행된다.
  - [x] 브라우저 검증 기준은 `document.activeElement`가 `Outline node text` editor이고, `window.getSelection().anchorNode`가 같은 새 노드 row 안에 있는 상태다.
  - [x] 멀티라인 paste 처리 중 Lexical의 중간 DOM 변경은 suppress해 Undo/Redo가 paste 전체를 하나의 구조 편집 action으로 되돌린다.
- [x] Custom CSS
  - [x] CSS 입력/저장 UI를 설정 창에 추가한다.
  - [x] 적용 범위를 editor root 또는 app theme layer로 제한한다.
  - [x] CSS 비활성화, 초기화, 오류 표시를 제공한다.
- [ ] Rich text format 확장
  - [x] `# `, `## `, `### ` 입력을 heading 1/2/3으로 변환한다.
  - [x] heading 노드는 active editor에서도 WYSIWYG로 표시한다.
  - [x] `==text==` 형광펜 mark를 inactive row에서 렌더링하고 active row에서는 원문 편집을 유지한다.
  - [x] strikethrough
  - [x] text color
  - [x] inline code
  - [x] code block
  - 기존 bold/italic/link 등과 함께 command registry에 통합한다.
- [ ] Command palette와 전역 검색
  - [x] `Ctrl+P` 기본 단축키를 추가한다.
  - [x] `Ctrl+P`는 노드 검색을 기본으로 하고, `>` prefix가 있을 때 command mode로 전환한다.
  - [x] `Ctrl+Shift+P`는 command mode로 바로 연다.
  - [x] 상시 노출 검색창을 제거하고 palette 중심 검색/명령 실행으로 통합한다.
  - [x] 명령 실행, 노드 검색, 최근 노드 이동을 같은 palette에서 처리한다.
  - [x] 검색 결과는 키보드 이동, preview, 현재 노드로 점프를 지원한다.
  - [ ] 최근 문서 이동은 다중 문서/workspace 모델이 생기는 Phase 16에서 연결한다.
- [ ] 노드 메모
  - [x] `Shift+Enter`로 현재 노드의 note를 생성/편집한다.
  - [x] note editor는 필요할 때만 열고, note 입력의 `Shift+Enter`로 닫은 뒤 노드 본문 편집으로 돌아간다.
  - [x] note는 본문과 분리된 보조 텍스트로 저장한다.
  - [x] note editor는 설정/서식 툴바가 아니라 현재 노드 바로 아래에 표시한다.
  - [x] 전역 note visibility toggle이 켜진 경우에만 내용 있는 note preview를 표시한다.
  - [x] note preview와 note textarea editor의 시각 상태를 명확히 분리한다.
  - 접기/검색/export에서 note 포함 정책을 명확히 한다.
- [ ] 멀티라인 편집
  - [ ] 본문 내부 줄바꿈 정책을 `Ctrl+Enter`와 분리해서 다시 정의한다.
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
  - [x] note 접근, 형제 노드 생성, node palette, command palette 단축키를 설정 가능하게 한다.
  - reserved shortcut, OS별 shortcut, 충돌 shortcut을 구분한다.
  - 기본값 복원과 export/import를 제공한다.
- [ ] 설정 창
  - [x] Preferences를 한 화면이 아니라 섹션형 settings dialog로 정리한다.
  - [x] Settings UI를 상단 inline panel에서 modal dialog로 전환한다.
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
