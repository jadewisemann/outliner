# 리팩터 인수인계

> (원래는 루트의 `REFACTOR.md`였다. 진행 상황 체크리스트는 [PLANS.md](../../PLANS.md)가 정본이고, 이 문서는 상세 계획이다. `claude/handover-refactoring-y4kt42` 브랜치는 P0~P2 이전 코드를 기준으로 한 참고 구현이다.)
>
> **실행 현황 (2026-08-20):** R1·R2·R3·R4를 완료했다. R3에서는 아래에서 제안한
> `remote/` 디렉터리 레이아웃을 그대로 적용했고(base64·직렬화는 `codec.ts`에 두고, 탭 간 핑은
> `settings.ts`에 포함했다), R4에서는 카운터·backoff·탭 감시까지 `sync/useSync.ts`로 옮겼다.
> R2는 아래의 자르는 선 그대로 5단계를 전부 실행했고, 그 결과 `useOutline.ts`는 834줄에서 566줄로 줄었다.
> 350줄이라는 목표만 실측에 맞춰 갱신했다. 계획이 남기라고 한 것들만으로도 350줄을 넘기 때문이다
> (IMPLEMENTATION_NOTES.md 2026-08-20). `Choice`/`Completion` 타입은 `useCompletion.ts`가
> 정의하고, `useOutline.ts`가 이를 재수출해서 기존 import 경로를 보존한다.

> **읽는 법 (2026-09-30):** R1~R6은 이미 끝난 계획을 기록한 것이어서 당시의 경로(`outline/`, `sync/`, `store.ts` …)를
> 그대로 쓴다. 지금의 경로는 [ADR-0013](../adr/0013-fsd-light.md)의 「옛 경로에서 새 경로로」 표에서 확인한다.
> 마지막 정리 작업은 아래 「R7. FSD light」 절에 있다.

> 이 문서에는 기능을 더하지 않는 작업만 모았다. **동작이 하나라도 바뀌면 그것은 이 문서의 실패다.**
> 아키텍처와 설계 근거는 [DESIGN.md](../../DESIGN.md)가, 기능 로드맵은 [parity.md](../parity.md)가 정본이다.

## 왜 지금인가 — 실측

아래 표는 P0·P1·P2를 다 넣은 뒤에 각 파일이 얼마나 자랐는지를 보여 준다. 이 표가 이 문서의 전부다.

| 파일 | 이전 → 지금 | 증가 |
| --- | --- | --- |
| `outline/useOutline.ts` | 469 → **834** | +78% |
| `types.ts` | 139 → 273 | +96% |
| `store.ts` | 439 → 615 | +40% |
| `sync/api/remote.ts` | 575 → 703 | +22% |
| `outline/tree.ts` | 613 → 725 | +18% |
| `storage/validate.ts` | 144 → 165 | +15% |
| **`sync/merge.ts`** | 266 → **306** | **+15%** |

**데이터를 다루는 쪽은 버텼고, 늘어난 분량은 UI를 다루는 쪽이 전부 흡수했다.** `merge.ts`의 +40줄 가운데 새 규칙은
하나뿐이다(`created`는 더 이른 쪽을 택한다). 6,500줄 분량의 기능이 들어오는 동안에도 병합 모델은 흔들리지 않았다.

---

## 절대 건드리지 말 것

리팩터라는 명목으로 여기에 손을 대면 되돌릴 수 없는 종류의 손해가 생긴다.

1. **`sync/merge.ts`의 병합 규칙.** 순서와 무관하고 멱등이며, `merge.test.ts`가 실제로 일어났던 사고를 고정한다.
   파일을 옮기는 것조차 이득이 없다.
2. **`SyncPayload`의 모양과 GitHub 파일 레이아웃.** 기기 간 호환성이 여기에 달려 있다.
   P0~P2 내내 건드리지 않았고, 리팩터에서 건드릴 이유는 더더욱 없다.
3. **전송 계약**: "버전 붙은 JSON을 읽고 compare-and-swap으로 쓴다". `history`/`files`는
   계약이 아니라 **선택적 능력**이다. 그 구분을 흐리지 말 것.
4. **`storage/validate.ts`의 "던지지 말고 버리기".** 바깥에서 오는 데이터는 전부 여기를 거친다.
5. **행 = 포커스 시 textarea / 아니면 렌더된 마크다운.** 이 선택 덕분에 한글 IME를 쓸 수 있다.
6. **DESIGN.md의 "조심할 것" 전부**, 특히 객체 동일성으로 no-op을 판별하는 부분.
   병합/트리 코드에서 객체를 불필요하게 다시 만들면 유휴 리렌더 루프가 되살아난다(실제로 그런 적이 있다).

