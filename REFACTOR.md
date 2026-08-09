# 리팩터 인수인계

> 기능을 더하지 않는 작업만 모았다. **동작이 하나라도 바뀌면 그건 이 문서의 실패다.**
> 아키텍처·설계 근거는 [`.dev.md`](./.dev.md), 기능 로드맵은 [`PARITY.md`](./PARITY.md)가 정본이다.

## 왜 지금인가 — 실측

P0·P1·P2를 다 넣은 뒤 각 파일이 얼마나 자랐는지. 이 표가 이 문서의 전부다.

| 파일 | 이전 → 지금 | 증가 |
| --- | --- | --- |
| `outline/useOutline.ts` | 469 → **834** | +78% |
| `types.ts` | 139 → 273 | +96% |
| `store.ts` | 439 → 615 | +40% |
| `sync/api/remote.ts` | 575 → 703 | +22% |
| `outline/tree.ts` | 613 → 725 | +18% |
| `storage/validate.ts` | 144 → 165 | +15% |
| **`sync/merge.ts`** | 266 → **306** | **+15%** |

**데이터를 쥔 쪽은 버텼고, UI를 쥔 쪽이 전부 흡수했다.** `merge.ts`의 +40줄 중 새 규칙은
하나뿐이다(`created`는 더 이른 쪽). 6,500줄어치 기능이 들어오는 동안 병합 모델이 안 흔들렸다.

---

## 절대 건드리지 말 것

리팩터라는 이름으로 여기 손대면 되돌릴 수 없는 종류의 손해가 난다.

1. **`sync/merge.ts`의 병합 규칙.** 순서 무관·멱등이고 `merge.test.ts`가 실제 사고를 고정한다.
   파일을 옮기는 것조차 이득이 없다.
2. **`SyncPayload`의 모양과 GitHub 파일 레이아웃.** 기기 간 호환이 여기 달려 있다.
   P0~P2 내내 안 건드렸고, 리팩터에서 건드릴 이유는 더더욱 없다.
3. **전송 계약** — "버전 붙은 JSON을 읽고 compare-and-swap으로 쓴다". `history`/`files`는
   계약이 아니라 **선택적 능력**이다. 그 구분을 흐리지 말 것.
4. **`storage/validate.ts`의 "던지지 말고 버리기".** 바깥에서 오는 데이터는 전부 여기를 지난다.
5. **행 = 포커스 시 textarea / 아니면 렌더된 마크다운.** 이게 한글 IME를 사준 선택이다.
6. **`.dev.md`의 "조심할 것" 전부** — 특히 객체 동일성으로 no-op을 판별하는 부분.
   병합/트리 코드에서 불필요한 객체 재생성은 유휴 리렌더 루프를 되살린다(전적 있음).

## 검증 기준 (매 단계마다)

```bash
npm test          # 유닛 184개 — 하나도 줄거나 늘지 않아야 한다
npm run build     # tsc -b. `npm run typecheck`(tsc --noEmit)는 테스트 파일 오류를 놓친다
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
                  # e2e 64개 전부 green
```

**테스트를 고쳐야 한다면 그건 동작이 바뀌었다는 뜻이다.** 셀렉터가 가리키는 클래스 이름을 옮긴
경우만 예외이고, 그때도 커밋 메시지에 왜인지 남길 것.

---

## R1. `app/keymap.ts` → `shared/keymap.ts`

**난이도: 아주 낮음. 먼저 할 것.**

### 무엇이 잘못됐나

`outline/useOutline.ts`가 `../app/keymap`을 import한다. 원래 규칙은 "도메인은 서로 독립,
`app/`이 조립한다"인데, 지금 `outline/`이 `app/`을 안다. 키맵은 앱 크롬이 아니라 **횡단
관심사**다 — 에디터와 윈도우가 둘 다 같은 테이블을 읽는다.

지금 `outline/`이 밖으로 나가는 간선은 셋이다:

| 간선 | 판정 |
| --- | --- |
| `outline/ → app/keymap` | **잘못됐다.** 이번에 고친다 |
| `outline/ → search/links`, `search/search` | 애매하지만 둔다 — 자동완성이 태그·문서를 알아야 한다 |
| `outline/ → sync/api/attachments` | 애매하지만 둔다 — 붙여넣기가 업로드한다 |

### 어떻게

1. `git mv src/app/keymap.ts src/shared/keymap.ts`
2. `git mv src/app/__tests__/keymap.test.ts src/shared/__tests__/keymap.test.ts`
   (import 경로 `../keymap` 그대로 유효)
