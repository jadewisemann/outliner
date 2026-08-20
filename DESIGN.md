# DESIGN.md — 설계·불변식의 정본

**코드는 How를, 이 문서는 What / Why / Invariant를 말한다.** 문서와 코드가 충돌하면
조용히 코드를 따르지 않고 [AGENTS.md](./AGENTS.md)의 판정 규칙대로 판정한다. 이 문서를
정본으로 승격한 결정 자체는 [ADR-0001](./docs/adr/0001-design-doc-authority.md)에 있다.

> **작성 기준: 2026-08-19, 커밋 `971b87b`.** 이 문서는 그 시점의 코드에서 추출해 동기화한
> 것이며, 이 시점 이후에 생긴 어긋남만 판정 대상이다.

## 무엇인가

Dynalist를 대신하는 로컬 우선 아웃라이너. 브라우저에서 열고, 키보드만으로 쓰고, 데이터는 내
기기에 남고, 내 기기끼리는 알아서 합쳐진다. 정적 빌드 하나가 제품의 전부이고, 서버는 노트를
저장할 뿐 판정하지 않는다.

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
12. **런타임 의존성은 react/react-dom 뿐이다.** 새 런타임 의존성 추가는 ADR을 요구한다.
13. **원격에 쓰는 JSON은 키를 정렬해 들여쓴다.** "같은 내용 = 같은 바이트"가 no-op 푸시
    스킵과 GitHub 커밋 소음 억제의 전제다.

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
      │ 백엔드 = "버전 붙은 JSON을 읽고 CAS로 쓴다"는 계약의 구현체 둘:      │
      │  · 아무 GET/PUT JSON 엔드포인트 (Firebase RTDB 경로 포함)         │
      │  · GitHub 저장소 (contents API, 문서당 파일 하나)                 │
      │ (선택) 종단 간 암호화 — 기기를 떠나기 전에 봉하고, 원격은 크기만 본다 │
      └────────────────────────────────────────────────────────────────┘
```

## 코드 구조와 경계 규칙

```
api/            Vercel serverless — OAuth code↔token 교환 (client secret 보관처)
src/
  types.ts      Node / Doc / Workspace 모델 (코드가 정본)
  store.ts      상태 + 자동 저장 + 동기화 루프
  history.ts    실행 취소 — 재스탬프 (원칙 10)
  app/          레이아웃 껍데기: App, Sidebar, Shortcuts, ErrorBoundary
  outline/      트리 연산(tree.ts), 인라인 마크다운, 가상화, useOutline(모든 동작)
    components/   Outline, Row, Editable, TouchBar — 렌더링만
  sync/         merge.ts(병합 규칙)
    api/          remote.ts(REST·GitHub 백엔드), cipher.ts(E2EE), githubAuth.ts(OAuth 플로)
    components/   SyncSettings
  storage/      persist(IndexedDB), migrate(스키마), validate(신뢰 경계)
  search/       검색·태그 집계 + SearchPanel
  transfer/     Markdown/OPML/백업 변환 + useTransfer(파일 입출력)
  shared/       order(정렬 키), clock(논리 시계), download, Panel(모달)
```

경계 규칙: 도메인 폴더를 가로지르는 import는 `shared/`·`types.ts`·`store.ts`를 통해서만.
렌더링은 각 도메인의 `components/`에, 동작은 훅·순수 함수에 (원칙 11).

## 하위 문서 지도 — 필요한 것만 연다

| 문서 | 언제 여나 |
|---|---|
| [docs/design/sync.md](./docs/design/sync.md) | 병합 규칙, 전송 계약·케이던스, GitHub 파일 배치, E2EE를 만질 때 |
| [docs/design/editing.md](./docs/design/editing.md) | 행 편집 모델(IME), 트리 연산 성능, 가상화, 터치 바, undo를 만질 때 |
| [docs/design/trust-boundary.md](./docs/design/trust-boundary.md) | 외부 데이터 검증, CSP, 실패 처리, 토큰·암호의 경계를 만질 때 |
| [docs/design/code-rationale.md](./docs/design/code-rationale.md) | **값을 바꾸거나 단순화하기 전에 해당 심볼을 여기서 먼저 찾아본다** |
| [docs/adr/](./docs/adr/) | 구조적 결정의 이유 — "왜 이렇게 안 했는가" |

## 코드가 정본인 것들 (예외 목록)

기계가 소비하는 계약 파일은 계속 코드가 정본이다. 문서는 이들을 서술만 하고, 어긋나면 문서를
고친다:

- `src/types.ts` — Node / Doc / Workspace 데이터 모델 타입
- `index.html`의 CSP 정책 값
- `public/manifest.webmanifest`와 `public/icon.svg` (아이콘의 정본은 SVG, PNG는 파생)
- `package.json`의 스크립트·의존성 목록
- `.github/workflows/pages.yml` — 배포 파이프라인

## 알려진 한계 (의도된 트레이드 — 조용히 "고치지" 않는다)

- **같은 줄의 같은 필드를 두 기기가 동시에 고치면 한쪽이 이긴다.** 개인이 자기 기기들을
  오가는 용도에서는 맞는 트레이드다. 글자 단위 병합은 기계 장치가 한 자릿수 더 커진다.
- **한 문서를 고치면 그 문서 전체를 올린다.** 문서 하나가 수만 노드가 되면 delta 전송이
  필요해진다 (PLANS.md 대기열).
- **원격에서 새 내용을 가져오면 실행 취소 기록이 비워진다.** 그 이전 스냅샷을 되돌리면 이
  기기가 만들지 않은 줄을 지우게 되기 때문이다.
- **30일 넘게 꺼져 있던 기기는 그동안 지워진 줄을 되살릴 수 있다.** 묘비를 영원히 들고 있지
  않기 위한 값이고, 모든 기기가 같은 규칙으로 잊으므로 서로 어긋나지는 않는다.
- **암호를 걸면 커밋 diff를 읽을 수 없다.** "읽히는 히스토리"와 암호화는 함께 가질 수 없다 —
  그래서 암호는 선택이다.
- **암호를 잃으면 원격 사본은 끝이다.** 복구 경로가 있으면 그건 종단 간 암호화가 아니다.
- 암호는 토큰 옆 `localStorage`에 있다. 막아주는 것은 "저장소를 가진 쪽이 읽는 것"이지 "이
  브라우저 프로필을 가진 사람"이 아니다.
- 모바일에 스와이프 제스처는 없다. 들여쓰기·이동은 키보드 위 터치 바로 한다.
- `Node` 타입 이름이 DOM의 `Node`를 가린다.
- 오프라인으로 "여는" 것은 아직 안 된다 — service worker가 없다 (PLANS.md 대기열).
