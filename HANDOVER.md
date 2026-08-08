# 인수인계 — 재작성 브랜치 (`claude/outliner-overengineering-review-1zxzy0`)

> 다음 세션 시작점. **아키텍처·실행법·설계 근거는 [`.dev.md`](./.dev.md)가 정본**이고,
> 이 문서는 "무슨 일이 있었고, 왜 그렇게 결정했고, 다음이 뭔지"만 담는다.

## 한 줄 요약

Yjs/Lexical/Firebase 기반 9,200줄 TDD 산출물을 폐기하고, 의존성 0(react/react-dom 제외)의
로컬 우선 아웃라이너로 재작성했다. 자체 병합 모델 기반 기기 간 동기화(임의 REST + **GitHub
저장소** 백엔드), GitHub OAuth 로그인, 가상화, 5중 감사에서 나온 데이터 유실 버그 수정까지 완료.

## 커밋 히스토리 (이 브랜치의 서사)

| 커밋 | 내용 |
| --- | --- |
| `736c29c` rewrite | 전면 재작성. 행 = textarea(포커스 시) / 렌더된 마크다운(비포커스) → 한글 IME가 브라우저 기본 동작. 9,200줄 → 2,345줄 |
| `ebf3587` feat | 동기화(노드 단위 LWW + 분수 인덱스 + 묘비) + 250행 초과 시 가상화. 1만 줄 붙여넣기 57초 → 3.2초 (draft 패턴) |
| `669e03d` fix | **서브에이전트 5방향 감사** 결과 수정. 핵심: 동시 삽입 시 sort 키 충돌로 해당 행 영구 편집 불가, 부활 문서가 묘비에 다시 묻힘, 논리 시계 포화, 악성 페이로드로 병합 크래시, undo가 sync에 되돌려짐. `validate.ts`(신뢰 경계)와 `history.ts`(재스탬프 undo) 신설 |
| `8b6cfc1` docs | 죽은 docs/ 트리 29파일 삭제 (사용자 지시) |
| `460819e` feat | **GitHub 저장소 백엔드**. contents API의 GET(내용+sha)/PUT(sha 요구)이 기존 전송 계약과 정확히 일치. 에코 커밋 방지, 조건부 GET, UTF-8 base64 |
| `fe01f62` refactor | **도메인 폴더 재구성**(사용자가 지정한 구조) + 컴포넌트 렌더링 전용화(Outline 400→50줄, 로직은 `useOutline`) + **GitHub OAuth 로그인**(`api/github-oauth.ts` function 하나) |

## 세션에서 내린 결정과 근거 (뒤집으려면 이유를 알아야 함)

1. **범용 CRDT 대신 자체 병합 모델.** 노드에 `parent`+`sort`(분수 인덱스), 내용/위치 스탬프 분리,
   묘비. 병합은 `sync/merge.ts` 순수 함수 하나 — 순서 무관·멱등, 테스트로 고정.
2. **병합은 영원히 클라이언트에서.** 사용자가 "Node 서버에서 병합 판정"을 제안했으나 논의 후 폐기:
   서버 병합이면 GitHub 백엔드 불가 + **E2EE 불가**(서버가 평문을 읽어야 하므로). 서버의 진짜
   가치는 즉시 전파(SSE 핑)와 로그인뿐이라는 결론.
3. **인증 = 열쇠 모델.** 도메인은 공개(코드뿐), 데이터는 기기 IndexedDB + private 리포에만.
   PAT/OAuth 토큰 소지가 곧 인증이고 판정은 GitHub이 매 요청마다 한다. 토큰 revoke = 원격 킬 스위치.
4. **OAuth의 서버 조각은 function 하나만.** client secret이 브라우저에 못 가는 유일한 이유로 존재.
   function 없는 배포는 버튼이 숨고 PAT 경로 유지. OAuth `repo` scope가 계정 전체 권한이라는
   한계는 UI에 명시했고, 좁은 권한은 fine-grained PAT 안내.
5. **테스트 철학.** 깨지기 쉬운 순수 로직만 유닛(101개), 행동은 실제 브라우저 e2e(21개 — IME 조합,
   드래그, 두 기기 병합, 적대적 서버, OAuth 콜백 포함). 구현 복제형 테스트 금지.
6. **감사 지적 중 기각한 것.** XSS(`safeHref`)는 여러 페이로드로 뚫리지 않음 확인, 프로토타입
   오염은 전역에 닿지 않음(그래도 키는 차단). `Node` 타입명이 DOM `Node`를 가리는 문제는
   churn 대비 이득이 작아 한계 목록에만 기록.

## 지금 상태

- 소스 ~4,300줄 + 테스트(유닛 101 / e2e 21) 전부 green, `tsc --noEmit` clean, 번들 68KB gzip
- e2e 실행: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`
  (이 환경 기준. GitHub 백엔드 테스트는 케이던스 때문에 `test.setTimeout(120_000)` 필요 — 30초
  기본 타임아웃이 풀 주기 30초보다 짧아서 실패처럼 보였던 전적 있음)
- **배포는 아직 안 함.** Vercel에 올리려면: 정적 빌드는 그대로 되고, OAuth는 GitHub OAuth App
  생성(callback = 배포 origin) + `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` 환경 변수 필요

## 다음 작업 큐 (사용자와 합의된 우선순위 순)

1. **문서당 파일 분할** — 지금은 워크스페이스 통짜 JSON 하나라 GitHub 커밋이 크다.
   `docs/{id}.json` + 메타 파일. 병합이 찢어진 읽기(torn read)에 안전하다는 게 검증돼 있어
   다중 파일의 비원자성이 문제가 안 된다 (이게 이 설계의 핵심 배당).
2. **CSP 메타 태그** — 몇 줄짜리 실질 보강. 토큰이 localStorage에 있으므로 XSS 표면 축소 가치 큼.
3. **E2EE** — WebCrypto AES-GCM + PBKDF2, ~80줄. "GitHub(회사)이 평문을 본다"의 유일한 해법.
   클라이언트 병합 구조라서 가능하다는 점이 논의의 핵심이었음.
4. **PWA 매니페스트** — 몇 줄. 폰 홈 화면에서 앱처럼 열리게.
5. Vercel 배포 + GitHub Pages 문서화, 모바일 터치 조작(폰에 Tab 키가 없어 들여쓰기 불가가
   실사용 최대 갭), Tauri는 필요해질 때.

## 조심할 것

- `children`은 `parent`/`sort`의 파생 캐시. 불일치는 `outline/__tests__/tree.test.ts`의 `shape()`가
  모든 연산에서 자동 검사한다 — 트리 연산을 추가하면 이 테스트를 통과해야 함.
- 바깥에서 오는 데이터는 **반드시** `storage/validate.ts`를 통과시킬 것 (동기화 응답, 파일
  가져오기, 저장소 로드가 현재의 세 진입점).
- undo는 스냅샷 복원이 아니라 **재스탬프**다 (`history.ts`) — 아니면 다음 sync가 undo를 되돌린다.
- 원격 병합 결과는 객체 동일성으로 no-op을 판별한다 — 병합/트리 코드에서 불필요한 객체 재생성은
  유휴 리렌더 루프를 되살린다 (전적 있음: 유휴 탭이 분당 50회 리렌더).
