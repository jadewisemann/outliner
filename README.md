# Outliner

Dynalist를 대신하는 로컬 우선(local-first) 아웃라이너다. 브라우저에서 열어 키보드만으로 작성하고,
데이터는 내 기기에 남으며, 내 기기 사이에서는 데이터가 자동으로 합쳐진다. macOS·Windows·Linux·Android에
설치되는 앱도 같은 빌드에서 만들어진다.

> 이 README는 **실행법·기능·배포**만 담는다. 설계·불변식의 정본은 [DESIGN.md](./DESIGN.md)이고,
> 에이전트 작업 방식은 [AGENTS.md](./AGENTS.md)에서, Git 규칙은 [CONTRIBUTING.md](./CONTRIBUTING.md)에서 다룬다.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 코어 로직 단위 테스트
npm run test:e2e   # 실제 브라우저에서의 편집·동기화 시나리오
npm run typecheck
npm run check:layers   # 소스 구조 규칙 (docs/adr/0013-fsd-light.md)
```

## 지금 되는 것

- 무한 깊이 아웃라인, 접기/펼치기, 노드 확대(zoom)와 브레드크럼
- 키보드 우선 편집: Enter 분리, Tab/Shift+Tab, Backspace 병합, ⌘⇧↑↓ 이동, ⌘D 복제,
  ⌘⇧K 삭제 (전체 목록은 `⌘/` 로 본다)
- Esc 로 항목 단위 선택을 시작하면 여러 줄을 한 번에 들여쓰기·이동·삭제·복사할 수 있다
- **마크다운 서식을 키보드로 입력한다**: ⌘B/I/E, ⌘⇧X/H, ⌘K 링크(선택 영역을 감싸고, 다시 누르면
  벗긴다), `# `·`[] `·`1. ` 를 치면 그 자리에서 일어나는 변환(직후에 Backspace를 한 번 누르면 되돌아간다),
  `[[`·`#`·`@` 자동 완성
- **날짜**: Dynalist 표기 `!(2026-09-29)`가 「오늘」「내일」「10월 2일 (금)」으로 표시되고, 지난 날짜는 다른
  색으로 보인다. 단어 시작에서 `!!`를 치면 오늘 날짜가 입력된다. `date:today`·`date:overdue`·`date:7d`로 검색한다
- 메모(Shift+Enter), 체크리스트·번호 목록(⌘⇧L / ⌘⇧7, 목록 단위), 색 라벨 6종(⌘⇧1~6,
  지우기 ⌘⇧0), 제목 수준, 인라인 마크다운, `#태그`·`@태그`, `[[문서 링크]]`
- 문서와 **폴더**, **저장된 검색**, 즐겨찾기, **휴지통**(삭제해도 30일 동안은 되살릴 수 있다)
- **항목 사이 링크** `((id))` (라벨이 대상의 현재 텍스트이므로 절대 어긋나지 않는다)와 **백링크**
- 항목을 **다른 문서로 이동**, bullet을 우클릭하면 열리는 **항목 메뉴**
- **팔레트**(⌘P / ⌘⇧P): 문서·항목으로 이동하고 앱의 모든 명령을 실행한다
- **제자리 필터**(⌘F)와 워크스페이스 전체 검색(⌘⇧F)은 둘 다 같은 연산자
  (`is:`·`has:`·`date:`·`edited:`·`created:`·`parent:`·`ancestor:`·`"구절"`·`-제외`·`#태그`·`@태그`)를 쓴다
- **설치되는 앱**: macOS·Windows·Linux·Android (Tauri 2). 저장할 때마다 노트가 앱 데이터 폴더에 파일로도 남기 때문에,
  웹뷰 저장소가 비워져도 노트가 복구된다. 자세한 내용은 아래 「네이티브 앱」을 참고한다
