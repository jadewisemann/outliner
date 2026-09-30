# IMPLEMENTATION_NOTES.md — 휘발성 working memory

작업 중 발견한 숨은 불변식·실측값·edge case·실패한 접근·문서-코드 충돌 판정 근거를
`## YYYY-MM-DD - 주제` 아래 불릿으로 적는다. **최신이 위.**

영구 지식은 Reconcile 단계에서 **승격 후 여기서 지운다** — 설계·불변식은 `DESIGN.md`, 동작
상세는 `docs/design/*`, 함정·실측값·실패한 대안은 `docs/design/code-rationale.md`.

---

## 2026-09-30 - 정리: 결함 수정, FSD light 재배치, 문서 대조

- **사용자가 리팩터·코드 정리·문서 윤문을 요청했고, 이어서 FSD를 가볍게 따르는 구조를 요청했다.**
  구조의 결정은 [ADR-0013](./docs/adr/0013-fsd-light.md), 실행 기록은 refactor-plan.md 「R7」에 있다.
  동작을 바꾸는 수정은 아래 결함뿐이고, 나머지는 옮기기와 나누기다. main 빌드와 이 브랜치 빌드로 찍은
  스크린샷 12장이 바이트 단위로 같았다.
- **고친 결함.** 모두 이번 정리 중에 찾았고, 사용자가 겪었다고 보고한 것은 없다.
  - 허용 목록에 줄바꿈 주입: 이름에 `\n`을 넣으면 확인 한 번으로 폴더 둘이 목록에 올랐다. `folder.rs`가
    줄바꿈·NUL이 든 이름을 거절한다(native.md 「폴더 허용 목록」, 테스트 1건).
  - 레퍼런스 서버가 경로에 공백·한글·심볼릭 링크가 있거나 Windows이면 아무것도 듣지 않고 종료 코드 0으로
    끝났다. 실제 경로로 비교하게 고쳤다(code-rationale.md 함정).
  - Worker가 Durable Object 호출에 실패하면 CORS 헤더 없는 500이 나가, 브라우저가 네트워크 오류로
    보고했다. 잡아서 헤더를 단 500으로 답한다.
  - `server.spec.ts`에 두 기기의 경합이 있었다. 두 스펙이 함께 쓰는 `e2e/two-devices.ts`로 모았다.
  - 폴더가 서로를 품는 순환(원격에서 올 수 있다)이 들어오면 `documents.nestsInto`가 끝나지 않아 탭이
    멈췄다. 지나간 폴더를 기억한다.
  - 병합 결과에 문서가 하나도 없으면 적용은 건너뛰면서 실행 취소 기록만 지웠다. 적용 여부를 먼저 본다.
  - 셸의 로컬 사본에 `workspace`가 객체가 아니어도 더 최근의 사본으로 이겼고, 다음 저장이 빈
    워크스페이스로 IndexedDB를 덮어썼다. 그런 파일은 사본이 아닌 것으로 본다(trust-boundary.md).
  - `localStorage`의 테마 값을 검사 없이 썼다. `light`·`dark`만 받는다.
  - 도구 막대·메뉴·필터·팔레트의 단축키 표기가 고정 문자열이라 Dynalist 프리셋에서 틀린 키를 보였다.
    표에서 읽는다(`chordOf`·`withChord`, editing.md 「도움말은 표를 읽는다」).
  - 동기화 패널이 합친 충돌 사본을 "지운다"고 적고 있었다. 실제로는 `.outliner-merged/`로 옮긴다.
  - 사이드바가 즐겨찾기를 키를 칠 때마다 모든 노드에서 다시 모았다. 지연된 워크스페이스로 계산한다.
  - FSD 이동 뒤 `worker.yml`의 경로 필터가 옛 `src/sync/**`를 가리켜, 동기화 코드를 고쳐도 Worker
    계약 검사가 돌지 않을 참이었다. `src/entities/sync/**`와 `e2e/two-devices.ts`로 고쳤다.