3. import 경로 갱신: `src/app/App.tsx`, `src/app/Keys.tsx`, `src/outline/useOutline.ts`
4. `.dev.md`의 구조 트리에서 `keymap.ts` 줄을 `shared/`로 옮길 것

### 끝났다는 기준

`grep -rn 'from "\.\./app/' src/outline src/search src/sync src/storage src/transfer` 가 비어 있을 것.

---

## R2. `useOutline.ts`를 관심사별로 쪼갠다

**난이도: 높음. 이 문서의 본체.**

### 무엇이 잘못됐나

834줄이고 `RowApi`가 멤버 **31개**다. 행 단위 기능을 하나 넣을 때마다 여기 메서드가 하나 늘고
`Row`를 지나는 prop 경로가 하나 는다. 469줄일 때 "모든 동작이 한곳에"는 미덕이었는데 834줄에서는
부채다.

실제로 들어 있는 것은 아홉 가지이고, 서로 거의 모른다:

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

**한 번에 다 하지 말 것.** 훅 하나씩, 각 단계마다 전체 테스트를 돌린다.

먼저 공유 ref 뭉치를 하나로 묶는다. 지금 `rowsRef`/`selectionRef`/`zoomRef`/`docRef`/
`workspaceRef`/`focusRef`가 각각 매 렌더 대입되고 있고, 쪼개진 훅들이 전부 같은 걸 필요로 한다.

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

그 다음 순서대로 뽑는다. 각각 **자기 상태를 소유하고 `RowApi`의 한 조각을 반환**한다.

1. **`useRowDrag(live, edit)`** → `{ dropSpot, onDragEnd, api: { dragStart, dragOver, drop } }`
   — 가장 독립적이라 첫 단계로 안전하다. 전체의 약 90줄.
2. **`useRowMenu(live, requestFocus)`** → `{ menu, closeMenu, api: { openMenu } }` — 약 15줄.
3. **`useCompletion(live, applyText)`** → `{ completion, api: { pickCompletion, hoverCompletion }, refresh, accept, onKeyDown }`
   — 약 100줄. `onTextKeyDown` 맨 앞의 자동완성 분기가 여기로 온다.
4. **`useRowSelection(live, edit, requestFocus)`** → `{ selection, selected, api: { pointerSelect, clearSelection }, onKeyDown }`
   — `onContainerKeyDown` 전체(약 70줄)가 여기로.
5. 남는 것(`onTextKeyDown`의 서식·구조 분기, 메모, 확대, 첨부)이 `useOutline`에 남는다.
   목표는 **350줄 아래**.

`useOutline`은 조립만 하고 `OutlineView`를 지금과 **똑같은 모양으로** 반환한다.
`Outline.tsx`와 `Row.tsx`는 한 줄도 안 바뀌는 게 성공 기준이다.

### 함정

- **`api` 객체의 동일성.** 지금 `useMemo`로 컴포넌트 수명 내내 같은 객체를 유지한다 —
  키 입력마다 새 `api`가 생기면 모든 `Row`의 memo가 무너진다. 쪼갠 뒤에도 최종 `api`가
  안정적인지 반드시 확인할 것. (`e2e/large.spec.ts`가 이걸 간접적으로 잡는다.)
- **키 처리 순서가 의미를 가진다.** `onTextKeyDown`은 위에서부터
  자동완성 → 자동서식 되돌리기 → 서식 단축키 → 구조 순이고, 각 블록이 `return`으로 끊는다.
  훅으로 뽑을 때 "이 훅이 이 키를 먹었는가"를 boolean으로 돌려 순서를 유지할 것.
- **`requestFocus`는 캐럿이 간 곳을 기록한다**(`store.ts`). 새 포커스 경로를 만들면 반드시
  이걸 통과시킬 것 — 팔레트의 행 명령과 리로드 후 착지 지점이 `view.focusId`를 읽는다.

---

## R3. `sync/api/remote.ts`를 쪼갠다

**난이도: 중간.**

703줄이 다섯 가지를 한다: REST 백엔드(약 40줄), GitHub 백엔드(약 450줄), 미러 장부,
히스토리, 첨부, base64/직렬화 헬퍼, 그리고 `localStorage` 설정.

`Backend` 인터페이스는 깨끗하게 남았다 — **그게 중요한 부분이고 그대로 둔다.** 파일만 나눈다.

```
sync/api/remote/
  index.ts      createBackend + 타입 재export (기존 import 경로가 안 깨지게)
  contract.ts   Backend / Version / Stored / History / Files 타입
  rest.ts       createRestBackend
  github.ts     createGithubBackend (+ 미러·히스토리·첨부)
  codec.ts      serialize/ordered/toBase64/fromBase64/toBinaryString/fromBinaryString
  settings.ts   loadSyncConfig/saveSyncConfig/hasSynced/markSynced/watchOtherTabs
```

