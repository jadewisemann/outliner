# IMPLEMENTATION_NOTES.md — 휘발성 working memory

작업 중 발견한 숨은 불변식·실측값·edge case·실패한 접근·문서-코드 충돌 판정 근거를
`## YYYY-MM-DD - 주제` 아래 불릿으로 적는다. **최신이 위.**

영구 지식은 Reconcile 단계에서 **승격 후 여기서 지운다** — 설계·불변식은 `DESIGN.md`, 동작
상세는 `docs/design/*`, 함정·실측값·실패한 대안은 `docs/design/code-rationale.md`.

---

## 2026-08-21 - Dynalist 전환 실사 (코드만 확인, 변경 없음)

단축키 외에 전환을 막는 것을 코드로 확인한 결과다. **계획은 PLANS.md 「Dynalist 전환 잔여」,
격차 분석 갱신은 parity.md §3의 실사 표.** 여기는 근거와 판정만 남긴다.

- **문서-코드 충돌 판정: parity.md의 "무손실 이주 ✅"(§6 P0 #5)는 과장이었다.** §3이 지시한
  5단계 중 1(실물 픽스처)과 5(폴더 구조)는 안 됐고, 3(항목 id)은 절반이다. 판정: **구현이
  덜 된 쪽** — §2는 "구현 전 분석이라 그대로 둔다"는 지시가 있으므로 §2는 손대지 않고,
  현황의 정본인 §6을 고치고 §3에 실사 표를 붙였다. 남은 구현은 PLANS로.
- **`transfer/__tests__/formats.test.ts:78`의 Dynalist 픽스처는 손으로 쓴 것이다.** 속성
  철자(`note`·`complete`·`colorLabel`·`checkbox`·`numbered`)가 전부 **추정**이라, 임포트
  충실도가 진짜 Dynalist 파일을 한 번도 만난 적 없는 가정 위에 서 있다. 이게 지금 이주
  경로의 가장 큰 위험이고, **사용자가 내보내기 파일을 주기 전에는 2·3단계를 추정 위에 또
  쌓게 된다** — 그래서 PLANS 1단계다.
- **id는 보존하는데 링크는 안 이어진다.** `OPML_FIELDS.id`가 있고 "링크가 살아남게 하는 것"
  이라는 주석까지 있는데, Dynalist의 절대 URL 링크를 `((id))`로 재작성하는 단계가 없다 —
  `formats.ts`에 `dynalist` 문자열이 아예 없다. **조건만 갖추고 마지막 한 걸음이 빈** 모양이라
  "id 보존 = 링크 이주"로 읽히기 쉽다. 실제 URL 표기는 실물로 확인해야 한다(§아래 egress).
- **`@태그`가 태그가 아니다.** `outline/inline.tsx:200`의 `TAG_PATTERN`은 `#`만 본다.
  Dynalist는 `#`·`@` 둘 다 태그다. 구현할 때 걸리는 것: `@`를 태그로 만들면 **평문 이메일
  주소가 태그가 된다** — 경계 규칙이 필요하다.
- **폴더 구조가 평평해진다.** `useTransfer.ts`의 `importFiles`가 `file.name`만 읽고 전부
  `docs.add`로 넣는다. `webkitRelativePath`를 안 본다.
- **`navigator.storage.persist()`를 아무 데서도 부르지 않는다** (`storage/persist.ts` 확인).
  IndexedDB가 best-effort 등급이라 저장 압박·iOS Safari의 미사용 정리에 노트가 브라우저
  재량으로 지워질 수 있다. **로컬 우선(원칙 1)을 표방하는 앱에서 이건 의도된 트레이드가
  아니라 구멍**이므로 DESIGN.md 「알려진 한계」에 넣지 않고 PLANS의 작업으로 뒀다.
  불변식으로 승격할지는 구현 시 판정.
- **공유 캡처 도착지가 예측 불가다.** `app/App.tsx`의 공유 캡처 effect(`sharedText` →
  `appendChild`)가 공유 텍스트를 *현재 열린 문서*의 맨 끝에 붙인다. 퀵 캡처의 요점은 "어디로 갈지 아는 것"인데 그게 없다.
- **현재 배포(Pages)에는 `api/` function이 없어 GitHub 로그인 버튼이 숨는다** —
  `githubAuth.ts`가 404를 받으면 `clientId`가 null이고 `SyncSettings.tsx:121`이 버튼을 안
  그린다. 즉 지금 유일한 경로는 PAT 붙여넣기다. 데이터를 잃지는 않으므로 대기열에 남겼다.
- **egress 제약은 지난 세션과 같다.** `help.dynalist.io`·`talk.dynalist.io`·`blog.dynalist.io`·
  `cheatkeys.com`·`defkey.com`·`web.archive.org`가 모두 프록시에서 차단된다. WebSearch의
  요약만 쓸 수 있다 — **Dynalist의 파일 형식·링크 표기를 문서로 확인할 방법이 이 환경에는
  없다.** 실물 내보내기 파일이 유일한 1차 자료다.

## 2026-08-20 - 단축키 Dynalist 프리셋

- **Dynalist 공식 문서(`help.dynalist.io`, `talk.dynalist.io`, `blog.dynalist.io`)가 이 환경의
  egress 프록시에서 전부 차단된다.** 그래서 바인딩은 검색 결과의 요약을 통해 교차 확인했고,
  **확인된 것만** `DYNALIST_KEYMAP`에서 Dynalist의 것으로 주장한다 — 확대 ⌘]/⌘[(두 출처,
  Linux 버그 리포트가 "Default shortcut key for Zoom in / Zoom out"으로 확인), 접기 ⌘.,
  굵게 ⌘B·기울임 ⌘I·코드 ⌘`(Formatting reference), 체크리스트 ⌘⇧C(⌘⌥C에서 변경됨),
  색 ⌘⇧1~6과 지우기 ⌘⇧`, 파일 파인더 ⌘O, 파일 창 ⌘⇧F, 북마크 창 ⌘⇧B, 도움말 ⌘?.
  **확인 못 한 것**: 항목 삭제·복제, 전체 검색. 이들은 `editor` 기본값을 그대로 물려받았다.
  문서에 다시 접근할 수 있게 되면 검증할 대상이다.
- **`moveUp`/`moveDown`(⌘⇧↑↓)은 요약들이 서로 엇갈렸다** — "Ctrl+Up/Down으로 움직인다"는
  서술과 "⇧+Ctrl+Up/Down" 요청 스레드가 같이 나온다. ⌘.가 접기인 것이 확인되었으므로
  ⌘⇧↑↓ 쪽으로 두었고(기존 기본값과도 같다), 이건 **추정이다.**
- **`Shortcuts.tsx`의 하드코딩은 프리셋이 드러낸 기존 버그였다.** 재바인딩 기능이 P2에서
  들어온 시점부터 도움말은 이미 거짓말을 할 수 있었다 — 프리셋이 그걸 절반의 사용자에게
  상시화했을 뿐이다. 판정: 구현이 틀린 쪽. 실제 키맵을 읽게 고쳤다.
- **`csp.spec.ts` 실패는 내 변경이 아니었다.** 처음 1회 실패 + 단독 재현 1회로 내 변경을
  의심했지만, `--repeat-each=6`으로 재보니 **내 트리 2/6, 깨끗한 트리 1/6** 실패 — 기존
  경합이다. 원인은 디바운스 저장과 reload의 경합(스냅샷에 새 문서가 아예 없다). 소표본
  한두 번으로 인과를 판정하면 안 된다는 전적으로 남긴다. 승격: code-rationale.md 함정.
- **페이지가 되돌릴 수 없는 키가 있다는 게 표를 두 번 고치게 했다.** 처음엔 두 프리셋이 같은
  키를 쓰게 했는데(⌘⇧C 체크리스트, ⌘⇧` 색 지우기, ⌘⇧[ 모두 접기), 전부 Chrome 검사기·macOS
  창 돌리기·탭 이동이 먼저 먹는 키였다 — `preventDefault()`가 닿지 않는다. 기본 표는
  살아남는 키로(⌘⌥[·⌘⌥]·⌘⇧L·⌘⇧0), Dynalist 표는 진짜 키로 갈라놨다. 승격: ADR-0006.
- `bulkPatch`는 구조를 안 건드리므로 `shape()`가 안전하지만, **같은 값 쓰기는 건너뛰어야**
  한다 — 안 그러면 색을 두 번 누를 때마다 새 맵이 생겨 원칙 4를 깬다. 테스트로 고정했다.

## 2026-08-20 - R2 useOutline 분할

- **350줄 목표는 계획 내부에서 모순이었다.** refactor-plan.md는 "서식·구조 분기, 메모,
  확대, 첨부는 useOutline에 남는다"고 지시하면서 목표를 350줄 아래로 잡았는데, 남기라는
  것들(onTextKeyDown ~170줄 + api 조립 ~110줄 + OutlineView 타입/import ~100줄)만으로
  350을 넘는다. 지시를 따르고 목표는 실측으로 갱신했다: 834 → 566줄 (-32%).
  더 줄이려면 "행 키보드" 관심사(onTextKeyDown + autoUndo)를 다섯 번째 훅으로 뽑는
  결정이 필요하다 — 계획의 "조립만 한다"와는 맞고, "남긴다" 문장과는 어긋난다.
- **`Choice`/`Completion` 타입은 useCompletion.ts로 옮기되 useOutline이 재수출한다** —
  Row.tsx·팔레트의 import 경로를 깨지 않기 위해 (R2의 "Outline.tsx/Row.tsx 무변경" 기준).
- **onTextKeyDown의 자동완성 분기는 boolean 반환으로 순서를 유지한다** — completions
  .onKeyDown이 true를 돌려주면 그 키는 소비된 것: 계획이 지시한 패턴 그대로.
- e2e `settings.spec.ts:12`(표시 설정 리로드)가 4단계 검증의 전체 실행에서 1회 실패,
  단독 재실행에서 통과, 5단계 전체 실행(64/64)에서 재관찰 안 됨 — 변경 경로(자동완성)와
  무관한 flake로 판정. 다시 나타나면 그때는 조사 대상.
