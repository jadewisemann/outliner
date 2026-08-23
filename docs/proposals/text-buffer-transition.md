# Markdown 파일 및 text-buffer 전환 검토

- 상태: 격리 POC 구현, 측정과 채택 판정 전
- 작성일: 2026-08-23
- 범위: 설계 검토와 POC 계획
- 구현 상태: `poc/text-buffer/`에 1단계 POC를 구현했으며 production 경로는 변경하지 않음

> 이 문서는 채택된 설계가 아니다. 현재 정본은 계속 [DESIGN.md](../../DESIGN.md)와 관련 ADR이다.
> 이 문서는 Markdown 파일을 사용자 데이터의 정본으로 삼는 제품 전환이 타당한지 실측하기 위한
> 가설과 중단 조건을 기록한다. POC가 완료되고 사용자가 전환을 승인하기 전에는 현재 불변식을
> 수정하지 않는다.

## 1. 결론

즉시 전환하지 않는다. 먼저 CodeMirror 6 기반의 격리된 POC를 만들고 현재 편집기와 같은
시나리오에서 비교한다.

POC가 한글 IME, Android 입력, 아웃라인 조작, 긴 문서 성능을 모두 통과하면 다음 목표 구조를
우선안으로 삼는다.

1. 실제 폴더와 Markdown 파일이 사용자 데이터의 영구 정본이다.
2. 열린 문서에서는 text buffer가 편집 가능한 유일한 정본이다.
3. 아웃라인 구조는 text buffer를 증분 파싱하여 만든 파생 인덱스다.
4. IndexedDB는 캐시와 검색 인덱스일 뿐, 폴더 워크스페이스의 쓰기 가능한 두 번째 정본이 아니다.
5. 현재 브라우저 워크스페이스는 POC와 초기 도입 동안 그대로 유지한다.
6. 한 워크스페이스 안에서는 브라우저 저장 방식과 폴더 저장 방식을 섞지 않는다.

POC가 실패하면 현재 Node-native 편집기를 유지한다. Markdown 폴더가 여전히 필요하면
Markdown 저장과 기존 Node 런타임을 결합하는 대안을 별도로 검토한다.

## 2. 현재 기준선

현재 구조는 우연히 복잡해진 것이 아니다. 다음 결정과 실측값을 이미 갖고 있다.

- 한 행은 하나의 비제어 `textarea`다. 한글 조합 중 React가 DOM 값을 되쓰지 않게 하기 위한
  결정이다.
- `Doc/Node`가 내용, 구조, 항목 ID, 표시 상태와 병합 stamp를 함께 가진다.
- 형제 순서는 `parent + sort`, 삭제는 tombstone, 내용과 이동은 서로 다른 LWW stamp로
  병합한다.
- `children`은 `parent/sort`에서 파생한 읽기 캐시다.
- 250행을 넘으면 `useVirtualRows`가 화면 근처만 렌더한다.
- Chromium 개발 빌드 실측에서 2,000노드는 DOM 약 30행, 키 입력당 동기 작업 1.6ms다.
- 같은 조건에서 10,000노드는 DOM 약 30행, 키 입력당 동기 작업 5.6ms다.
- 10,000행 붙여넣기는 draft 패턴 적용 후 1초 미만이다.
- Yjs, Lexical, Firebase 기반 구현은 한글 IME와 병합 동작을 통제하지 못해 폐기했다.
- 런타임 의존성은 React, React DOM과 지연 로드되는 KaTeX로 제한한다.

새 접근은 이 기준선보다 단순해 보인다는 이유가 아니라, 파일 호환성과 편집 품질을 함께
실측으로 개선할 때만 채택할 수 있다.

## 3. 전환 목적

전환이 해결하려는 문제는 다음과 같다.