- **고치지 않고 남긴 어긋남.** 동작을 바꾸는 결정이라 조용히 고치지 않았다. 필요해지면 하나씩 판정한다.
  - 자동 서식 직후의 되돌리기가 수정 키를 보지 않는다. ⌘Backspace도 접두사를 되돌린다. 행 합치기의
    Backspace도 수정 키를 보지 않으므로 일관되기는 하다.
  - 되돌리기 기억은 키를 눌러야만 사라진다. 마우스로 캐럿을 옮긴 뒤 줄 처음에서 누른 Backspace는 행을
    합치지 않고 접두사를 되돌린다.
  - `!!`와 Space의 확장은 서식·구조·목록·색 바인딩 뒤, 확대·접기·이동·완료 바인딩 앞에서 돈다. 수정 키
    없는 `!`나 Space를 뒤의 넷에 바인딩하면 확장이 먼저 먹는다.
  - 행 메뉴의 「인용 해제」와 「항목 링크 복사」는 키보드로 닿는 길이 없다(인용은 `> `로 켤 수만 있다).
    복제·삭제는 키는 있지만 팔레트 명령이 아니다.
- **문서가 틀린 쪽이었던 것 둘.** DESIGN.md 원칙 13은 원격 JSON을 전부 정렬·들여쓰기한다고 했지만,
  REST 본문은 main에서도 압축 JSON이었다. 원칙 9는 푸시 여부를 평문 직렬화로 정한다고 했지만, 루프는
  편집 카운터로 정하고 직렬화 비교는 GitHub의 파일 단위에서만 한다. 둘 다 서술을 코드에 맞췄다.
- **확인하지 못한 것.** backend-capacity.md §5의 Oracle 유휴 판정 기준(95백분위 10% 미만)은 2023년
  이후의 2차 자료 여럿이 20%로 적는다. 공식 문서는 이 환경에서 403이라 확인하지 못했고, 조사 문서는
  기록이라 고치지 않았다. 무료 VM을 다시 검토할 때 1차 자료로 확인한다.
- **윤문.** 사람과 에이전트가 읽는 문서를 docs/korean-output.md에 맞췄다. 제목·「」 인용·코드·링크·수치는
  그대로 두고 문장만 고쳤다. 450줄이 넘는 파일을 한 번에 맡긴 하위 에이전트는 결과 없이 끝났으므로, 파일
  하나나 반쪽씩 나눠 맡겼다.
- **검증:** typecheck, `check:layers`, 유닛 277건, build, e2e 78건(5건은 Worker 런타임이 없어 건너뜀),
  `folder.rs` 테스트 9건, rustfmt, 스크린샷 12장 비교.

## 2026-09-30 - 화면을 Apple 앱의 모양으로

- **사용자 요청으로 팔레트와 컨트롤 모양을 macOS·iOS의 것으로 바꿨다.** 중립색은 system gray, 강조색은
  초록(`#3d7f6e`)에서 systemBlue로 바뀌었다. 도구 막대·메뉴·자동완성은 반투명 재질(`--material`,
  `backdrop-filter`)이고, 선택지는 segmented control, 켜고 끄는 설정은 스위치, 할 일 체크박스는
  미리 알림처럼 원형이다. 문서 제목은 large title 크기(본문의 2배)다.
- **명암비:** 색 라벨 잉크는 Apple이 고대비용으로 내놓은 변형을 썼고, 초록만 4.4:1이어서 한 단계 더
  어둡게 했다. `--muted`는 흰 바탕에서 5.07:1이다. `--accent-fill`, `--ink-N`, `sw.js`의 캐시 이름은
  code-rationale.md로 승격했다.
- **기본 글꼴 스택이 Inter를 먼저 찾고 있었다**(`appearance.ts`). San Francisco를 먼저 찾게 바꿨다.
  Windows에서는 Segoe UI Variable, 한글은 Apple SD Gothic Neo가 받는다.
- **앱 아이콘도 새 강조색으로 바꿨다.** 정본 `public/icon.svg`는 위에서 빛을 받는 파란 그라디언트이고,
  PWA용 PNG 셋은 그 SVG를 Chromium으로 래스터화해 다시 만들었다. 네이티브 앱 아이콘은 CI가 같은 SVG에서
  매번 생성한다.

## 2026-09-29 - 네이티브 앱: 검증 환경

발견과 판정은 native.md(「Android: 창 인셋」, 「플랫폼별로 다른 것」, 「검증」), ADR-0011 「리뷰 후기」,
code-rationale.md로 승격했다. 여기에는 작업 환경의 사정만 남긴다.

