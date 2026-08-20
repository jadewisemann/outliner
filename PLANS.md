# PLANS.md — 진행 중 변경의 계획서

계획마다 **목표 / 원칙 / 단계별 체크리스트 / 완료 기준**을 적는다. 끝난 계획은 지우고 결과를
DESIGN.md(및 하위 문서)에 반영한다.

## 진행 중 — 모듈 리팩터

- **목표:** 기능을 더하지 않고 구조만 고친다. 동작이 하나라도 바뀌면 실패다.
- **정본:** [docs/design/refactor-plan.md](./docs/design/refactor-plan.md) — 건드리면 안 되는
  것과 단계별 검증 기준이 거기 있다. `claude/handover-refactoring-y4kt42` 브랜치가 P0~P2
  이전 코드 위에서 같은 취지의 분할을 실행한 **참고 구현**이다 (그대로 병합은 불가 — 기능
  이전 코드 기준이라 내용이 낡았다).
- **체크리스트:**
  - [x] R1 — `app/keymap.ts` → `shared/keymap.ts` (의존성 간선 제거)
  - [x] R3 — `sync/api/remote.ts` 분할 → `sync/api/remote/{index,contract,rest,github,codec,settings}.ts`
  - [x] R4 — `store.ts`에서 동기화 루프를 `sync/useSync.ts`로 (615 → 454줄)
  - [ ] R2 — `useOutline.ts`를 관심사별 훅으로 (단계별로, 매 단계 전체 테스트)
    - [x] 1단계 `useRowDrag` (834 → 796줄)
    - [ ] `useLive`(공유 ref 묶음) → `useRowMenu` → `useCompletion` → `useRowSelection`,
      남는 것 350줄 아래 목표
- **완료 기준:** 유닛·e2e 개수 불변 전부 green, `Outline.tsx`/`Row.tsx` 무변경(R2),
  `grep -rn 'from "../app/' src/outline …`이 비어 있음(R1 — 달성).

## 대기열 — 계획으로 승격 전

1. **실제 배포** — 저장소 Settings → Pages에서 source를 GitHub Actions로 (계정 소유자만.
   main의 Pages 워크플로 deploy 잡이 이것 때문에 빨갛다). Vercel + OAuth 로그인은 OAuth App
   생성(callback = 배포 origin) + `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
2. **백엔드 능력 비대칭의 결정** — 히스토리·첨부는 GitHub 백엔드에만 있다. 선을 긋거나(권장:
   "저장소 백엔드만의 기능"으로 문서·UI에 명시), REST에도 능력을 주거나, 능력 없는 UI를
   일급으로. [refactor-plan.md](./docs/design/refactor-plan.md) 「남겨둔 리스크」.
3. **디자인 리뷰 잔여** — 본문 여백·측정값 미세조정, 터치바 아이콘화. 큰 것(지면과 도형,
   거터 정렬, 토큰 분리, 마커 통합)은 끝났다.
4. 레퍼런스 셀프 호스트 서버 (정적 파일 + `GET`/`PUT` + `If-Match`, 파일 하나면 된다)
5. 아주 큰 워크스페이스를 위한 delta 동기화
6. R5(`Doc` 판별 유니온 — **물면 그때**) · R6(CSS 분할 — 급하지 않음)

## 범위에서 뺀 것 (다시 논의하려면 근거부터)

- **날짜·일정 계열** — 사용자 결정. [docs/parity.md](./docs/parity.md) §5.
- **Tauri 데스크톱** — PWA가 설치·오프라인·공유 캡처까지 하는 지금, 남는 것은 작업 표시줄
  아이콘 정도인데 대가가 Rust 툴체인과 플랫폼별 빌드다. [docs/parity.md](./docs/parity.md) §6.
- **WYSIWYG(편집 중 서식 표시)** — contenteditable이 필요해서 한글 IME를 반납하게 된다.