- 앱 밖에서도 읽고 수정할 수 있는 Markdown 파일을 제공한다.
- 실제 폴더 구조를 문서 구조로 사용한다.
- Git, Syncthing, 파일 백업과 일반 Markdown 도구를 활용할 수 있게 한다.
- selection, undo, IME, viewport와 대용량 text buffer에 축적된 에디터 기술을 재사용한다.
- Markdown을 가져오기와 내보내기 형식이 아니라 사용자 데이터의 정본으로 만든다.

다음 항목은 목적이 아니다.

- 현재 편집기가 느리다고 전제하지 않는다.
- Obsidian 플러그인의 UI를 복제하지 않는다.
- 임의의 Markdown 문법을 첫 단계부터 모두 지원하지 않는다.
- 현재 브라우저 저장과 동기화를 한 번에 제거하지 않는다.
- CodeMirror의 채택 자체를 성공으로 간주하지 않는다.

## 4. 후보 구조 비교

| 항목 | A. 현재 Node-native | B. Markdown + Node 런타임 | C. text-buffer-native |
|---|---|---|---|
| 편집 정본 | `Doc/Node` | 열린 동안 `Doc/Node` | text buffer |
| 영구 정본 | IndexedDB와 원격 JSON | Markdown 파일 | Markdown 파일 |
| 아웃라인 연산 | 트리 연산 | 트리 연산 | text transaction |
| Markdown 무손실성 | 내보내기 변환에 달림 | 직렬화기가 전체 파일을 다시 씀 | buffer가 원문을 직접 보존 |
| IME | 현재 검증됨 | 현재 검증됨 | POC가 필요함 |
| 가상 렌더링 | 자체 구현 | 자체 구현 | editor viewport 사용 |
| 항목 ID | 모델 필드 | 모델과 파일의 대응 필요 | 파일 표기 또는 sidecar 필요 |
| 외부 편집 반영 | 가져오기 | 재파싱과 구조 diff | buffer transaction으로 반영 |
| 현재 병합 모델 | 유지 | 대응 규칙이 필요함 | 직접 유지하기 어려움 |
| 구현 위험 | 낮음 | 두 표현의 왕복 위험 | 편집기와 동기화 재설계 |

파일 우선 전환을 제품의 핵심으로 확정한다면 C가 가장 일관적이다. B는 빠른 이행 경로가 될 수
있지만, Markdown과 Node 그래프가 서로 다른 표현을 가지므로 무손실 왕복과 외부 변경의 구조
diff가 장기적인 복잡도가 된다.

## 5. 권장 목표 구조

    실제 Markdown 파일
            ↕ FileWorkspace
    CodeMirror EditorState.doc
            ↓ incremental parse
    OutlineIndex
            ↓
    EditorView viewport + outline decorations

### 5.1 유일한 쓰기 경로

열린 문서의 모든 편집은 CodeMirror transaction으로 표현한다. React state, 별도 Node 객체,
IndexedDB가 같은 내용을 직접 수정하지 않는다.

- 키 입력은 editor transaction을 만든다.
- Enter, Backspace, Tab과 Shift+Tab도 transaction을 만든다.
- 서브트리 이동은 원본 범위를 삭제하고 대상 위치에 삽입하는 하나의 transaction이다.
- undo와 redo는 editor history가 text transaction을 되돌린다.
- 저장은 현재 buffer의 snapshot을 파일에 기록한다.
- 외부 파일 변경은 새 snapshot과 현재 buffer의 차이를 transaction으로 반영한다.

### 5.2 파생 OutlineIndex

`OutlineIndex`는 편집 가능한 두 번째 모델이 아니다. 현재 text buffer에서 언제든 다시 만들 수
있는 파생 구조다.

    type OutlineItem = {
      id: string | null;
      from: number;
      to: number;
      line: number;
      depth: number;
      parent: number | null;
      subtreeFrom: number;
      subtreeTo: number;
      marker: "bullet" | "number" | "task";
      done: boolean;
    };