`github.test.ts`(18개)가 이걸 전부 고정하고 있으니 안전망은 충분하다. 테스트 파일의 import는
`../api/remote`가 `index.ts`로 해결되므로 그대로 둘 것.

---

## R4. `store.ts`에서 동기화 루프를 뺀다

**난이도: 중간.**

615줄이 셋을 겹쳐 든다: 상태+실행취소+저장, `docs` 파사드(문서/폴더/검색/휴지통 CRUD),
동기화 루프(pull–merge–push, 백오프, visibility, 다른 탭).

동기화 루프만 떼기 쉽다 — `live.current`, `applyWorkspace`, `history.clear`, 백엔드만 있으면 된다.

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

`edits`/`pushed` 카운터도 같이 간다. `store.ts`는 400줄 아래가 목표.

**주의**: `absorb`가 `history.clear()`를 부르는 이유는 "원격에서 새로 온 내용 이전의 스냅샷을
되돌리면 이 기기가 만들지 않은 줄을 지운다"이다. 콜백으로 뽑되 이유를 주석으로 옮길 것.

---

## R5. `Doc`을 경계에서 판별 유니온으로 — **물면 그때**

**난이도: 중간. 지금 당장은 하지 말 것.**

`kind`는 `"doc" | "folder" | "search"` 셋인데 타입은 전부에게 `nodes`·`rootId`·`query`·
`deleted`를 준다. 폴더는 안 쓰는 루트 노드를 갖고, 저장된 검색은 안 쓰는 아웃라인을 갖는다.

**이 트레이드 자체는 옳다.** 그 덕에 폴더·저장된 검색·휴지통이 동기화 기계를 하나도 안 늘렸다
(`PARITY.md` §7). 대가는 *타입 정직성*이다 — "여기서 어떤 필드가 진짜냐"를 컴파일러가 아니라
`realDocs()` 같은 관습이 답한다.

고칠 때가 오면: **디스크 형태는 그대로 두고** `readDoc`이 판별 유니온을 돌려주게 한다.
`OutlineDoc | Folder | SavedSearch`. 직렬화는 하나, 메모리 안에서만 갈라진다.
착수 신호는 "`kind` 검사를 잊어서 생긴 버그가 나올 때"다. 그 전에는 순이익이 없다.

---

## R6. `global.css` 분할 — 급하지 않음

1,750줄 한 파일. 토큰을 역할별로 쪼갠 뒤로는 훑을 만해서 급하지 않다. 하게 되면 도메인 경계를
그대로 따를 것: `tokens.css` / `chrome.css`(topbar·sidebar) / `outline.css` / `panels.css`.
`index.html`의 CSP는 `style-src 'self'`라 파일 수와 무관하다.

---

## 남겨둔 리스크 (리팩터는 아니지만 결정이 필요)

**백엔드 능력의 비대칭.** 히스토리와 첨부는 GitHub 백엔드에만 있다. 아키텍처가 깨끗하게 허용한
구조이긴 한데, 결과적으로 **백엔드에 따라 조용히 없는 기능**이 생겼다. 지금은 둘이라 괜찮지만
늘어나면 "REST 백엔드는 반쪽짜리"가 된다.

셋 중 하나를 정해야 한다:
1. 선을 긋는다 — "저장소 백엔드만의 기능"이라고 문서와 UI에 명시하고 더 늘리지 않는다
2. REST 백엔드에도 능력을 준다 (히스토리는 서버가 필요하고, 첨부는 두 번째 URL이면 된다)
3. 능력이 없을 때의 UI를 일급으로 만든다 (지금은 패널이 안내 문구를 띄우는 정도)

**권장은 1번.** 2번은 `.dev.md`의 "REST는 URL 하나가 계약"을 깬다.

---

## 순서 요약

| | 무엇 | 난이도 | 왜 이 순서 |
| --- | --- | --- | --- |
| R1 | `keymap.ts` → `shared/` | 아주 낮음 | 파일 이동 하나로 최악의 의존성 간선이 사라진다 |
| R2 | `useOutline` 분할 | 높음 | 본체. R1 뒤에 하면 훅들이 `app/`을 안 봐도 된다 |
| R3 | `remote.ts` 분할 | 중간 | R2와 독립. 순서 바꿔도 된다 |
| R4 | 동기화 루프 분리 | 중간 | R3 뒤가 편하다 |
| R5 | `Doc` 판별 유니온 | 중간 | **물면 그때** |
| R6 | CSS 분할 | 낮음 | 급하지 않음 |

R1과 R2만 해도 이 문서의 값어치는 다 나온다.