- **작업 환경은 npm 레지스트리·crates.io·Actions 아티팩트 저장소에 닿지 못했고, git과 GitHub API에는
  닿았다.** 그래서 검증 경로를 git 위에 세웠다.
  - `toolchain.yml`(수동 실행)이 러너에서 `npm ci`를 하고 `node_modules`를 `toolchain-cache` 브랜치에
    올린다. 그것을 git으로 받아 로컬에서 typecheck·Vitest·Playwright를 모두 돌렸다. 제품과 무관한 우회로라
    수동 실행으로만 남겼고, 브랜치는 언제 지워도 된다.
  - 스모크 테스트의 스크린샷과 결과는 `ci-evidence/<이름>` 브랜치로 나온다. 스크린샷을 직접 보고 UI를
    판정했다.
  - Rust 쪽 디스크 코드(`folder.rs`)를 std만 쓰게 나눈 것도 이 제약에서 나왔다. Tauri 없이
    `rustc --test`로 로컬에서 돌 수 있기 때문이다. 결과적으로 설계로도 낫다(원칙 20의 경계가 파일 경계와
    같아졌다).

## 2026-09-01 - delta 동기화: 재고 나서 하지 않기로 판정

- **판정과 근거는 [ADR-0009](./docs/adr/0009-delta-sync.md), 실측은
  [backend-capacity.md](./docs/research/backend-capacity.md) 「2026-09-01 실측」이다.**
- **확인 못 한 것:** GitHub contents API의 **쓰기** 크기 상한. egress 제약으로 문서에 닿지
  못했다. 읽기가 blobs raw라 1MB 상한을 안 타는 것은 코드로 확인했지만, 쓰기 쪽은 실제 거절이
  관측되어야 1차 자료가 생긴다.

## 2026-08-21 - Dynalist 전환 잔여 2·4·5·6단계

계획과 판정 결과는 PLANS.md 「Dynalist 전환 잔여」에 있고, 이 항목의 발견은 DESIGN.md 원칙 15·18,
editing.md, code-rationale.md, parity.md로 승격했다. 여기에는 다음 세션이 이어받을 것만 남긴다
(경로는 당시의 것이다. 지금의 경로는 ADR-0013의 표로 읽는다).

**다음 세션이 이어받을 것 (1·3단계 — 사용자 파일 대기)**

- **`transfer/__tests__/formats.test.ts`의 Dynalist 픽스처는 손으로 쓴 것이다.** 속성 철자
  (`note`·`complete`·`colorLabel`·`checkbox`·`numbered`)가 전부 **추정**이라, 임포트 충실도가
  진짜 Dynalist 파일을 한 번도 만난 적 없는 가정 위에 서 있다. 이게 지금 이주 경로에 남은
  가장 큰 위험이다.
- **id는 보존하는데 링크는 안 이어진다.** `OPML_FIELDS.id`가 있고 "링크가 살아남게 하는 것"
  이라는 주석까지 있는데, Dynalist의 절대 URL 링크를 `((id))`로 재작성하는 단계가 없다 —
  `formats.ts`에 `dynalist` 문자열이 아예 없다. 실제 URL 표기는 실물로 확인해야 한다.
- **egress 제약은 지난 세션과 같다.** `help.dynalist.io`·`talk.dynalist.io`·`blog.dynalist.io`·
  `cheatkeys.com`·`defkey.com`·`web.archive.org`가 모두 프록시에서 차단된다. WebSearch의
  요약만 쓸 수 있다 — **Dynalist의 파일 형식·링크 표기를 문서로 확인할 방법이 이 환경에는
  없다.** 실물 내보내기 파일이 유일한 1차 자료다.
- **현재 배포(Pages)에는 `api/` function이 없어 GitHub 로그인 버튼이 숨는다** —
  `githubAuth.ts`가 404를 받으면 `clientId`가 null이고 `SyncSettings.tsx`가 버튼을 안 그린다.
  즉 지금 유일한 경로는 PAT 붙여넣기다. 데이터를 잃지는 않으므로 대기열에 남겼다.

## 2026-08-20 - 단축키 Dynalist 프리셋

- **Dynalist 공식 문서(`help.dynalist.io`, `talk.dynalist.io`, `blog.dynalist.io`)가 이 환경의
  egress 프록시에서 전부 차단된다.** 확인된 바인딩은 ADR-0006 「모르는 것을 Dynalist의 것처럼 적지
  않는다」에 있다. **확인 못 한 것**은 항목 삭제·복제와 전체 검색이고, `editor` 기본값을 그대로
  물려받았다. `moveUp`/`moveDown`(⌘⇧↑↓)은 요약들이 서로 엇갈려서 기존 기본값대로 두었고, 이것은
  **추정이다.** 문서에 다시 접근할 수 있게 되면 검증할 대상이다.