실제 구현에서는 배열 인덱스를 영구 참조로 저장하지 않는다. transaction의 change mapping으로
위치를 옮기거나, 변경된 구간의 인덱스를 다시 만든다.

OutlineIndex가 담당할 정보는 다음과 같다.

- 부모와 자식 관계
- 형제 순서
- 서브트리의 text range
- 접기 가능한 범위
- 현재 확대 범위
- checklist와 numbered marker
- 항목 ID와 링크 대상
- 검색 결과가 속한 조상 경로

### 5.3 렌더링

수동 행 가상화는 POC에서 CodeMirror viewport와 비교한다. 목표 구조에서는 다음 기능을 editor
extension으로 표현한다.

- bullet과 checkbox: gutter marker 또는 widget
- 색 라벨: line decoration
- 인라인 Markdown: syntax decoration
- 접힌 자손: fold range 또는 replace decoration
- 노드 확대: 확대 범위 밖의 range를 숨기는 decoration
- 완료 항목 숨기기와 필터: 파생 가시성 range
- 자동 완성: completion source
- 항목 메뉴: gutter 또는 line widget
- 터치 조작: editor command를 호출하는 기존 touch bar

세로 레이아웃을 크게 바꾸는 block widget은 viewport 측정 비용을 일으킬 수 있으므로 POC에서
별도로 측정한다.

## 6. Outline Markdown 형식

첫 단계에서는 모든 Markdown을 완전하게 편집하려 하지 않는다. 다음 부분집합을 Outline
Markdown의 정식 문법 후보로 둔다.

    ---
    outliner-id: 4f86d7c1-...
    ---

    - 첫 번째 항목
      항목에 속한 메모입니다.

      - 자식 항목
      - [x] 완료한 항목
    - 두 번째 항목

지원 후보는 다음과 같다.

- 들여쓴 bullet과 numbered list
- task marker
- 항목 내부의 인라인 Markdown
- 항목에 속한 연속 문단
- fenced code block
- 인용
- 문서 front matter

파서가 이해하지 못하는 블록을 삭제하거나 조용히 정규화하면 안 된다. 지원하지 않는 블록은
원문 보존 블록으로 유지하고, 아웃라인 조작의 대상에서 제외하는 방식을 우선 검토한다.

## 7. ID와 메타데이터

파일 경로는 주소이고 ID는 정체성이다. 파일 이름이나 경로만 문서 ID로 사용하면 외부 rename과
move가 링크를 끊는다.

### 7.1 문서 ID

문서 ID는 YAML front matter에 둔다.

    ---
    outliner-id: 4f86d7c1-...
    ---

front matter가 없는 외부 문서를 처음 열면 ID를 부여하되, 읽기만 한 문서를 즉시 다시 쓰지는
않는다. 실제 편집 또는 명시적인 vault 이주 시점에 기록하는 방식을 검토한다.

### 7.2 항목 ID

다음 두 정책을 POC에서 비교한다.

1. 모든 항목에 짧은 block ID를 기록한다.
2. 링크, 북마크 또는 동기화 대상이 된 항목에만 지연해서 ID를 기록한다.

모든 항목에 ID가 있으면 외부 이동과 구조 병합이 쉬워지지만 Markdown 원문이 복잡해진다.
지연 ID는 파일이 깨끗하지만, ID가 없는 항목의 외부 이동을 안정적으로 추적할 수 없다.

표기 후보는 다음과 같다.

    - 항목 내용 ^ol-a1b2c3

또는 다음과 같은 HTML comment다.

    - 항목 내용 <!-- outliner:id=a1b2c3 -->

sidecar만으로 항목 ID를 보존하는 방식은 줄 삽입, 중복 문구와 외부 재정렬에서 대응이
불안정하다. 따라서 sidecar 단독 방식은 기본안으로 삼지 않는다.

### 7.3 sidecar와 기기 로컬 상태

