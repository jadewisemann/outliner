# DESIGN.md — 설계·불변식의 정본

**코드는 How를, 이 문서는 What / Why / Invariant를 말한다.** 문서와 코드가 충돌하면
조용히 코드를 따르지 않고 [AGENTS.md](./AGENTS.md)의 판정 규칙대로 판정한다. 이 문서를
정본으로 승격한 결정 자체는 [ADR-0001](./docs/adr/0001-design-doc-authority.md)에 있다.

> **작성 기준: 2026-09-29, 스키마 v8(`Workspace.keymap`)과 네이티브 셸(ADR-0010·0011) 반영.** 이 문서는 코드에서 추출해
> 동기화한 것이며, 이 시점 이후에 생긴 어긋남만 판정 대상이다.

## 무엇인가

Dynalist를 대신하는 로컬 우선 아웃라이너. 브라우저에서 열고, 키보드만으로 쓰고, 데이터는 내
기기에 남고, 내 기기끼리는 알아서 합쳐진다. 정적 빌드 하나가 제품의 전부이고, 서버는 노트를
저장할 뿐 판정하지 않는다. 방향은 Dynalist를 베끼는 것이 아니다 — **편집은 마크다운
에디터처럼, 항해는 코드 에디터의 팔레트처럼** ([docs/parity.md](./docs/parity.md)).
날짜는 텍스트 안의 표기로 읽고 찾지만, 알림·반복·캘린더 같은 일정 기능은 범위 밖이다
([ADR-0012](./docs/adr/0012-dates-as-text.md)). 같은 정적 빌드가 브라우저 탭, 설치된 PWA, 그리고 macOS·Windows·
Linux·Android용 Tauri 셸(`src-tauri/`) 안에서 돈다
([ADR-0010](./docs/adr/0010-native-shell.md)).

## 핵심 원칙 — 각각이 위반 판정 가능한 불변식이다

1. **로컬 우선.** 앱은 정적 호스팅만으로 완결된다. 노트 데이터의 필수 경로에 서버 로직을 두는
   구현은 위반이다. `api/`는 OAuth client secret을 브라우저에 보내지 않기 위한 code↔token
   교환, 그 하나의 역할만 가진다.
2. **병합은 영원히 클라이언트에서.** 원격(서버·GitHub)이 병합을 판정하는 구현은 위반이다.
   이 결정이 GitHub 백엔드와 종단 간 암호화를 가능하게 했다
   ([ADR-0002](./docs/adr/0002-client-side-merge.md)).
3. **동기화 엔진이 아니라 병합되는 데이터 모델.** 형제 순서는 배열이 아니라 노드마다 가진
   `sort` 분수 인덱스, 내용과 위치는 따로 스탬프, 삭제는 묘비(tombstone). 이 셋 밖의 병합
   장치(범용 CRDT, 서버 순번 등)를 들이는 것은 설계 변경이다
   ([ADR-0003](./docs/adr/0003-custom-merge-model.md)).
4. **`merge()`는 순수 함수이고 순서 무관·멱등이다. 가져올 게 없으면 같은 객체를 그대로
   돌려준다.** no-op 판별과 React 렌더 스킵이 객체 동일성에 걸려 있다 — 병합·트리 코드에서
   불필요한 객체 재생성은 위반이다 (전적: 유휴 탭이 분당 50회 리렌더).
5. **`children` 배열은 `parent`/`sort`에서 파생된 캐시다.** children을 정본으로 읽거나
   parent/sort 갱신 없이 children만 고치는 코드는 위반이다. 일관성은
   `outline/__tests__/tree.test.ts`의 `shape()`가 모든 연산에서 자동 검사한다.
6. **바깥에서 오는 데이터는 전부 `src/storage/validate.ts`를 통과한다.** 원칙은 **던지지 말고
   버리기** — 망가진 항목만 버리고 나머지는 살린다. 적대적이거나 고장 난 서버가 문서를
   지우거나 앱을 죽일 수 없어야 한다.
