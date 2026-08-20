# PLANS.md — 진행 중 변경의 계획서

계획마다 **목표 / 원칙 / 단계별 체크리스트 / 완료 기준**을 적는다. 끝난 계획은 지우고 결과를
DESIGN.md(및 하위 문서)에 반영한다.

(진행 중인 계획 없음 — 모듈 리팩터 R1~R4는 2026-08-20 완료.
실행 기록은 [docs/design/refactor-plan.md](./docs/design/refactor-plan.md)의 「실행 현황」,
결과는 DESIGN.md 구조 트리에 반영. R2 완료 기준 전부 충족: 유닛 191·e2e 64 개수 불변
전부 green, `Outline.tsx`/`Row.tsx` 무변경, `useOutline.ts` 834 → 566줄.)

## 대기열 — 계획으로 승격 전

1. **GitHub 로그인 켜기 (선택)** — Pages 배포는 2026-08-20 완료: 소유자가 Settings →
   Pages source를 GitHub Actions로 바꿔 deploy 잡까지 green, 이후 main 병합마다 자동
   배포. 남은 것은 로그인 버튼뿐 — Vercel + OAuth App 생성(callback = 배포 origin) +
   `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (README 「Vercel」). 없어도 PAT 경로는 동작.
2. **디자인 리뷰 잔여** — 본문 여백·측정값 미세조정만 남음 (사용자가 실사용에서 거슬리는
   지점을 짚어주면 그때 정확히). 터치바 아이콘화는 2026-08-20 완료 — 글리프를 인라인
   SVG로. 큰 것(지면과 도형, 거터 정렬, 토큰 분리, 마커 통합)은 끝났다.
3. 레퍼런스 셀프 호스트 서버 (정적 파일 + `GET`/`PUT` + `If-Match`, 파일 하나면 된다)
4. 아주 큰 워크스페이스를 위한 delta 동기화
5. R5(`Doc` 판별 유니온 — **물면 그때**)

(R6 CSS 분할은 2026-08-20 완료 — tokens/chrome/outline/panels 네 파일, 규칙 순서 불변.
[refactor-plan.md](./docs/design/refactor-plan.md) 「R6」.)

(백엔드 능력 비대칭의 결정은 2026-08-20 해소 — 선을 긋는 쪽으로,
[ADR-0005](./docs/adr/0005-backend-capability-line.md).)

## 범위에서 뺀 것 (다시 논의하려면 근거부터)

- **날짜·일정 계열** — 사용자 결정. [docs/parity.md](./docs/parity.md) §5.
- **Tauri 데스크톱** — PWA가 설치·오프라인·공유 캡처까지 하는 지금, 남는 것은 작업 표시줄
  아이콘 정도인데 대가가 Rust 툴체인과 플랫폼별 빌드다. [docs/parity.md](./docs/parity.md) §6.
- **WYSIWYG(편집 중 서식 표시)** — contenteditable이 필요해서 한글 IME를 반납하게 된다.