예상 vault 구조는 다음과 같다.

    Vault/
    ├─ Inbox.md
    ├─ Projects/
    │  └─ Outliner.md
    ├─ .assets/
    └─ .outliner/
       ├─ workspace.json
       ├─ saved-searches.json
       └─ tombstones.json

Markdown에 속하지 않는 다음 상태는 sidecar 또는 IndexedDB에 둔다.

- saved search
- 인박스 지정
- 문서와 항목 북마크
- 선택한 단축키 프리셋
- 마지막 focus와 zoom
- 접힘 상태
- 검색 인덱스
- 파일 hash와 마지막으로 읽은 snapshot

동기화 의미가 있는 상태와 기기 로컬 상태는 같은 파일에 섞지 않는다. 구체적인 구분은
동기화 정책이 정해진 뒤 ADR에서 결정한다.

## 8. 저장과 외부 변경

### 8.1 저장

- 변경된 문서만 디바운스하여 저장한다.
- 저장 중에는 buffer revision과 저장 대상 snapshot을 함께 기록한다.
- 쓰기가 끝났을 때 revision이 달라졌으면 다음 저장을 예약한다.
- 저장 성공 전에는 dirty 상태를 해제하지 않는다.
- 파일 API가 제공하는 안전한 교체 방식을 사용하고, 실패하면 기존 파일을 보존한다.

### 8.2 외부 변경

외부 파일 변경은 세 경우로 구분한다.

1. 로컬 buffer가 깨끗하면 새 파일을 transaction으로 반영한다.
2. 로컬 buffer가 dirty지만 외부 변경이 마지막 저장본과 동일하면 로컬 편집을 유지한다.
3. 양쪽이 달라졌으면 자동으로 한쪽을 덮지 않고 3-way merge 또는 충돌 사본을 만든다.

비교 기준은 다음 세 snapshot이다.

- 마지막으로 성공적으로 저장한 base
- 현재 editor buffer인 local
- 파일 시스템에서 다시 읽은 remote

초기 POC에서는 충돌 사본을 남기는 보수적인 정책으로 시작한다. 자동 3-way merge는 별도의
순수 함수와 회귀 테스트가 생긴 뒤에만 켠다.

## 9. 동기화와 암호화

text-buffer-native 전환은 현재 병합 모델을 자동으로 계승하지 않는다.

현재 병합은 안정적인 노드 ID, 필드별 stamp, `parent/sort`와 tombstone에 의존한다.
Markdown text만으로 같은 의미를 복원하려면 모든 항목 ID와 병합 메타데이터를 파일 또는
sidecar에 기록해야 한다. 이 방식은 사람이 읽는 파일이라는 목표와 충돌할 수 있다.

초기 단계에서는 저장 provider를 분리한다.

- BrowserWorkspace: 현재 IndexedDB, JSON 원격, 클라이언트 병합과 E2EE를 그대로 유지한다.
- FolderWorkspace: 실제 Markdown 파일을 정본으로 사용하고 앱 자체 원격 동기화는 제공하지
  않는다. 사용자는 Git, Syncthing 또는 파일 동기화 도구를 선택할 수 있다.

이 구분은 한 워크스페이스에 정본이 두 개 생기는 것을 막는다. FolderWorkspace에서 앱 자체
동기화가 반드시 필요하다는 사용 증거가 생기면 그때 다음 중 하나를 ADR로 결정한다.

- block ID 기반 구조 병합
- 파일 단위 3-way text merge
- 기존 JSON 병합 메타데이터를 sidecar에 유지
- FolderWorkspace에도 별도 버전 저장소를 둠

평문 Markdown과 현재 E2EE 저장소는 동시에 만족할 수 없다. 암호화된 FolderWorkspace가
필요하면 vault 전체를 운영체제 또는 외부 도구가 암호화하는 방식을 우선 검토한다.

## 10. 플랫폼 전략

### 10.1 브라우저

File System Access API가 있는 환경에서는 사용자가 선택한 폴더를 읽고 쓸 수 있다. 권한,
외부 변경 감지와 파일 이동 기능은 브라우저별 차이가 있으므로 feature detection이 필요하다.

