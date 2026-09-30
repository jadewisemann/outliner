# 0013 — 소스 구조는 Feature-Sliced Design을 가볍게 따른다

- 상태: 승인
- 날짜: 2026-09-30

## 맥락

`src/`는 도메인 폴더(`outline/`, `palette/`, `sync/`, `storage/`, `search/`, `transfer/`, `shared/`,
`app/`)로 나뉘어 있었지만, 폴더 사이의 의존 방향을 정하는 규칙은 없었다. 그래서 import가 여러
방향으로 얽혀 있었다. 예를 들어 `store.ts`는 팔레트 모듈에서 최근 문서 목록을 읽었고, 동기화의
Markdown 미러는 `transfer/`의 내보내기 함수를 썼으며, `shared/keymap.ts`는 도메인 타입을 읽었다.
새 코드를 어디에 둘지 판단할 기준이 폴더 이름뿐이었고, 그 이름이 실제 책임과 어긋나는 곳도 있었다.

2026-09-30에 사용자가 Feature-Sliced Design(FSD)을 따르되 가볍게 적용한 구조로 리팩터링해 달라고
요청했다.

## 결정

1. **층은 다섯이다.** 위에서부터 `app` → `widgets` → `features` → `entities` → `shared`이고, 파일은
   자기보다 아래층만 import한다. 화면이 하나이므로 `pages` 층은 두지 않고, `app`이 widgets와
   features를 직접 조립한다.
2. **슬라이스는 공개 API로만 만난다.** `widgets`·`features`·`entities`는 슬라이스로 나뉘고, 슬라이스의
   `index.ts`가 그 슬라이스의 공개 API다. 다른 슬라이스는 `@/층/슬라이스` 경로로만 접근하고, 안쪽
   파일을 직접 import하지 않는다. `shared`에는 슬라이스가 없으므로 모듈 경로(`@/shared/lib/order`)로
   import한다. 슬라이스 안에서는 상대 경로를 쓰고, 상대 경로는 슬라이스 밖으로 나가지 않는다.
3. **세그먼트는 쓰는 것만 둔다.** `model`(상태와 순수 로직), `api`(바깥과의 입출력), `lib`(보조 변환),
   `ui`(컴포넌트) 가운데 그 슬라이스에 필요한 것만 만든다.
4. **규칙은 스크립트가 강제한다.** `scripts/check-layers.mjs`(`npm run check:layers`)가 위 규칙과 아래
   entities 순서를 검사하고, CI의 `Check`와 `Pages`가 이 검사를 실행한다.

### 정통 FSD와 다르게 한 것

- **entities 슬라이스끼리는 import할 수 있다.** 정통 FSD는 같은 층의 슬라이스끼리 import하지 않고,
  entities에 한해 `@x` 교차 표기를 쓴다. 이 앱의 엔티티는 하나의 데이터 모델을 여러 관점에서 다루므로
  서로 참조하는 일이 많다. 그래서 공개 API를 통하는 import는 허용하되, 순환은 금지한다. 순서는
  `outline` → `keymap` → `text` → `search` → `sync` → `workspace`이고, 앞의 슬라이스는 뒤의 슬라이스를
  모른다.
- **전역 스타일은 `app/styles/`에 네 파일 그대로 둔다.** 이 앱에서는 CSS 규칙의 순서가 곧 동작이다
  ([refactor-plan.md](../design/refactor-plan.md) 「R6」). 스타일을 슬라이스마다 흩으면 import 순서가
  바뀌고, 그러면 명시도가 같은 규칙 사이의 승자가 바뀐다.
- **테스트도 같은 규칙을 따른다.** 테스트는 모듈 옆 `__tests__/`에 두고, 두 슬라이스의 상호작용을
  시험하는 테스트는 위쪽 슬라이스로 옮겼다. 예를 들어 undo와 병합이 만나는 경우는 `entities/sync`에
  있다.

## 슬라이스가 가진 것

