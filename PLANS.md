# PLANS.md — 진행 중 변경의 계획서

계획마다 **목표 / 원칙 / 단계별 체크리스트 / 완료 기준**을 적는다. 끝난 계획은 지우고 결과를
DESIGN.md(및 하위 문서)에 반영한다.

## 진행 중

(없음)

## 대기열 — 계획으로 승격 전

1. **실제 배포** — Pages는 저장소 Settings → Pages에서 source를 GitHub Actions로 바꾸면
   `.github/workflows/pages.yml`이 돈다. Vercel + OAuth 로그인은 OAuth App 생성(callback =
   배포 origin) + `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` 환경 변수. **계정 소유자만 할 수
   있어서 여기서 멈춰 있다.**
2. **service worker** — 매니페스트만으로는 오프라인으로 "열리지" 않는다. 노트는 이미 기기에
   있고 셸 캐시만 없는 상태 — 홈 화면 아이콘을 눌렀는데 신호가 없으면 빈 화면이 뜬다.
3. **모바일 스와이프 제스처** — 터치 바로 들여쓰기는 되지만, 익숙해지면 스와이프가 빠르다.
4. 레퍼런스 셀프 호스트 서버 (정적 파일 + `GET`/`PUT` + `If-Match`, 파일 하나면 된다)
5. 날짜 항목과 일정 표기
6. 아주 큰 워크스페이스를 위한 delta 동기화
7. Tauri — 필요해질 때