7. **못 읽는 원격(`locked`)은 실패와 구분하고, locked면 푸시를 멈춘다.** 못 읽은 것을 없는
   것으로 보고 밀어 올리는 구현은 위반이다 — 아무도 복구할 수 없는 노트를 덮어쓴다.
8. **파일 삭제는 묘비만이 시킨다. 묘비를 먼저 쓰고 파일을 나중에 지운다.** 페이로드에 없다는
   것을 삭제의 증거로 쓰는 구현은 위반이다 — 그것은 읽지 못한 파일의 모습이기도 하다.
9. **푸시 여부는 평문 직렬화 비교로 정한다.** AES-GCM은 매번 새 IV를 쓰므로 암호문 비교는
   언제나 "다르다"가 된다.
10. **undo는 스냅샷 복원이 아니라 재스탬프다** (`src/history.ts`). 스냅샷 복원이면 다음
    동기화가 undo를 도로 되돌린다.
11. **컴포넌트는 렌더링만 한다.** 동작은 훅과 순수 `.ts`에 둔다. 컴포넌트에 도메인 로직이
    들어가면 위반이다.
12. **런타임 의존성은 react/react-dom, 그리고 지연 로드되는 katex 뿐이다**
    ([ADR-0004](./docs/adr/0004-katex-lazy-load.md)). 새 런타임 의존성 추가는 ADR을 요구한다.
13. **원격에 쓰는 JSON은 키를 정렬해 들여쓴다.** "같은 내용 = 같은 바이트"가 no-op 푸시
    스킵과 GitHub 커밋 소음 억제의 전제다.
14. **서식은 전부 `text` 안의 마크다운 문자열이다.** 서식을 위한 별도 필드나 리치텍스트
    구조를 들이는 구현은 위반이다 — 내보내기에서 살아남고 동기화 페이로드가 그대로인 것의
    전제다. (표시 전용 플래그 `checklist`/`numbered`/`color`/`quote`는 노드 필드이고 기존
    LWW를 탄다.) 날짜 `!(2026-09-29)`도 같은 계열이다 — 필드가 아니라 문자열이라서, Dynalist에서 가져온
    노트의 날짜가 변환 없이 날짜로 보인다 ([ADR-0012](./docs/adr/0012-dates-as-text.md)).
15. **폴더·저장된 검색·휴지통은 전부 문서다** — `kind: "doc" | "folder" | "search"`와
    `deleted` 스탬프로 구분되는 같은 레코드·같은 파일·같은 병합 규칙. 이들을 위해 동기화
    페이로드나 파일 종류를 늘리는 구현은 위반이다. 퀵 캡처의 도착지도 같은 수법으로
    `Doc.inbox` 필드다 — 워크스페이스 최상위 필드로 두는 구현은 위반이다: 건너가는 것은
    `SyncPayload`(`docs` + `graves` + `keymap`) 안에 있는 것뿐이라, 문서에 딸린 값을 최상위에
    두면 기기마다 도착지가 달라진다. 여러 문서가 표시를 들고 있을 수 있으므로 **하나로 정하는 것은 읽는 쪽**
    (`inboxDoc`)이고, 모든 기기가 같은 답을 내야 한다.
16. **항목 링크 `((id))`는 라벨을 갖지 않는다 — 대상의 현재 텍스트로 렌더한다.** 링크에
    라벨을 저장하는 구현은 위반이다(대상과 어긋날 수 없음이 이 기능의 성질이다). 대상이
    사라지면 `(없는 항목)`으로 남긴다 — 조용히 지우지 않는다.
