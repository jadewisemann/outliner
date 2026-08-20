# IMPLEMENTATION_NOTES.md — 휘발성 working memory

작업 중 발견한 숨은 불변식·실측값·edge case·실패한 접근·문서-코드 충돌 판정 근거를
`## YYYY-MM-DD - 주제` 아래 불릿으로 적는다. **최신이 위.**

영구 지식은 Reconcile 단계에서 **승격 후 여기서 지운다** — 설계·불변식은 `DESIGN.md`, 동작
상세는 `docs/design/*`, 함정·실측값·실패한 대안은 `docs/design/code-rationale.md`.

---

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