## 검증 기준 (매 단계마다)

```bash
npm test          # 유닛 184개 — 하나도 줄거나 늘지 않아야 한다
npm run build     # tsc -b. `npm run typecheck`(tsc --noEmit)는 테스트 파일 오류를 놓친다
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
                  # e2e 64개 전부 green
```

**테스트를 고쳐야 한다면 그것은 동작이 바뀌었다는 뜻이다.** 셀렉터가 가리키는 클래스 이름을 옮긴
경우만 예외이고, 그때도 커밋 메시지에 그 이유를 남겨야 한다.

---

## R1. `app/keymap.ts` → `shared/keymap.ts`

**난이도: 아주 낮음. 먼저 할 것.**

### 무엇이 잘못됐나

`outline/useOutline.ts`가 `../app/keymap`을 import한다. 원래 규칙은 "도메인은 서로 독립,
`app/`이 조립한다"인데, 지금은 `outline/`이 `app/`에 의존한다. 키맵은 앱 크롬이 아니라 **횡단
관심사**다. 에디터와 윈도우가 둘 다 같은 테이블을 읽기 때문이다.

지금 `outline/`에서 밖으로 나가는 간선은 세 개다:

| 간선 | 판정 |
| --- | --- |
| `outline/ → app/keymap` | **잘못됐다.** 이번에 고친다 |
| `outline/ → search/links`, `search/search` | 애매하지만 둔다. 자동완성이 태그·문서를 알아야 하기 때문이다 |
| `outline/ → sync/api/attachments` | 애매하지만 둔다. 붙여넣기가 업로드를 하기 때문이다 |

### 어떻게

1. `git mv src/app/keymap.ts src/shared/keymap.ts`
2. `git mv src/app/__tests__/keymap.test.ts src/shared/__tests__/keymap.test.ts`
   (import 경로 `../keymap`은 그대로 유효하다)
3. import 경로 갱신: `src/app/App.tsx`, `src/app/Keys.tsx`, `src/outline/useOutline.ts`
4. DESIGN.md의 구조 트리에서 `keymap.ts` 줄을 `shared/`로 옮길 것

### 끝났다는 기준

`grep -rn 'from "\.\./app/' src/outline src/search src/sync src/storage src/transfer`의 출력이 비어 있어야 한다.

---

## R2. `useOutline.ts`를 관심사별로 쪼갠다

**난이도: 높음. 이 문서의 본체.**

### 무엇이 잘못됐나

파일은 834줄이고 `RowApi`의 멤버는 **31개**다. 행 단위 기능을 하나 넣을 때마다 여기에 메서드가 하나 늘고,
`Row`를 거치는 prop 경로도 하나 는다. 469줄일 때는 "모든 동작이 한곳에"가 미덕이었지만, 834줄에서는
부채다.

실제로 들어 있는 관심사는 아홉 가지이고, 서로 거의 의존하지 않는다:

| 관심사 | 지금 위치(대략) | 자기 상태 |
| --- | --- | --- |
| 필드에 직접 쓰기 | `applyText` (161) | 없음 |
| 자동완성 | 178–268 | `completion` |
| 첨부 | `attach` (231) | 없음 |
| 선택 | 274–282, `onContainerKeyDown` (513) | `selection`, `anchor` |
| 확대 | 288–305 | 없음 |
| 행 키보드 | `onTextKeyDown` (311–493) | `autoUndo` |
| 메모 | `focusNote`, `onNoteKeyDown` (494) | `noteFocus` |
| 드래그 | `api` 안 (621–773) | `dragId`, `dropRef`, `dropSpot` |
| 메뉴 | `openMenu` | `menu` |

### 자르는 선

**한 번에 다 하지 말아야 한다.** 훅을 하나씩 분리하고, 각 단계마다 전체 테스트를 돌린다.

먼저 여러 개의 공유 ref를 하나로 묶는다. 지금은 `rowsRef`/`selectionRef`/`zoomRef`/`docRef`/
`workspaceRef`/`focusRef`에 각각 렌더마다 값을 대입하고 있고, 쪼갠 훅들이 전부 같은 ref들을 필요로 한다.

```ts
// outline/useLive.ts
/** 렌더마다 갱신되는 최신값. 핸들러가 클로저에 굽지 않고 여기서 읽는다. */
export type Live = {
  rows: RowModel[];
  doc: Doc;
  workspace: Workspace;
  zoomId: Id;
  focus: FocusRequest | null;
};
export function useLive(value: Live): RefObject<Live>;
```