| 층 | 슬라이스 | 가진 것 |
| --- | --- | --- |
| app | (슬라이스 없음) | 진입점(`main.tsx`), `App`과 `ErrorBoundary`, 창 전체 단축키, 공유 캡처, OAuth 복귀, 전역 스타일 |
| widgets | `editor` | 아웃라인 편집기: 문서 제목, 행 렌더링, 행 키 처리, 선택, 끌어서 옮기기, 자동 서식, 자동완성, 가상화, 터치 바 |
| widgets | `topbar` | 도구 막대: 사이드바 토글, 브레드크럼, 동기화 배지, 팔레트·검색 버튼, 메뉴 |
| widgets | `sidebar` | 문서 목록, 폴더, 즐겨찾기, 태그, 휴지통 |
| widgets | `backlinks` | 이 항목을 가리키는 곳 |
| features | `palette` | 명령 팔레트: 접두사 모드, 제안, 명령 목록 |
| features | `search` | 전체 검색 패널 |
| features | `filter` | 문서 안 필터 막대 |
| features | `sync-settings` | 동기화 설정 패널, 동기화 배지, GitHub 로그인 |
| features | `history` | 문서 히스토리 패널 |
| features | `transfer` | 가져오기와 내보내기 동작, 숨은 파일·폴더 선택기, 폴더 가져오기의 경로 처리 |
| features | `appearance` | 표시 설정 패널, 표시 설정 값, 테마 |
| features | `shortcuts` | 단축키 도움말, 재바인딩 패널, 적용 중인 단축키 표 |
| entities | `outline` | 데이터 모델(`types.ts`), 트리 연산, 문서 연산, undo 기록, 스키마 검증과 이전, 가져오기·내보내기 형식, 이 기기의 사본(IndexedDB와 셸 파일) |
| entities | `keymap` | 단축키 표와 프리셋, 키 일치 판정, 표기 |
| entities | `text` | 행 텍스트: 인라인 마크다운 렌더링, 태그·날짜·항목 링크 토큰, 서식 문자열 조작, 수식·코드·첨부 표시 |
| entities | `search` | 질의 언어, 전체 검색, 태그 목록, 항목 링크와 백링크, 즐겨찾기 목록 |
| entities | `sync` | 병합 규칙, 푸시 판정, 동기화 루프(`useSync`), 원격 백엔드, 암호화, 첨부 전송 |
| entities | `workspace` | 열린 워크스페이스: `useStore`, 저장 훅, 최근 문서, 저장이 위험할 때의 경고 |
| shared | `lib` · `api` · `ui` | 정렬 키, 논리 시계, 퍼지 매칭, 내려받기, 날짜 경계 / 네이티브 셸 연결 / `Panel`, `Icon` |

이 구조에 맞추면서 제자리를 찾은 코드가 있다. 퍼지 매칭은 `outline/markdown.ts`에서 `shared/lib/fuzzy.ts`로,
최근 문서와 즐겨찾기 목록은 팔레트 모듈에서 `entities/workspace`와 `entities/search`로, 공유 캡처는 표시
설정 모듈에서 `app/model/share.ts`로 옮겼다.

## 옛 경로에서 새 경로로

이전 ADR, 조사 문서, `IMPLEMENTATION_NOTES.md`의 옛 기록은 당시의 경로를 그대로 쓴다. 그 경로는 이
표로 읽는다. 파일은 `git mv`로 옮겼으므로 `git log --follow`로 이력을 이어서 볼 수 있다.