- **기기 간 동기화**: 오프라인에서 편집한 내용도 잃지 않고 병합한다. 백엔드로는 **GitHub 저장소**(문서당 파일 하나, 커밋 히스토리 = 버전 백업), **동기화 서비스 폴더의 파일 하나**(데스크톱 앱), 아무 JSON `GET`/`PUT` 서버(무료 Cloudflare Worker·직접 띄우는 서버)를 쓸 수 있다. 자세한 내용은 아래 「동기화 선택지」를 참고한다
- 데스크톱 앱에서는 **⌘⌥O / Ctrl+Alt+O**가 어디서든 창을 불러온다
- **GitHub으로 로그인**: 배포에 OAuth function이 있으면 토큰을 붙여넣는 대신 버튼 하나로 로그인한다. 없으면 PAT 경로가 그대로 동작한다
- **종단 간 암호화(선택)**: 암호를 넣으면 데이터가 기기를 떠나기 전에 암호화된다. 저장소를 가진 쪽은 크기와 시각만 본다
- **문서 히스토리**: 커밋 목록에서 이전 버전을 미리 보고, 그 시점으로 되돌린다 (GitHub 백엔드)
- **첨부**: 이미지를 붙여넣으면 저장소에 저장하고, 암호를 걸었으면 봉해서 저장한다 (GitHub 백엔드)
- **읽을 수 있는 Markdown 사본(선택, 기본 꺼짐)**: 문서마다 `markdown/제목.md`를 함께 커밋하므로 앱 없이 저장소만으로도 노트를 읽을 수 있다. 이 사본은 앱이 다시 읽지 않는 파생 사본이고, **암호를 걸면 켤 수 없다** (GitHub 백엔드)
- 인용 · 메모 안의 코드 블록(하이라이팅 포함) · `$$수식$$`(지연 로드)
- **표시 설정**(글꼴·크기·줄 간격·너비, 기기마다 따로 적용된다)과 **단축키 재바인딩**(다른 기기에도 그대로 적용된다)
- **단축키 프리셋 둘**: 기본 `에디터`(⌘K 링크, ⌘] 들여쓰기)와 `Dynalist`(⌘] 확대, ⌘` 코드,
  ⌘O 파일 파인더). Dynalist에서 옮겨 온 사용자는 한 번 눌러 프리셋을 바꾸면 된다. 어느 쪽이든 Enter·Tab·
  화살표 키의 동작은 바뀌지 않는다
- Markdown / OPML / 텍스트 가져오기·내보내기(여러 파일을 한 번에), **폴더째 가져오기**(폴더
  구조가 그대로 문서 트리가 된다), JSON 전체 백업
- IndexedDB 자동 저장, 실행 취소/다시 실행, 라이트·다크 테마
- **저장 지속성을 요청한다**: 저장 공간이 부족할 때 브라우저가 노트를 지우지 않도록 하기 위해서다. 등급은 동기화
  패널에 적혀 있고, 요청이 거절되었는데 원격 사본도 없으면 그 사실을 알린다
- **오프라인에서도 열린다**: service worker가 셸을 캐시하기 때문이다
- 마우스: bullet 드래그로 이동, bullet 클릭으로 확대
- 터치: 편집 중일 때 키보드 위에 나타나는 들여쓰기·이동 바, **좌우 스와이프로 들여쓰기** (폰에는 Tab 키가 없다)
- 폰 공유 시트에서 바로 캡처 (Web Share Target): 공유한 내용은 **인박스로 지정한 문서**로 들어가고, 그
  문서가 열린다. 인박스는 팔레트에서 바꾸고, 사이드바의 `↓` 가 어느 문서가 인박스인지 알려준다

## 동기화 선택지

동기화는 선택 사항이다. 켜지 않으면 각 기기에서 로컬로만 쓴다. 켜면 병합은 언제나 기기에서 일어나고,
원격은 바이트를 보관할 뿐이다. 아래 세 선택지는 모두 무료이고, 모두 암호를 걸 수 있다.

| 선택지 | 어디서 되나 | 좋은 점 | 대가 |
|---|---|---|---|
| **GitHub 저장소** (권장 기본값) | 모든 기기 | 커밋 히스토리가 곧 버전 백업이고, 문서 히스토리와 첨부를 쓸 수 있다. 운영할 서버가 없다 | 푸시가 10초 간격이다. PAT 하나를 만들어야 한다 |
| **이 컴퓨터의 폴더** | 데스크톱 앱 | 파일 하나(`outliner.json`)가 정본이다. iCloud Drive·Dropbox·Google Drive·OneDrive·Syncthing 폴더를 고르면 그 서비스가 파일을 옮겨 준다. 계정이 따로 필요 없다. 충돌 사본은 합친 뒤 `.outliner-merged/`로 옮기고, 아무것도 지우지 않는다 | 폰에서는 쓸 수 없다. 폴더는 앱 전용이어야 한다 |
| **내 서버 / URL** | 모든 기기 | 가장 빠르다(1.5초). `server/cloudflare/`를 Workers Free에 올리거나 `server/outliner-server.mjs`를 직접 띄운다 | 서버를 한 번 배포해야 한다. 히스토리·첨부가 없다 |

**데스크톱과 폰을 함께 쓴다면 GitHub이나 서버를 고른다.** 폴더 방식에는 폰이 참여할 수 없기 때문이다.
컴퓨터끼리만 쓴다면 폴더 방식이 가장 손이 덜 간다. 한 기기는 한 번에 원격 하나에만 연결된다.

## 네이티브 앱

`src-tauri/`는 같은 정적 빌드를 시스템 웹뷰에 띄우는 셸이다. 셸은 파일을 읽고 쓰며 링크를 열 뿐이고,
노트를 판정하지 않는다 ([ADR-0010](./docs/adr/0010-native-shell.md)).

### 설치 파일 받기

`v*` 태그를 push하면 `.github/workflows/native.yml`이 GitHub의 무료 러너에서 설치 파일을 모두 빌드해서 **초안
릴리스**에 올린다. PR과 수동 실행(Actions → Native apps → Run workflow)의 경우에는 결과를 워크플로 아티팩트로
남긴다.

| 플랫폼 | 파일 | 처음 열 때 |
|---|---|---|
| macOS (Apple Silicon·Intel 공용) | `.dmg` | 서명이 없으므로 한 번은 우클릭 → 열기로 연다. 또는 `xattr -dr com.apple.quarantine /Applications/Outliner.app`을 실행한다 |
| Windows | `-setup.exe` 또는 `.msi` | SmartScreen에서 「추가 정보 → 실행」을 누른다 |
| Linux | `.AppImage`·`.deb`·`.rpm` | 별도 조치 없음 |
| Android | `outliner-android.apk` | 「출처를 알 수 없는 앱」 설치를 허용한다 |

### Android 서명 키 (한 번만)

키가 없으면 빌드할 때마다 임시 키로 서명되므로, 다음 버전이 기존 앱 위에 설치되지 않는다. 키를 한 번 만들어
저장소의 Settings → Secrets and variables → Actions에 넣는다.

```bash
keytool -genkeypair -keystore outliner.jks -alias outliner -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 outliner.jks   # macOS는 base64 -i outliner.jks
```

| 비밀값 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 위 base64 명령의 출력 |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 암호 |
| `ANDROID_KEY_ALIAS` | `outliner` |
| `ANDROID_KEY_PASSWORD` | 키 암호 (키스토어 암호와 같으면 비워도 된다) |

키 파일은 저장소에 커밋하지 말고 따로 보관한다. 키 파일을 잃어버리면 다음 버전은 기존 앱을 지우고 새로 설치해야 한다.

### 직접 빌드하기

Rust와 플랫폼별 준비물([Tauri 사전 요구사항](https://v2.tauri.app/start/prerequisites/))이 필요하다.
CLI는 `devDependencies`에 들어 있지 않고, `npm run tauri`가 받아 온다.

```bash
npm run tauri -- icon public/icon.svg   # 아이콘 생성 (처음 한 번, 커밋하지 않는다)
npm run tauri -- dev                     # 데스크톱 창으로 개발
npm run tauri -- build                   # 이 플랫폼의 설치 파일
npm run tauri -- android init            # Android 프로젝트 생성 (처음 한 번)
npm run tauri -- android dev             # 연결된 폰이나 에뮬레이터에서
```

폴더 백엔드에서 디스크를 다루는 부분은 Tauri 없이 테스트된다: `rustc --edition 2021 --test src-tauri/src/folder.rs -o /tmp/folder && /tmp/folder`.
Rust 서식은 `rustfmt --edition 2021 --check src-tauri/src/*.rs`로 확인한다(설정 파일은 `src-tauri/rustfmt.toml`이다).

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 아키텍처·핵심 불변식·코드 구조·알려진 한계 | [DESIGN.md](./DESIGN.md) |
| 전체 구조와 선택의 이유 (한 장 요약) | [docs/overview.md](./docs/overview.md) |
| 동기화(병합·전송 계약·GitHub 배치·E2EE) | [docs/design/sync.md](./docs/design/sync.md) |
| 네이티브 셸(명령·로컬 사본·빌드·스모크 검증) | [docs/design/native.md](./docs/design/native.md) |
| 편집기(행 모델·가상화·터치 바·undo) | [docs/design/editing.md](./docs/design/editing.md) |
| 신뢰 경계(검증·CSP·실패 처리) | [docs/design/trust-boundary.md](./docs/design/trust-boundary.md) |
| 실측값·함정·실패한 대안 | [docs/design/code-rationale.md](./docs/design/code-rationale.md) |
| 기능 방향과 그 근거 (Dynalist 격차 분석) | [docs/parity.md](./docs/parity.md) |
| 결정의 이유 | [docs/adr/](./docs/adr/) |

## 테스트

유닛 테스트는 모듈 옆의 `__tests__/`에 있고(`src/entities/outline/model/__tests__/` 등), 깨지기 쉬운 순수 로직만 검사한다. 그 대상은 정렬 키, 트리 연산, 병합 규칙,
가져오기/내보내기 왕복, 인라인 파싱, 질의 언어, 서식 조작이다. UI 동작은 실제 브라우저에서
확인한다. 이를 맡는 스펙은 `e2e/outline.spec.ts`(편집·IME·드래그), `e2e/markdown.spec.ts`(서식 키보드),
`e2e/sync.spec.ts`(가짜 원격 서버를 사이에 둔 두 기기, 적대적인 서버, 죽은 서버, 두 탭, 암호),
`e2e/large.spec.ts`(2,000줄에서의 DOM 크기와 응답성), `e2e/touch.spec.ts`(폰 에뮬레이션·스와이프),
`e2e/server.spec.ts`(레퍼런스 서버를 **실제 프로세스로 띄워** 두 기기를 연결한다),
그리고 links / menu / blocks / settings / trash 스펙이다. 구현을 그대로 옮겨 적는 테스트는 두지
않는다. 이는 [AGENTS.md](./AGENTS.md)의 「테스트 최소화 원칙」에 따른 것이다.

`e2e/csp.spec.ts`와 `e2e/install.spec.ts`는 **빌드 결과**를 대상으로 실행된다. CSP와 매니페스트는
dev 서버에서 적용되지 않기 때문이다. 그래서 Playwright가 웹 서버를 둘 띄운다(dev 5173, preview 4173).

로컬에 Playwright 브라우저가 따로 없다면 다음과 같이 실행한다:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## 배포

정적 빌드(`dist/`)를 아무 정적 호스팅에 올리면 된다. 서버가 없으므로 도메인이 공개되어 있어도
안전하다. 노트는 각 기기의 IndexedDB와 백엔드에만 있기 때문이다. 빌드의 자산 경로는 전부 상대
경로(`base: "./"`)이므로, 도메인 루트에 올리든 저장소 하위 경로에 올리든 같은 산출물이 그대로 동작한다.

`public/manifest.webmanifest`가 있으므로 폰 홈 화면에 추가하면 앱이 별도 창으로 열린다. 아이콘의 정본은
`public/icon.svg`이고, PNG는 이 파일에서 생성한 것이다. `public/sw.js`가 셸을 캐시하므로 **신호가
없어도 열린다**. 노트는 원래 기기에 있었고, 없던 것은 앱을 여는 데 필요한 파일 몇 개뿐이었다.

worker는 **이 출처의 GET만** 처리한다. 동기화 요청은 GitHub이나 사용자가 정한 주소로 가는데, 그 요청에
캐시된 옛 응답이 돌아오면 그 응답이 원격의 현재 상태로 읽혀 병합된다. 그래서 그 요청은 네트워크에 도달하거나,
도달하지 못하면 그대로 실패해야 한다. 네비게이션은 네트워크 우선이고(새로 배포한 버전이 다음 실행 때 반영된다),
나머지 자산은 파일 이름에 내용 해시가 들어 있으므로 캐시 우선이다. worker 등록은 **빌드에서만** 한다.

### GitHub Pages

`.github/workflows/pages.yml`은 main에 push가 있을 때마다 typecheck·구조 검사·유닛 테스트·빌드를 거쳐 앱을 올린다.
같은 검사는 PR과 브랜치 push마다 `check.yml`이 실행한다.
저장소 Settings → Pages에서 source를 **GitHub Actions**로 바꾸기만 하면 된다. 결과는
`https://<owner>.github.io/<repo>/`에 게시된다.

Pages에는 serverless function이 없으므로 **GitHub 로그인 버튼은 뜨지 않는다.** 앱이 알아서 PAT 입력만
남기므로 동작에는 지장이 없다. fine-grained PAT를 만들어 붙여넣는 쪽이 오히려 권한 범위가 좁다.

### Vercel

저장소를 import하면 Vite는 자동으로 인식되고, `api/github-oauth.ts`도 자동으로 function으로 등록된다.
로그인을 켜려면 다음과 같이 설정한다:

1. GitHub OAuth App을 만들고, callback URL을 배포 origin으로 지정한다 (예: `https://outliner.vercel.app/`)
2. 프로젝트 환경 변수에 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`을 넣는다

변수가 없으면 function이 404를 돌려주고 로그인 버튼이 숨겨진다. 토큰은 **신뢰할 수 있는 배포(본인이
올린 것)에만** 입력해야 한다. 코드를 서빙하는 쪽이 곧 신뢰 경계이기 때문이다.

OAuth의 `repo` scope는 계정의 저장소 전체에 대한 권한이라는 점을 기억해야 한다. 권한을 노트 저장소 하나로 좁히고
싶으면 fine-grained PAT 경로를 쓰는 편이 낫다.

### 무료 서버: Cloudflare Worker (`server/cloudflare/`)

컴퓨터를 켜 두지 않아도 되는 무료 서버다. 레퍼런스 서버와 같은 계약을 Workers Free 플랜의 Durable
Object 위에 구현했고, 결제 수단 없이 배포된다. 배포 방법은
[server/cloudflare/README.md](./server/cloudflare/README.md)에 있다. 앱에서는 **내 서버 / URL** 선택지에
`https://outliner-sync.<계정>.workers.dev/workspace`와 토큰을 넣는다.

### 직접 띄우는 서버 (`server/outliner-server.mjs`)

GitHub을 거치지 않고 노트를 자기 기기에 두려면 레퍼런스 서버를 쓴다. 이 서버는 의존성이 없는 파일 하나이고,
앱을 서빙하는 일과 워크스페이스 문서 하나를 보관하는 일만 한다.

```bash
npm run build
node server/outliner-server.mjs --static dist --token 아무거나 --host 0.0.0.0
```

서버를 띄운 다음 앱의 동기화 설정에서 **직접 지정한 주소**를 고르고, 주소에는 `http://<호스트>:8787/workspace`를,
토큰에는 위에서 정한 값을 넣는다. 앱은 다른 곳(Pages 등)에 두고 이 서버에는 저장만 맡겨도 되며,
그때는 `--static`을 빼면 된다. 서버가 CORS와 `ETag`를 함께 내보내므로 출처가 달라도 동작한다.

| 플래그 | 기본값 | 무엇인가 |
|---|---|---|
| `--port` | 8787 | 수신 대기할 포트. `0`이면 빈 포트를 잡고 실제 포트를 출력한다 |
| `--host` | 127.0.0.1 | 바인딩할 인터페이스. 다른 기기에서 접속하려면 `0.0.0.0`을 쓴다 |
| `--dir` | `./data` | 문서를 저장할 디렉터리 |
| `--path` | `/workspace` | 앱이 동기화할 경로 |
| `--token` | 없음 | 지정하면 `Authorization: Bearer`로 토큰을 요구한다 |
| `--static` | 없음 | 빌드된 앱을 서빙할 디렉터리 |

**서버는 판정하지 않는다.** 병합은 클라이언트에 있는 순수 함수가 맡으므로, 이 프로세스가 하는 일은
바이트를 보관하고 `If-Match`로 동시 쓰기를 가려내는 것뿐이다. 암호를 걸면 본문이 봉해진 채로
도착하므로 서버는 내용을 읽지 못한다. 그래서 서버는 본문을 해석하지 않고 그대로 저장한다.

토큰을 걸지 않으면 그 주소에 접근할 수 있는 사람은 누구나 노트를 읽을 수 있다. `0.0.0.0`으로 열 때는 토큰을
반드시 정하고, 공개 인터넷에 둘 것이라면 서버 앞단에 TLS를 둔다(리버스 프록시로 충분하다).