그다음에는 아래 순서대로 훅을 뽑는다. 각 훅은 **자기 상태를 소유하고 `RowApi`의 한 조각을 반환**한다.

1. **`useRowDrag(live, edit)`** → `{ dropSpot, onDragEnd, api: { dragStart, dragOver, drop } }`.
   가장 독립적이라서 첫 단계로 삼기에 안전하다. 전체의 약 90줄.
2. **`useRowMenu(live, requestFocus)`** → `{ menu, closeMenu, api: { openMenu } }`. 약 15줄.
3. **`useCompletion(live, applyText)`** → `{ completion, api: { pickCompletion, hoverCompletion }, refresh, accept, onKeyDown }`.
   약 100줄. `onTextKeyDown` 맨 앞에 있는 자동완성 분기가 이 훅으로 옮겨 온다.
4. **`useRowSelection(live, edit, requestFocus)`** → `{ selection, selected, api: { pointerSelect, clearSelection }, onKeyDown }`.
   `onContainerKeyDown` 전체(약 70줄)가 이 훅으로 옮겨 온다.
5. 나머지(`onTextKeyDown`의 서식·구조 분기, 메모, 확대, 첨부)는 `useOutline`에 남는다.
   목표는 **350줄 아래**다.

`useOutline`은 훅들을 조립하기만 하고, `OutlineView`를 지금과 **똑같은 모양으로** 반환한다.
`Outline.tsx`와 `Row.tsx`가 한 줄도 바뀌지 않는 것이 성공 기준이다.

### 함정

- **`api` 객체의 동일성.** 지금은 `useMemo`로 컴포넌트 수명 내내 같은 객체를 유지한다.
  키 입력마다 새 `api`가 생기면 모든 `Row`의 memo가 무력화되기 때문이다. 쪼갠 뒤에도 최종 `api`가
  안정적인지 반드시 확인할 것. (`e2e/large.spec.ts`가 이 문제를 간접적으로 잡아낸다.)
- **키 처리 순서가 의미를 가진다.** `onTextKeyDown`은 위에서부터
  자동완성 → 자동서식 되돌리기 → 서식 단축키 → 구조 순서로 처리하고, 각 블록이 `return`으로 처리를 끊는다.
  훅으로 뽑을 때는 "이 훅이 이 키를 먹었는가"를 boolean으로 돌려주어 순서를 유지할 것.
- **`requestFocus`는 캐럿이 간 곳을 기록한다**(`store.ts`). 새 포커스 경로를 만들면 반드시
  `requestFocus`를 거치게 할 것. 팔레트의 행 명령이 `view.focusId`를 읽고, 리로드 후 포커스가 놓이는
  위치도 `view.focusId`로 정해지기 때문이다.

---

## R3. `sync/api/remote.ts`를 쪼갠다

**난이도: 중간.**

이 파일은 703줄이고 다섯 가지 일을 한다: REST 백엔드(약 40줄), GitHub 백엔드(약 450줄), 미러 장부,
히스토리, 첨부, base64/직렬화 헬퍼, 그리고 `localStorage` 설정.

`Backend` 인터페이스는 깨끗하게 남았다. **그것이 중요한 부분이며, 인터페이스는 그대로 둔다.** 파일만 나눈다.

```
sync/api/remote/
  index.ts      createBackend + 타입 재export (기존 import 경로가 안 깨지게)
  contract.ts   Backend / Version / Stored / History / Files 타입
  rest.ts       createRestBackend
  github.ts     createGithubBackend (+ 미러·히스토리·첨부)
  codec.ts      serialize/ordered/toBase64/fromBase64/toBinaryString/fromBinaryString
  settings.ts   loadSyncConfig/saveSyncConfig/hasSynced/markSynced/watchOtherTabs
```

`github.test.ts`(18개)가 이 동작을 전부 고정하고 있으므로 안전망은 충분하다. 테스트 파일의 import는
`../api/remote`가 `index.ts`로 해결되므로 그대로 두어야 한다.

---

## R4. `store.ts`에서 동기화 루프를 뺀다

**난이도: 중간.**

이 파일은 615줄이고 세 가지 역할을 함께 맡고 있다: 상태+실행취소+저장, `docs` 파사드(문서/폴더/검색/휴지통 CRUD),
동기화 루프(pull–merge–push, 백오프, visibility, 다른 탭).

이 가운데 동기화 루프만은 떼어 내기 쉽다. `live.current`, `applyWorkspace`, `history.clear`, 백엔드만 있으면 되기 때문이다.