17. **백엔드의 `history`/`files`는 전송 계약이 아니라 선택적 능력이다.** 계약("버전 붙은
    JSON + CAS")에 능력을 섞는 구현은 위반이다 — REST 백엔드는 능력 없이도 완전한 백엔드다.
    읽을 수 있는 Markdown 사본도 같은 계열이지만 `Backend` 표면에 멤버를 더하지 않는다 —
    GitHub 백엔드의 `push` 안에서 끝난다 ([ADR-0007](./docs/adr/0007-markdown-mirror.md)).
18. **저장의 지속성은 요청하고, 거절당하면 말한다.** IndexedDB의 기본 등급은 best-effort이고
    그건 저장 압박·미사용 정리에 브라우저가 노트를 지울 수 있다는 뜻이다. 로컬 우선(원칙 1)을
    표방하면서 그걸 브라우저 재량에 맡기는 것은 의도된 트레이드가 아니라 구멍이다. 그래서
    `navigator.storage.persist()`를 **켤 때마다** 부르고(등급은 사용자가 앱에 정착하면서
    바뀐다), 등급이 persisted가 아니면 그 사실이 보인다. 요청하지 않는 구현, 또는 거절을
    조용히 넘기는 구현은 위반이다 — 후자는 하지 않은 보장을 한 척하는 것이다.
    **"persisted 여야 한다"는 불변식이 아니다** — 판정하는 것은 코드가 아니라 브라우저이고,
    코드가 지킬 수 있는 것은 묻는 것과 정직하게 말하는 것까지다. 네이티브 셸 안에서는 저장할 때마다
    앱이 자기 데이터 폴더에 파일을 직접 쓰므로, 등급을 `file`로 보고하고 경고하지 않는다. 그 파일
    쓰기가 실패하면 저장 실패로 보인다 ([native.md](./docs/design/native.md) 「로컬 사본」).
19. **읽을 수 있는 Markdown 사본은 파생물이고, 암호와 함께 갈 수 없다.** `.json`이 정본이고
    `.md`는 그것의 사본이다. 앱이 이 파일을 **읽는** 구현은 위반이다 — 정본이 둘이 된다.
    그리고 **암호가 걸린 워크스페이스에 사본을 남기는 구현은 위반이다** — 암호문 옆의 평문은
    암호를 건 의미를 없앤다. 끄거나 암호를 걸었을 때 이미 만들어진 사본을 지우는 데까지가 이
    불변식이고, 판정은 UI가 아니라 백엔드가 한다
    ([ADR-0007](./docs/adr/0007-markdown-mirror.md)).
20. **네이티브 셸은 바이트를 옮길 뿐 판정하지 않는다.** `src-tauri/`의 Rust 명령은 파일 읽기·조건부
    쓰기, 폴더 고르기, 외부 링크 열기, 창 불러오기만 한다. 노트를 파싱·검증·병합하는 코드를 Rust 쪽에
    두는 구현은 위반이다. 그러면 브라우저와 앱이 서로 다른 규칙으로 병합하고, 신뢰 경계(원칙 6)가
    둘로 갈라진다. 웹 코드는 `@tauri-apps/api` 없이 `window.__TAURI__` 전역만
    `src/shared/native.ts`에서 읽는다. 그래서 원칙 12의 의존성 목록이 셸 때문에 늘지 않는다
    ([ADR-0010](./docs/adr/0010-native-shell.md)).
21. **CAS가 없는 원격은 스스로 `unguarded`라고 밝히고, 그때 루프는 원격이 빠뜨린 것이 있으면
    편집이 없어도 푸시한다.** 동기화 서비스가 옮기는 폴더의 파일은 묻지 않고 바뀔 수 있어서,
    "편집이 없으면 푸시하지 않는다"는 규칙만으로는 잃어버린 쓰기가 다음 편집 때까지 복구되지 않는다.
    판정은 `mergeWorkspace(원격, 로컬)`의 객체 동일성으로 하고(원칙 4), CAS가 있는 백엔드에는 켜지
    않는다. 그리고 **이 백엔드는 남의 바이트를 지우지 않는다.** 합친 충돌 사본은 합친 결과를 쓴 뒤
    `.outliner-merged/`로 옮기되 읽은 뒤로 바뀌지 않았을 때만 옮기고, 읽지 못한 `outliner.json`은 그
    자리에 쓰기 전에 `outliner.unreadable-….json`으로 비켜 두며, 읽지 못한 사본은 건드리지 않는다.
    이 불변식이 없으면 "원격이 비어 보인다"가 곧바로 덮어쓰기가 된다 — 편집 없이도 푸시하는
    백엔드가 여기서 처음 생겼기 때문이다 ([ADR-0011](./docs/adr/0011-folder-backend.md)).

## 아키텍처

```
기기 A (브라우저)                                        기기 B (또는 같은 브라우저의 다른 탭)
┌──────────────────────────────┐                       ┌──────────────────────────────┐
│ components/  ── 렌더링만      │                       │                              │
│ 훅(useOutline …) ── 모든 동작 │                       │            (동일)             │
│ tree.ts ── 순수 트리 연산     │                       │                              │
│ store.ts ── 상태+저장+동기화 루프│                     │                              │
│ merge.ts ── 병합 판정(여기서만)│                       │                              │
│ persist ── IndexedDB 자동 저장│                       │                              │
└──────────┬───────────────────┘                       └──────────┬───────────────────┘
           │ pull → merge → push (compare-and-swap, 지면 pull부터 재시도)
           ▼                                                      ▼
      ┌────────────────────────────────────────────────────────────────┐
      │ 백엔드 = "버전 붙은 JSON을 읽고 CAS로 쓴다"는 계약의 구현체 셋:      │
      │  · 아무 GET/PUT JSON 엔드포인트 (레퍼런스 서버, Cloudflare Worker, │
      │    Firebase RTDB 경로)                                          │
      │  · GitHub 저장소 (contents API, 문서당 파일 하나)                 │
      │  · 폴더의 outliner.json (데스크톱 셸만, CAS는 기기 안에서만)       │
      │ (선택) 종단 간 암호화 — 기기를 떠나기 전에 봉하고, 원격은 크기만 본다 │
      └────────────────────────────────────────────────────────────────┘
```

## 코드 구조와 경계 규칙

```
api/            Vercel serverless — OAuth code↔token 교환 (client secret 보관처)
server/         레퍼런스 셀프 호스트 백엔드 — 정적 파일 + GET/PUT + If-Match, 의존성 0.
                앱은 이것을 import 하지 않는다. REST 백엔드가 요구하는 계약의 구현 하나일 뿐이다
  cloudflare/     같은 계약을 Workers Free 플랜의 Durable Object 위에 (worker.mjs, wrangler.toml)
src-tauri/      네이티브 셸 (Tauri 2) — 판정하지 않는다(원칙 20). folder.rs는 std만 쓰고 단독으로
                테스트된다. icons/·gen/은 생성물이라 커밋하지 않는다
public/sw.js    셸 캐시 — 오프라인으로 "여는" 것만 담당
src/
  types.ts      Node / Doc / Workspace 모델, 문서 트리(폴더) (코드가 정본)
  store.ts      상태 + 자동 저장 + 문서·폴더 조작 (동기화 루프는 sync/useSync.ts)
  history.ts    실행 취소 — 재스탬프 (원칙 10)
  app/          레이아웃 껍데기: App, Sidebar, Backlinks, Settings, Keys, Shortcuts
                appearance.ts(글꼴·너비·공유 캡처)
  outline/      트리 연산(tree.ts), 인라인 마크다운, markdown.ts(서식 키보드), dates.ts(날짜 표기),
                highlight.tsx(라이브러리 없는 코드 색), 가상화·스와이프,
                useOutline(조립 + 행 키보드·메모·확대·첨부)와 관심사별 훅 —
                useLive(공유 최신값) · useRowDrag(드래그) · useRowMenu(메뉴) ·
                useCompletion([[/#/@ 자동완성) · useRowSelection(행 선택)
    components/   Outline, Row, RowMenu, Editable, TouchBar, TeX, Attachment — 렌더링만
  palette/      palette.ts(후보 랭킹), commands.ts(앱의 모든 명령) + Palette
  sync/         merge.ts(병합 규칙), useSync.ts(pull–merge–push 루프·백오프·탭 간 핑),
                push.ts(언제 푸시하나 — CAS 없는 원격의 보정 포함)
    api/          remote/(전송 — contract·rest·github·file·codec·settings·mirror, 입구는 index.ts),
                  cipher.ts(E2EE), attachments.ts(내용 해시 이름과 object URL),
                  githubAuth.ts(OAuth 플로)
    components/   SyncSettings(+SyncBadge), HistoryPanel
  storage/      persist(IndexedDB + 지속성 등급), migrate(스키마 — v8), validate(신뢰 경계)
  search/       query.ts(질의 언어), search.ts(전체 검색), links.ts(항목 링크·백링크)
                + SearchPanel
  transfer/     Markdown/OPML/백업 변환, paths(피커가 준 경로) + useTransfer(파일 입출력)
  shared/       order(정렬 키), clock(논리 시계),
                keymap.ts(재바인딩 가능한 키 전부 + editor·dynalist 두 프리셋),
                native.ts(네이티브 셸 다리 — 브라우저에서는 전부 no-op), useDay(자정에 바뀌는 오늘),
                download, Panel(모달)
```

경계 규칙: 도메인 폴더를 가로지르는 import는 `shared/`·`types.ts`·`store.ts`를 통해서만.
렌더링은 각 도메인의 `components/`에, 동작은 훅·순수 함수에 (원칙 11).

## 하위 문서 지도 — 필요한 것만 연다

| 문서 | 언제 여나 |
|---|---|
| [docs/design/sync.md](./docs/design/sync.md) | 병합 규칙, 전송 계약·케이던스, GitHub 파일 배치, E2EE를 만질 때 |
| [docs/design/editing.md](./docs/design/editing.md) | 행 편집 모델(IME), 트리 연산 성능, 가상화, 터치 바, undo를 만질 때 |
| [docs/design/trust-boundary.md](./docs/design/trust-boundary.md) | 외부 데이터 검증, CSP, 실패 처리, 토큰·암호의 경계를 만질 때 |
| [docs/design/native.md](./docs/design/native.md) | 네이티브 셸의 명령, 로컬 사본, 폴더 허용 목록, Android 인셋, 빌드·서명·스모크 검증을 만질 때 |
| [docs/design/code-rationale.md](./docs/design/code-rationale.md) | **값을 바꾸거나 단순화하기 전에 해당 심볼을 여기서 먼저 찾아본다** |
| [docs/parity.md](./docs/parity.md) | 기능 방향의 근거 — Dynalist 격차 분석, P0~P2 이력, 스키마 변경 총계 |
| [docs/research/logseq-prior-art.md](./docs/research/logseq-prior-art.md) | Markdown 파일을 정본으로 두는 방안이나 파생 Markdown 미러를 검토할 때. Logseq이 같은 선택을 하고 물러난 기록이다 |
| [docs/research/backend-capacity.md](./docs/research/backend-capacity.md) | 자체 서버 도입, GitHub 백엔드의 한계, delta 동기화를 검토할 때 |
| [docs/design/refactor-plan.md](./docs/design/refactor-plan.md) | 진행 중 모듈 리팩터(R1~R6)의 상세 계획 — PLANS.md가 가리킨다 |
| [docs/adr/](./docs/adr/) | 구조적 결정의 이유 — "왜 이렇게 안 했는가" |
| [docs/korean-output.md](./docs/korean-output.md) | 한국어를 출력할 때. **작업 종류와 무관하게 항상 적용되므로, 이 표의 「필요한 것만 연다」 규칙의 예외다** |

## 코드가 정본인 것들 (예외 목록)

기계가 소비하는 계약 파일은 계속 코드가 정본이다. 문서는 이들을 서술만 하고, 어긋나면 문서를
고친다:

- `src/types.ts` — Node / Doc / Workspace 데이터 모델 타입
- `src/shared/keymap.ts` — 재바인딩 가능한 키의 전체 테이블
- `index.html`의 CSP 정책 값
- `public/manifest.webmanifest`, `public/icon.svg`(아이콘의 정본은 SVG, PNG는 파생), `public/sw.js`
- `package.json`의 스크립트·의존성 목록
- `.github/workflows/pages.yml` — 배포 파이프라인, `native.yml` — 설치 파일 빌드, `check.yml` — PR 검사
- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` — 셸의 식별자·창·번들 설정과 네이티브 의존성

## 알려진 한계 (의도된 트레이드 — 조용히 "고치지" 않는다)

- **같은 줄의 같은 필드를 두 기기가 동시에 고치면 한쪽이 이긴다.** 개인이 자기 기기들을
  오가는 용도에서는 맞는 트레이드다. 글자 단위 병합은 기계 장치가 한 자릿수 더 커진다.
- **체크박스·번호는 목록 단위라, 형제마다 다르게 줄 수 없다.** 부모의 필드 하나이므로 한 목록
  안에서 어떤 줄만 체크박스를 갖게 할 수는 없다 — Dynalist와 같은 트레이드다.
- **한 문서를 고치면 그 문서 전체를 올린다.** 노드 하나가 약 800바이트이므로 1만 노드 문서는
  한 번의 푸시가 7.8 MB다. REST 백엔드는 페이로드가 워크스페이스 전체라 더 먼저 아프다. delta
  전송은 "문서 하나 = 파일 하나"나 "아무 GET/PUT 엔드포인트면 된다" 중 하나를 되무는 일이라
  **지금은 하지 않는다** — 실측과 뒤집을 조건은 [ADR-0009](./docs/adr/0009-delta-sync.md).
- **원격에서 새 내용을 가져오면 실행 취소 기록이 비워진다.** 그 이전 스냅샷을 되돌리면 이
  기기가 만들지 않은 줄을 지우게 되기 때문이다.
- **30일 넘게 꺼져 있던 기기는 그동안 지워진 줄을 되살릴 수 있다.** 묘비를 영원히 들고 있지
  않기 위한 값이고, 모든 기기가 같은 규칙으로 잊으므로 서로 어긋나지는 않는다.
- **첨부는 저장소를 영구히 키우고, 봉해지면 밖에서 링크할 수 없다.** GitHub 웹 뷰에서도,
  브라우저 탭에서도 안 열린다 — 노트와 같은 인증·복호 경로로만 열린다. 1MB 상한은 contents
  API가 그보다 큰 파일의 바이트를 인라인으로 안 주기 때문이다.
- **`$$수식$$`은 KaTeX를 받아온다.** 유일한 런타임 의존성이고 앱 전체보다 네 배쯤 크다. 지연
  로드라 수식 없는 워크스페이스는 한 바이트도 안 받고, 도착 전에는 원문이 보인다 (ADR-0004).
- **코드 하이라이팅은 근사다.** 언어를 모르고 문자열·주석·숫자·키워드만 구분한다.
- **읽을 수 있는 Markdown 사본의 파일 이름은 링크를 걸 만큼 안정적이지 않다.** 같은 제목의
  문서가 새로 생기면 기존 문서의 사본이 `제목 (2).md`로 밀릴 수 있다. 읽기에는 충분하고,
  파생 파일에 그 이상을 요구하지 않기로 했다 (ADR-0007).
- **히스토리·첨부는 저장소 백엔드만의 기능이다.** 능력의 비대칭은 여기서 선을 그었다 —
  계약만으로 구현되지 않는 능력을 더 늘리지 않는다 (ADR-0005).
- **저장 등급은 브라우저가 정한다.** 원칙 18대로 묻지만, 답은 우리 것이 아니다 — Chrome은
  설치·북마크·방문 빈도로 조용히 판정하고 Firefox는 물어보며, 첫 방문은 대개 거절이다.
  그래서 등급이 persisted가 아닌 것 자체는 고장이 아니고, **거절을 숨기는 것이** 고장이다.
- **암호를 걸면 커밋 diff를 읽을 수 없다.** "읽히는 히스토리"와 암호화는 함께 가질 수 없다 —
  그래서 암호는 선택이다.
- **암호를 잃으면 원격 사본은 끝이다.** 복구 경로가 있으면 그건 종단 간 암호화가 아니다.
- 암호는 토큰 옆 `localStorage`에 있다. 막아주는 것은 "저장소를 가진 쪽이 읽는 것"이지 "이
  브라우저 프로필을 가진 사람"이 아니다.
- **단축키 프리셋은 둘이고, 둘을 합칠 수는 없다.** 마크다운 에디터 관례(⌘K = 링크)와
  Dynalist 관례(⌘] = 확대)는 같은 키를 다르게 쓰기 때문에 한 표로는 둘 다 만족시킬 수 없다.
  기본값은 `editor`이고 Dynalist 프리셋은 한 번 눌러 켜는 것이다
  ([ADR-0006](./docs/adr/0006-keymap-presets.md)).
- **프리셋은 액션을 비워 둘 수 있다.** Dynalist 프리셋에서 ⌘]는 확대라 들여쓰기 바인딩이
  비어 있다 — Tab·Shift+Tab이 바인딩이 아니라서 손해가 없다.
- **단축키 표는 기기 사이를 건너고, 화면 설정과 테마는 건너지 않는다.** 측정값은 화면의
  것이고 단축키는 사람의 것이다 ([ADR-0008](./docs/adr/0008-keymap-travels.md)). 대가로
  동기화 페이로드가 노트만 싣던 것에서 표시 설정 하나를 더 싣는 것으로 자랐다.
- **macOS 설치 파일은 서명·공증이 없다.** 유료 개발자 계정이 필요한 일이라, 처음 열 때 한 번
  우클릭 → 열기가 필요하다. Android APK는 저장소 비밀값의 키로 서명되고, 키가 없으면 빌드마다 다른
  키가 쓰여 업데이트 설치가 안 된다 (ADR-0010).
- **폴더 백엔드는 데스크톱 셸에만 있다.** Android는 경로가 아니라 content URI를 주고, 브라우저는
  백그라운드에서 폴더를 읽지 못한다. 그리고 **폴더는 앱 전용이어야 한다.** `outliner`로 시작하는
  `.json` 파일은 충돌 사본으로 읽히고, 합쳐진 뒤 `.outliner-merged/`로 옮겨지기 때문이다. Finder의
  「복제」가 만드는 `outliner copy.json`은 사람이 남긴 스냅숏으로 보고 건드리지 않는다 (ADR-0011).
- **날짜는 첫 날짜 하나만 읽고, 반복 규칙은 해석하지 않는다.** `!(2026-09-29 | 1w)`의 `| 1w`는 그대로
  보일 뿐이다. `!!`는 단어 시작에서만 날짜가 되고, Android에서는 팔레트 명령이 그 자리를 대신한다
  (ADR-0012).
- **macOS·Windows 앱은 빌드까지만 자동으로 확인된다.** 실제 앱을 구동하는 스모크 테스트는 Linux와
  Android에서만 돈다 ([native.md](./docs/design/native.md) 「검증」).
- **셸 안에서는 GitHub 로그인 버튼이 없다.** OAuth 콜백이 웹 origin으로 돌아와야 하기 때문이다.
  PAT 붙여넣기는 그대로 된다.
- `Node` 타입 이름이 DOM의 `Node`를 가린다.