지원하지 않는 브라우저에서 폴더 워크스페이스를 흉내 내기 위해 IndexedDB와 다운로드를
사용하면 다시 두 저장 모델이 생긴다. 따라서 해당 환경에서는 기존 BrowserWorkspace만
제공한다.

### 10.2 Tauri

현재 설계에서 Tauri는 범위 밖이다. 파일 워크스페이스가 핵심이 되면 전제가 달라진다.

다음 요구가 브라우저 API로 안정적으로 충족되지 않을 때만 Tauri를 다시 검토한다.

- 지속적인 디렉터리 권한
- 신뢰할 수 있는 파일 watcher
- atomic replace와 rename
- 운영체제 파일 탐색기와의 통합
- 데스크톱 Git 저장소와의 직접 통합

POC 단계에서는 Tauri를 추가하지 않는다. 먼저 Chromium에서 편집기 구조 자체를 검증한다.

## 11. 기존 코드의 영향

### 유지 가능성이 높은 부분

- 팔레트와 명령 레지스트리
- 검색 질의 언어
- 문서 탐색 UI
- 인라인 렌더링 규칙의 일부
- 첨부 UI
- 표시 설정
- 키맵 프리셋의 정책
- PWA 셸과 BrowserWorkspace
- GitHub OAuth와 기존 JSON backend

### 교체 또는 큰 수정이 필요한 부분

- `src/types.ts`의 Node와 Doc 저장 모델
- `src/outline/tree.ts`의 쓰기 연산
- `src/outline/useOutline.ts`
- `src/outline/useVirtualRows.ts`
- 행별 `Editable.tsx`
- `src/history.ts`
- Markdown 가져오기와 내보내기 구분
- 검색과 링크 인덱스의 데이터 입구
- 폴더를 `Doc.parent`로 표현하는 규칙
- Node stamp 기반 동기화

### 현재 원칙과 충돌하는 지점

전환을 채택하면 최소한 다음 DESIGN 원칙을 다시 판정해야 한다.

- 원칙 3: 병합되는 Node 데이터 모델
- 원칙 4: `merge()` 객체 동일성
- 원칙 5: `children` 파생 캐시
- 원칙 10: 재스탬프 undo
- 원칙 12: 런타임 의존성 제한
- 원칙 13: 원격 JSON 직렬화
- 원칙 15: 폴더도 문서라는 모델

원칙 1의 로컬 우선과 원칙 2의 클라이언트 판정은 유지할 수 있다. 다만 FolderWorkspace에서
외부 동기화 도구를 사용하면 원칙 2가 적용되는 경계를 다시 정의해야 한다.

POC 단계에서는 DESIGN.md와 기존 ADR을 수정하지 않는다. 채택 시 새 ADR이 기존 결정을
대체하거나 적용 범위를 BrowserWorkspace로 한정해야 한다.

## 12. POC 계획

POC는 production 코드와 분리된 경로에서 한 문서만 연다. 저장, GitHub 동기화와 전체 앱
통합을 먼저 구현하지 않는다.

### 단계 1: 최소 편집기

- [x] CodeMirror 6의 최소 패키지로 editor를 연다.
- [x] Markdown list를 OutlineIndex로 읽는다.
- [x] bullet과 깊이를 decoration으로 표시한다.
- [x] Enter, Backspace, Tab과 Shift+Tab을 아웃라인 명령으로 구현한다.
- [x] 한글 조합 이벤트를 계측한다.

### 단계 2: 구조 조작

- [x] 서브트리 범위를 계산한다.
- [x] 위와 아래 이동을 하나의 transaction으로 구현한다.
- [x] 복제와 삭제를 구현한다.
- [x] 접기와 펼치기를 구현한다.
- [x] 노드 확대와 복귀를 구현한다.
- [x] 여러 selection의 선택 범위를 하나의 구조 명령으로 처리한다.