```ts
// sync/useSync.ts
export function useSync(options: {
  live: RefObject<Workspace | null>;
  apply(next: Workspace): void;
  onAbsorb(): void;          // history.clear()
  ready: boolean;
}): { status: SyncStatus; config: SyncConfig | null; setConfig(...): void; now(): Promise<void>;
      history: History | null; files: Files | null };
```

`edits`/`pushed` 카운터도 함께 옮긴다. 목표는 `store.ts`를 400줄 아래로 줄이는 것이다.

**주의**: `absorb`가 `history.clear()`를 부르는 이유는 "원격에서 새로 온 내용 이전의 스냅샷을
되돌리면 이 기기가 만들지 않은 줄을 지운다"이다. 콜백으로 뽑되, 이 이유를 주석으로 옮겨 적어야 한다.

---

## R5. `Doc`을 경계에서 판별 유니온으로 — **물면 그때**

**난이도: 중간. 지금 당장은 하지 말 것.**

`kind`는 `"doc" | "folder" | "search"` 세 가지인데, 타입은 셋 모두에게 `nodes`·`rootId`·`query`·
`deleted`를 준다. 그래서 폴더는 쓰지 않는 루트 노드를 갖고, 저장된 검색은 쓰지 않는 아웃라인을 갖는다.

**이 트레이드오프 자체는 옳다.** 그 덕분에 폴더·저장된 검색·휴지통을 넣으면서도 동기화 메커니즘은 하나도 늘지 않았다
([parity.md](../parity.md) §7). 대가는 *타입 정직성*이다. 즉, "여기서 어떤 필드가 진짜냐"라는 질문에 컴파일러가 아니라
`realDocs()` 같은 관습이 답한다.

고칠 때가 오면 **디스크 형태는 그대로 두고** `readDoc`이 판별 유니온을 돌려주게 한다.
유니온은 `OutlineDoc | Folder | SavedSearch`이다. 직렬화 형식은 하나로 유지되고, 메모리 안에서만 타입이 갈라진다.
착수 신호는 "`kind` 검사를 잊어서 생긴 버그가 나올 때"다. 그 전에는 순이익이 없다.

---

## R6. `global.css` 분할 — 완료 (2026-08-20)

1,750줄짜리 단일 파일이다. 토큰을 역할별로 쪼갠 뒤로는 훑어볼 만해서 급하지 않다. 분할하게 되면 도메인 경계를
그대로 따라야 한다: `tokens.css` / `chrome.css`(topbar·sidebar) / `outline.css` / `panels.css`.
`index.html`의 CSP는 `style-src 'self'`이므로 파일 수와 무관하다.

> **실행:** 위의 네 파일로 나눴다(그 사이에 파일은 2,051줄로 자라 있었다). 단, **규칙 순서는 한 줄도
> 바꾸지 않았다**. cascade에서는 나중 규칙이 동률을 이기므로, 순서를 재배치하면 동작이 바뀌기 때문이다.
> 그래서 파일 경계는 원본의 섹션 경계와 같다. 원본에서 패널들 뒤에 쓰인 행 스타일(행간 링크,
> 인용/코드, 아이템 메뉴, 끝부분의 focus/motion 규칙)은 도메인으로는 outline에 속하더라도 `panels.css`의
> 원래 위치에 남는다. import 순서가 곧 cascade 순서라는 점은 `main.tsx`와 각 파일의
> 헤더에 명시했다.
>
> **2026-09-30 후속:** `panels.css`의 끝부분에 남아 있던 행 스타일을 **순서 그대로** `outline.css`의 끝으로
> 옮겼다. main 빌드와 옮긴 뒤의 빌드로 찍은 스크린샷 12장(밝은·어두운 테마, 여섯 장면)이 바이트 단위로
> 같았다. 옮긴 부분을 위로 올리거나
> 위의 절과 합치면 cascade에서 이기는 규칙이 바뀐다는 점은 `outline.css` 머리말에 적었다. 파일은 지금 `src/app/styles/`에 있다.

---

## R7. FSD light — 완료 (2026-09-30)

도메인 폴더 사이에 의존 방향에 관한 규칙이 없어서, R1~R4를 끝낸 뒤에도 import가 여러 방향으로 얽혀 있었다.
`store.ts`는 팔레트 모듈에서 최근 문서 목록을 읽었고, 동기화 기능의 Markdown 미러는 `transfer/`의 내보내기
함수를 썼다. 사용자의 요청에 따라 Feature-Sliced Design을 가볍게 따르는 구조로 옮겼다. 결정 내용과 옛 경로 표는
[ADR-0013](../adr/0013-fsd-light.md)에 있다.