| 옛 경로 (`src/…`) | 새 경로 (`src/…`) |
| --- | --- |
| `main.tsx`, `styles/*.css` | `app/main.tsx`, `app/styles/*.css` |
| `app/App.tsx`, `app/ErrorBoundary.tsx` | `app/ui/` |
| `app/navigate.ts`, `app/use{WindowKeys,ShareCapture,OauthReturn}.ts` | `app/model/` |
| `app/Sidebar.tsx`, `app/Backlinks.tsx` | `widgets/sidebar/ui/`, `widgets/backlinks/ui/` |
| `app/{Settings.tsx,appearance.ts,useTheme.ts,useAppearance.ts}` | `features/appearance/{ui,model}/` |
| `app/{Keys,Shortcuts}.tsx`, `app/useKeymapSetting.ts` | `features/shortcuts/{ui,model}/` |
| `app/Icon.tsx`, `shared/components/Panel.tsx` | `shared/ui/` |
| `outline/use*.ts`, `outline/components/{Outline,Row,RowMenu,Editable,TouchBar}.tsx` | `widgets/editor/{model,ui}/` |
| `outline/{markdown,dates}.ts` | `entities/text/lib/` |
| `outline/{inline,highlight}.tsx`, `outline/components/{TeX,Attachment}.tsx` | `entities/text/ui/` |
| `outline/tree.ts`, `types.ts`, `documents.ts`, `history.ts` | `entities/outline/model/` |
| `storage/{validate,migrate}.ts` | `entities/outline/model/` |
| `storage/persist.ts` | `entities/outline/api/persist.ts` |
| `storage/usePersistence.ts`, `store.ts` | `entities/workspace/model/` |
| `transfer/formats.ts` | `entities/outline/lib/formats.ts` |
| `transfer/{useTransfer,paths}.ts` | `features/transfer/{model,lib}/` |
| `search/{query,search,links}.ts` | `entities/search/model/` |
| `search/components/SearchPanel.tsx` | `features/search/ui/` |
| `palette/{palette,commands}.ts`, `palette/components/Palette.tsx` | `features/palette/{model,ui}/` |
| `shared/keymap.ts` | `entities/keymap/model/keymap.ts` |
| `sync/{merge,push,useSync}.ts` | `entities/sync/model/` |
| `sync/api/{cipher,attachments}.ts`, `sync/api/remote/*` | `entities/sync/api/` |
| `sync/api/githubAuth.ts`, `sync/{syncForm,useSyncForm}.ts`, `sync/components/SyncSettings.tsx` | `features/sync-settings/{api,model,ui}/` |
| `sync/components/HistoryPanel.tsx` | `features/history/ui/` |
| `shared/{order,clock,download,useDay}.ts` | `shared/lib/` |
| `shared/native.ts` | `shared/api/native.ts` |

## 검토한 대안

- **도메인 폴더를 두고 의존 규칙만 더한다.** 이름과 책임이 어긋난 곳이 그대로 남는다. 예를 들어
  `shared/`에 도메인 타입을 아는 키맵이 있고, 동기화가 `transfer/`에 기대는 구조가 유지된다.
- **정통 FSD를 그대로 적용한다.** `pages` 층, `@x` 교차 표기, 슬라이스별 스타일을 모두 들이는
  방식이다. 화면이 하나이고 엔티티끼리 참조가 많은 이 앱에서는 규칙을 지키는 비용이 얻는 것보다
  크고, 스타일을 흩으면 cascade 순서가 바뀐다.
- **패키지(workspace)로 나눈다.** 단일 패키지라는 저장소 구조(AGENTS.md)와 런타임 의존성을 늘리지
  않는 원칙(DESIGN.md 원칙 12)에 비해 과하다.

## 결과

- 새 코드의 자리는 그 코드가 **무엇을 아는가**로 정한다. 데이터만 알면 `entities`, 사용자의 한 가지
  동작이면 `features`, 여러 feature를 한 화면 조각으로 묶으면 `widgets`, 앱 전체의 연결이면 `app`이다.
  도메인을 전혀 모르면 `shared`다.
- 슬라이스의 `index.ts`가 공개 API이므로, 슬라이스 안의 파일을 나누거나 이름을 바꿔도 다른 슬라이스는
  영향을 받지 않는다.
- 살아 있는 문서(DESIGN.md, AGENTS.md, README.md, `docs/design/*`)는 새 경로로 고쳤다. 기록으로 남는
  문서(ADR, `docs/research/*`, `IMPLEMENTATION_NOTES.md`의 지난 항목)는 고치지 않고 위 표로 읽는다.