### 단계 3: 표시와 모바일

- [x] checkbox와 numbered list를 표시한다.
- [x] 인라인 Markdown을 표시한다.
- [x] touch bar 명령을 editor transaction에 연결한다.
- [ ] Android Chrome과 삼성 키보드에서 조합 입력을 확인한다.
- [ ] 스크롤 중 포커스를 강제로 되돌리지 않는지 확인한다.

### 단계 4: 파일 왕복

- [x] Markdown을 열고 수정하지 않은 buffer를 그대로 저장하는 경로를 구현한다.
- [x] 지원하지 않는 블록을 원문에 보존한다.
- [x] 외부 변경을 buffer transaction으로 반영한다.
- [x] base, local, remote 충돌을 재현하고 양쪽 충돌 사본을 남긴다.
- [ ] ID 표기 두 후보를 비교한다.

### POC 배치와 현재 판정

POC는 `poc/text-buffer/`에 별도의 Vite 진입점으로 배치했습니다. CodeMirror와 Lezer 패키지는
개발 의존성이고 production의 `src/`에서는 가져오지 않습니다. 따라서 기존 편집기, IndexedDB,
동기화, production 번들과 DESIGN.md의 현재 불변식은 그대로입니다.

구조 명령과 충돌 판정은 순수 함수 또는 독립 모듈로 분리했으며, POC 유닛 테스트 11건으로 다음
동작을 고정했습니다.

- front matter, fenced code와 지원하지 않는 블록을 OutlineIndex에서 제외합니다.
- 부모, 형제와 서브트리 범위를 Markdown 원문 위치로 계산합니다.
- 항목 분할, 들여쓰기, 서브트리 이동·복제와 Backspace 병합을 text transaction으로 수행합니다.
- 외부 변경에서 clean, local-only와 실제 충돌을 구분합니다.
- 저장 도중 buffer revision이 바뀌면 dirty 상태를 유지합니다.

아직 채택 판정에 사용할 수 없는 이유는 두 가지입니다. 첫째, 현재 OutlineIndex는 변경할 때마다
Outline Markdown 부분집합을 선형으로 다시 읽습니다. Lezer 구문 트리는 증분으로 갱신되지만
구조 인덱스의 부분 갱신은 아직 구현하지 않았습니다. 10,000행 측정에서 이 선형 비용이 게이트를
넘을 때만 복잡한 부분 갱신을 추가합니다. 둘째, 합성 composition 이벤트는 실제 한글 IME와
Android 키보드의 대체물이 아닙니다. POC 화면에 계측기를 넣었지만 실제 기기 판정은 남아 있습니다.

번들 비용도 채택 근거에 포함해야 합니다. 현재 production main JS는 274.36kB, gzip 92.00kB이고,
독립 POC JS는 544.85kB, gzip 189.45kB입니다. 두 빌드는 기능 범위가 달라 단순 합산할 수 없지만,
CodeMirror Markdown 언어 묶음이 가볍지 않다는 사실은 확정되었습니다. 채택안을 만들 때는 POC
지연 로드, 불필요한 언어 지원 제거와 production 통합 빌드의 실제 증분 크기를 따로 측정합니다.

## 13. 성능과 정확성 게이트

현재 구현과 같은 브라우저, 빌드 종류와 기기에서 비교한다.

| 항목 | 현재 기준선 | POC 통과 조건 |
|---|---:|---|
| 2,000행 키 입력 동기 작업 | 1.6ms | 회귀 원인을 설명할 수 있고 체감 지연이 없음 |
| 10,000행 키 입력 동기 작업 | 5.6ms | 반복 측정에서 현재 대비 1.5배 이내 |
| 10,000행 DOM 행 수 | 약 30 | 문서 크기에 비례하지 않고 100개 미만 |
| 10,000행 초기 구성 | 비교값 추가 측정 | 현재 대비 1.5배 이내 |
| 1,000행 서브트리 이동 | 비교값 추가 측정 | 입력이 막히는 장기 task가 없음 |
| 유휴 DOM 변경 | 6초간 0회 | 동일 |
| 한글 조합 손실 | 0회 | 자동·수동 시나리오에서 0회 |
| Android 입력 손실 | 0회 | 자동·수동 시나리오에서 0회 |