- **옮기기와 고치기를 나눴다.** 먼저 제자리에 있지 않던 코드를 떼어 냈다(퍼지 매칭은 `markdown.ts` 밖으로,
  공유 캡처는 표시 설정 밖으로, 최근 문서와 즐겨찾기는 팔레트 밖으로). 그다음에 파일을 `git mv`로 옮기고
  import를 기계적으로 고쳤다. 파일 이력은 `git log --follow`로 이어서 볼 수 있다.
- **규칙은 스크립트로 강제한다.** `scripts/check-layers.mjs`가 층 방향, 공개 API 경유 여부, entities 순서,
  슬라이스 밖으로 나가는 상대 경로를 검사하고, CI의 `Check`와 `Pages`가 이 스크립트를 실행한다. 처음 돌렸을 때 테스트를
  거쳐 생긴 순환 의존이 발견됐고, 두 슬라이스를 함께 시험하는 테스트를 위쪽 슬라이스로 옮겨서 해결했다.
- **App은 조립만 한다.** 도구 막대(`widgets/topbar`), 필터 막대(`features/filter`), 숨은 가져오기 선택기
  (`features/transfer`), 저장 경고(`entities/workspace`), 문서 제목(`widgets/editor`)을 떼어 내서
  `App.tsx`가 422줄에서 140줄로 줄었다. 같은 정리 작업에서 `store.ts`는 554줄에서 343줄로, 동기화 패널은
  376줄에서 301줄로 줄었다(문서 연산은 `documents.ts`로, 저장은 `usePersistence.ts`로, 폼 상태는
  `useSyncForm.ts`로 옮겼다).
- **CSS는 흩지 않았다.** 네 파일을 `app/styles/`로 옮기기만 했고, 순서는 그대로다(R6).

끝났다는 기준은 이 문서의 「검증 기준」과 같다. typecheck, `check:layers`, 유닛 테스트 277개, 빌드, e2e 테스트 78개가
통과했고, main 빌드와 이 구조의 빌드로 찍은 스크린샷 12장이 바이트 단위로 같았다.

---

## 남겨둔 리스크 (리팩터는 아니지만 결정이 필요)

> **2026-08-20 해소:** 아래 세 가지 중 1번으로 결정했다. 즉, 선을 긋고 문서와 UI에 명시했다.
> 근거와 대안을 기각한 이유는 [ADR-0005](../adr/0005-backend-capability-line.md)에 있다.

**백엔드 능력의 비대칭.** 히스토리와 첨부는 GitHub 백엔드에만 있다. 아키텍처가 깨끗하게 허용한
구조이기는 하지만, 결과적으로 **백엔드에 따라 조용히 없는 기능**이 생겼다. 지금은 둘이라 괜찮지만
늘어나면 "REST 백엔드는 반쪽짜리"가 된다.

셋 중 하나를 정해야 한다:
1. 선을 긋는다: "저장소 백엔드만의 기능"이라고 문서와 UI에 명시하고 더 늘리지 않는다
2. REST 백엔드에도 능력을 준다 (히스토리는 서버가 필요하고, 첨부는 두 번째 URL이면 된다)
3. 능력이 없을 때의 UI를 일급으로 만든다 (지금은 패널이 안내 문구를 띄우는 정도다)

**권장은 1번이다.** 2번은 DESIGN.md의 "REST는 URL 하나가 계약"이라는 원칙을 깬다.

---

## 순서 요약

| | 무엇 | 난이도 | 왜 이 순서 |
| --- | --- | --- | --- |
| R1 | `keymap.ts` → `shared/` | 아주 낮음 | 파일 이동 하나로 최악의 의존성 간선이 사라진다 |
| R2 | `useOutline` 분할 | 높음 | 본체. R1 뒤에 하면 훅들이 `app/`을 참조하지 않아도 된다 |
| R3 | `remote.ts` 분할 | 중간 | R2와 독립적이다. 순서를 바꿔도 된다 |
| R4 | 동기화 루프 분리 | 중간 | R3 뒤에 하면 편하다 |
| R5 | `Doc` 판별 유니온 | 중간 | **실제로 문제가 되면 그때** |
| R6 | CSS 분할 | 낮음 | 급하지 않음 |
| R7 | FSD light 재배치 | 중간 | R1~R6 뒤에 한다. 경계가 정리된 뒤라야 파일을 기계적으로 옮길 수 있다 |

R1과 R2만 해도 이 문서의 가치는 다 실현된다.
