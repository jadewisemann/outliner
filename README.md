# Outliner

Dynalist을 대신하는 로컬 우선(local-first) 아웃라이너. 브라우저에서 열고, 키보드만으로 쓰고,
데이터는 내 기기에 남고, 내 기기끼리는 알아서 합쳐진다.

> 이 README는 **실행법·기능·배포**만 담는다. 설계·불변식의 정본은 [DESIGN.md](./DESIGN.md),
> 에이전트 작업 방식은 [AGENTS.md](./AGENTS.md), Git 규칙은 [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 코어 로직 단위 테스트
npm run test:e2e   # 실제 브라우저에서의 편집·동기화 시나리오
npm run typecheck
```

## 지금 되는 것

- 무한 깊이 아웃라인, 접기/펼치기, 노드 확대(zoom)와 브레드크럼
- 키보드 우선 편집: Enter 분리, Tab/Shift+Tab, Backspace 병합, ⌘⇧↑↓ 이동, ⌘D 복제,
  ⌘⇧K 삭제 (`⌘/` 로 전체 목록)
- Esc 로 항목 단위 선택 → 여러 줄 한 번에 들여쓰기·이동·삭제·복사
- **마크다운 서식이 키보드에서 나온다** — ⌘B/I/E, ⌘⇧X/H, ⌘K 링크(선택 영역을 감싸고 다시 누르면
  벗긴다), `# `·`[] `·`1. ` 를 치면 그 자리에서 변환(직후 Backspace 하나로 되돌림),
  `[[`·`#` 자동 완성
- 메모(Shift+Enter), 체크리스트·번호 목록(목록 단위), 색 라벨 6종, 제목 수준,
  인라인 마크다운, `#태그`, `[[문서 링크]]`
- 문서와 **폴더**, **저장된 검색**, 즐겨찾기, **휴지통**(삭제해도 30일은 되살릴 수 있다)
- **항목 사이 링크** `((id))` — 라벨이 대상의 현재 텍스트라 절대 어긋나지 않는다 — 와 **백링크**
- 항목을 **다른 문서로 이동**, bullet 우클릭 **항목 메뉴**
- **팔레트**(⌘P / ⌘⇧P) — 문서·항목으로 이동하고 앱의 모든 명령을 실행한다
- **제자리 필터**(⌘F)와 워크스페이스 전체 검색(⌘⇧F), 둘 다 같은 연산자
  (`is:`·`has:`·`edited:`·`created:`·`parent:`·`ancestor:`·`"구절"`·`-제외`·`#태그`)
- **기기 간 동기화** — 오프라인 편집도 잃지 않고 병합. 백엔드는 아무 JSON `GET`/`PUT` 서버 또는 **GitHub 저장소** (문서당 파일 하나, 커밋 히스토리 = 버전 백업)
- **GitHub으로 로그인** — 배포에 OAuth function이 있으면 토큰 붙여넣기 대신 버튼 하나. 없으면 PAT 경로가 그대로 동작
- **종단 간 암호화(선택)** — 암호를 넣으면 기기를 떠나기 전에 암호화된다. 저장소를 가진 쪽은 크기와 시각만 본다
- **문서 히스토리** — 커밋 목록에서 미리보고 그 시점으로 되돌린다 (GitHub 백엔드)
- **첨부** — 이미지 붙여넣기, 저장소에 저장, 암호를 걸었으면 봉해서
- 인용 · 메모 안의 코드 블록(하이라이팅 포함) · `$$수식$$`(지연 로드)
- **표시 설정**(글꼴·크기·줄 간격·너비)과 **단축키 재바인딩**
- Markdown / OPML / 텍스트 가져오기·내보내기(여러 파일 한 번에), JSON 전체 백업
- IndexedDB 자동 저장, 실행 취소/다시 실행, 라이트·다크 테마
- **오프라인으로 열린다** — service worker가 셸을 캐시한다
- 마우스: bullet 드래그로 이동, bullet 클릭으로 확대
- 터치: 편집 중일 때 키보드 위에 들여쓰기·이동 바, **좌우 스와이프로 들여쓰기** (폰에는 Tab 키가 없다)
- 폰 공유 시트에서 바로 캡처 (Web Share Target)

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 아키텍처·핵심 불변식·코드 구조·알려진 한계 | [DESIGN.md](./DESIGN.md) |
| 동기화(병합·전송 계약·GitHub 배치·E2EE) | [docs/design/sync.md](./docs/design/sync.md) |
| 편집기(행 모델·가상화·터치 바·undo) | [docs/design/editing.md](./docs/design/editing.md) |
| 신뢰 경계(검증·CSP·실패 처리) | [docs/design/trust-boundary.md](./docs/design/trust-boundary.md) |
| 실측값·함정·실패한 대안 | [docs/design/code-rationale.md](./docs/design/code-rationale.md) |
| 기능 방향과 그 근거 (Dynalist 격차 분석) | [docs/parity.md](./docs/parity.md) |
| 결정의 이유 | [docs/adr/](./docs/adr/) |

## 테스트

`src/*/__tests__/`는 깨지기 쉬운 순수 로직만 본다 — 정렬 키, 트리 연산, 병합 규칙,
가져오기/내보내기 왕복, 인라인 파싱, 질의 언어, 서식 조작. UI 동작은 실제 브라우저에서
확인한다 — `e2e/outline.spec.ts`(편집·IME·드래그), `e2e/markdown.spec.ts`(서식 키보드),
`e2e/sync.spec.ts`(가짜 원격 서버를 사이에 둔 두 기기, 적대적인 서버, 죽은 서버, 두 탭, 암호),
`e2e/large.spec.ts`(2,000줄에서의 DOM 크기와 응답성), `e2e/touch.spec.ts`(폰 에뮬레이션·스와이프),
그리고 links / menu / blocks / settings / trash 스펙. 구현을 그대로 옮겨 적는 테스트는 두지
않는다 — 원칙은 [AGENTS.md](./AGENTS.md)의 「테스트 최소화 원칙」.

`e2e/csp.spec.ts`와 `e2e/install.spec.ts`는 **빌드 결과**를 상대로 돈다. CSP와 매니페스트는
dev 서버에서 발효되지 않기 때문이다 — Playwright가 웹 서버를 둘 띄운다(dev 5173, preview 4173).

로컬에 Playwright 브라우저가 따로 없다면:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## 배포

정적 빌드(`dist/`)를 아무 정적 호스팅에 올리면 된다. 서버가 없으므로 도메인은 공개여도
안전하다 — 노트는 각 기기의 IndexedDB와 백엔드에만 있다. 빌드의 자산 경로는 전부 상대
경로(`base: "./"`)라 도메인 루트든 저장소 하위 경로든 같은 산출물이 그대로 돈다.

`public/manifest.webmanifest`가 있어 폰 홈 화면에 담으면 자기 창으로 열린다. 아이콘의 정본은
`public/icon.svg`이고 PNG는 거기서 뽑은 것이다. `public/sw.js`가 셸을 캐시하므로 **신호가
없어도 열린다** — 노트는 원래 기기에 있었고, 없던 것은 앱을 여는 파일 몇 개뿐이었다.

worker는 **이 출처의 GET만** 만진다. 동기화는 GitHub이나 사용자가 정한 주소로 가고, 거기서
캐시된 옛 응답이 오면 그게 원격의 현재 상태로 읽혀 병합된다 — 그 요청은 네트워크에 닿거나
정직하게 실패해야 한다. 네비게이션은 네트워크 우선(배포한 새 버전이 다음 실행에 잡힌다),
나머지 자산은 이름에 내용 해시가 있으니 캐시 우선이다. 등록은 **빌드에서만** 한다.

### GitHub Pages

`.github/workflows/pages.yml`이 main에 push될 때마다 typecheck·유닛 테스트·빌드를 거쳐 올린다.
저장소 Settings → Pages에서 source를 **GitHub Actions**로 바꾸는 것 하나만 하면 된다. 결과는
`https://<owner>.github.io/<repo>/`.

serverless function이 없으므로 **GitHub 로그인 버튼은 뜨지 않는다.** 앱이 알아서 PAT 입력만
남기므로 동작에는 지장이 없다 — fine-grained PAT를 만들어 붙여넣는 쪽이 오히려 권한이 좁다.

### Vercel

저장소를 import하면 Vite는 자동 인식되고 `api/github-oauth.ts`도 function으로 자동으로 잡힌다.
로그인을 켜려면:

1. GitHub OAuth App을 만들고 callback URL을 배포 origin으로 (예: `https://outliner.vercel.app/`)
2. 프로젝트 환경 변수에 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

변수가 없으면 function이 404를 돌려주고 로그인 버튼이 숨는다. 토큰은 **신뢰할 수 있는 배포(본인이
올린 것)에만** 입력할 것 — 코드를 서빙하는 쪽이 곧 신뢰 경계다.

OAuth의 `repo` scope는 계정의 저장소 전체 권한이라는 걸 기억할 것. 노트 저장소 하나로 좁히고
싶으면 fine-grained PAT 경로를 쓰는 게 낫다.