시간 측정은 단발 결과가 아니라 같은 환경에서 여러 번 수행하고 중앙값과 상위 지연을 함께
기록한다. 개발 빌드와 production 빌드의 결과를 섞지 않는다.

다음 중 하나라도 발생하면 채택을 중단한다.

- 한글 조합 문자가 중복되거나 사라진다.
- Android에서 selection 또는 조합 상태가 반복적으로 깨진다.
- 10,000행 입력 지연이 현재 기준선의 1.5배를 지속적으로 넘는다.
- 접기와 확대가 viewport 측정과 충돌하여 스크롤 위치가 불안정하다.
- Markdown의 지원하지 않는 부분을 조용히 손실한다.
- 안정적인 항목 링크를 유지하려면 파일을 사실상 JSON처럼 오염시켜야 한다.
- 현재 병합과 E2EE를 포기하는 대가를 사용자가 받아들이지 않는다.

## 14. 단계별 전환과 롤백

### 0단계: 설계 검토

이 문서와 POC 범위를 승인한다. 현재 제품 코드는 바꾸지 않는다.

롤백: 이 문서의 상태를 기각으로 바꾸고 계획에서 제거한다.

### 1단계: 격리 POC

한 문서의 편집 동작과 성능만 검증한다.

롤백: POC 경로와 의존성을 제거한다. production 경로는 영향을 받지 않는다.

### 2단계: Markdown codec

지원 문법과 무손실 왕복을 고정한다.

롤백: codec을 가져오기와 내보내기 실험으로만 남긴다.

### 3단계: FolderWorkspace provider

기존 BrowserWorkspace와 별도의 저장 provider를 추가한다.

롤백: 기능 플래그를 끄고 BrowserWorkspace만 노출한다.

### 4단계: 선택적 사용자 시험

새 vault에서만 FolderWorkspace를 선택할 수 있게 한다. 기존 워크스페이스는 자동 이주하지
않는다.

롤백: 새 vault 생성을 막고 기존 Markdown 파일은 그대로 남긴다.

### 5단계: 채택 판정

사용 경험과 실측을 근거로 다음 중 하나를 결정한다.

- text-buffer-native를 기본 방향으로 채택
- FolderWorkspace만 선택 기능으로 유지
- Markdown + Node 런타임으로 변경
- 현재 구조 유지

채택할 때만 DESIGN.md, 관련 하위 문서와 ADR을 갱신한다.

## 15. 채택 전에 사용자가 결정할 사항

1. 사람이 읽기 좋은 Markdown과 모든 항목의 안정적인 ID 중 무엇을 우선할 것인가?
2. FolderWorkspace에서도 현재 자동 병합과 E2EE가 필요한가?
3. Firefox와 Safari 지원이 폴더 워크스페이스의 필수 조건인가?
4. 데스크톱 파일 기능을 위해 Tauri 빌드 비용을 받아들일 수 있는가?
5. 임의의 Markdown 전체를 지원할 것인가, Outline Markdown 부분집합을 제품 계약으로 둘 것인가?
6. 기존 BrowserWorkspace를 장기적으로 유지할 것인가?
7. 외부 편집 충돌에서 자동 병합과 명시적인 충돌 사본 중 무엇을 우선할 것인가?

## 참고 자료

- [CodeMirror Reference Manual](https://codemirror.net/docs/ref/)
- [Lezer Reference Manual](https://lezer.codemirror.net/docs/ref/)
- [VS Code text buffer 재구현 기록](https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation)
- [MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
