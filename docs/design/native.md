# 네이티브 셸 — 명령 · 로컬 사본 · 폴더 허용 · 빌드와 검증

> SSOT 코드: `src-tauri/src/lib.rs`(명령과 플러그인), `src-tauri/src/folder.rs`(디스크 작업, std만 사용),
> `src-tauri/tauri.conf.json`, `src-tauri/android/MainActivity.kt`, `src/shared/native.ts`(웹 쪽 다리),
> `.github/workflows/native.yml`(빌드·서명·스모크), `e2e/native/`(실제 앱을 구동하는 스모크 테스트)
>
> 결정은 [ADR-0010](../adr/0010-native-shell.md)(셸)과 [ADR-0011](../adr/0011-folder-backend.md)(폴더
> 백엔드)이고, 불변식은 DESIGN.md 원칙 20·21이다.

## 한 벌의 코드, 네 개의 플랫폼

셸은 시스템 웹뷰에 웹 배포와 **같은 정적 빌드**를 띄운다. macOS는 WKWebView, Windows는 WebView2,
Linux는 WebKitGTK, Android는 Android System WebView를 쓴다. 편집·병합·검증 코드는 브라우저와 한 벌이고,
셸이 더하는 것은 아래 명령들뿐이다. 웹 코드는 `window.__TAURI__` 전역이 있는지로 셸 안인지를 알고
(`isNative()`), 브라우저에서는 이 경로가 전부 아무 일도 하지 않는다.

Electron이 아니라 Tauri를 고른 이유는 설치 파일 크기(수 MB 대 100MB 이상)와 Android 지원이다. 대가는
플랫폼마다 웹뷰 엔진이 다르다는 것인데, 이 앱은 원래 Chrome·Safari·Firefox를 모두 상대로 쓰여 있어서
새로 생긴 제약이 거의 없었다. 확인된 차이는 아래 「플랫폼별로 다른 것」에 모았다.

## 명령

| 명령 | 하는 일 | 거절하는 경우 |
|---|---|---|
| `native_info` | `{ mobile, os }` | 없음 |
| `open_external` | 시스템 브라우저로 링크 열기 | `http`·`https`·`mailto`가 아닌 주소 |
| `folder_pick` | 폴더 고르기 대화상자. 고른 폴더는 허용 목록에 들어간다 | 모바일 |
| `folder_allow` | 입력한 경로를 네이티브 확인 대화상자로 허용 | 절대 경로가 아님, 사용자가 취소 |
| `folder_read` | `outliner.json`과 충돌 사본을 읽는다 | 허용되지 않은 폴더 |
| `folder_write` | 해시가 그대로일 때만 `outliner.json`을 바꾸고, 합친 사본을 옮긴다 | 허용되지 않은 폴더 |
| `folder_retire` | 이미 반영된 사본을 `.outliner-merged/`로 옮긴다 | 허용되지 않은 폴더 |
| `folder_set_aside` | 읽지 못한 `outliner.json`을 `outliner.unreadable-….json`으로 바꾼다 | 허용되지 않은 폴더 |
| `replica_read` / `replica_write` | 앱 데이터 폴더의 `workspace.json` | 없음 |

셸은 **파일 안을 보지 않는다**(원칙 20). 무엇이 읽을 수 없는 파일인지, 어느 사본이 새 내용을 가졌는지는
웹 코드가 판정하고, 셸은 그 판정대로 바이트를 옮긴다. 그래서 암호가 걸린 워크스페이스도 셸에게는 특별한
경우가 아니다.

디스크 작업은 전부 `spawn_blocking`에서 돈다. 느린 네트워크 드라이브가 창을 멈추거나 다른 명령을 막지
않게 하기 위해서다. 동기화 폴더와 로컬 사본은 서로 다른 잠금을 쓴다. 동기화 폴더의 쓰기가 느려도 로컬
저장이 기다리지 않는다.

## 폴더 허용 목록

웹 페이지는 폴더 **이름을 댈** 수만 있고, 폴더를 **허용할** 수는 없다. 허용은 셸의 폴더 고르기 대화상자나
셸이 그리는 확인 대화상자로만 일어나고, 목록은 앱 데이터 폴더의 `allowed-folders.txt`에 남는다.

이렇게 한 이유는 CSP(`script-src 'self'`)가 막아 주는 범위 밖을 대비하기 위해서다. 앱의 명령은 페이지의
어떤 스크립트든 부를 수 있다. 경로가 절대 경로인지만 보면, 스크립트 주입이 한 번이라도 일어났을 때
사용자가 쓸 수 있는 아무 폴더에나 파일을 만들 수 있게 된다. 허용 목록이 있으면 주입된 스크립트가 닿는
곳은 사용자가 이미 고른 폴더뿐이다.

## 로컬 사본 — 웹뷰 저장소에 기대지 않는다

셸 안에서는 저장할 때마다 워크스페이스를 IndexedDB에 쓴 뒤, 앱 데이터 폴더의 `workspace.json`에도
쓴다(`saveWorkspace`). 파일에는 저장 시각(`savedAt`)이 함께 들어가고, IndexedDB에도 같은 값이 옆 키에
남는다.

- **시작할 때는 더 최근의 것을 통째로 쓴다**(`loadLocal`). 둘을 병합하지 않는다. 둘은 두 기기가 아니라
  한 기기의 기록을 두 번 쓴 것이다. 병합하면 묘비 없이 지우는 작업, 예컨대 백업 가져오기로 워크스페이스를
  통째로 바꾼 것을, 아직 따라오지 못한 사본이 되돌려 놓는다. 이 판정은 리뷰에서 나왔고, 처음 구현은
  병합이었다.
- **쓰기는 순서대로 나간다.** 셸 쪽에서는 `invoke` 하나하나가 별개의 작업이라, 겹친 두 저장이 거꾸로
  도착할 수 있다. 웹 쪽이 약속 사슬(`replicaQueue`)로 차례를 지킨다.
- **저장 등급은 `file`이다.** 원칙 18은 브라우저에게 보장을 요청하고 거절되면 알리라고 한다. 셸 안에서는
  보장하는 쪽이 브라우저가 아니라 앱이 직접 쓰는 파일이므로, 등급을 `file`로 보고하고 경고를 띄우지
  않는다. 파일 쓰기가 실패하면 저장 실패로 보인다.

## Android: 창 인셋

Android 15부터 앱은 화면 끝까지 그려진다. 그대로 두면 머리말이 상태 표시줄 밑에 깔리고 터치 바가
키보드 밑에 숨는다. 이 앱에서 생성물이 아닌 Android 파일은 `src-tauri/android/MainActivity.kt` 하나다.
이 파일이 상태 표시줄·디스플레이 컷아웃·키보드 영역을 콘텐츠 뷰의 여백으로 바꾼다. 그러면 웹뷰의 크기가
페이지가 쓸 수 있는 영역과 정확히 같아지고, 페이지 아래에 붙은 터치 바가 키보드 바로 위에 온다. CI가
`tauri android init` 뒤에 생성된 파일을 이것으로 바꾼다.

## 플랫폼별로 다른 것

| 무엇 | 차이 | 대응 |
|---|---|---|
| 외부 링크 | 웹뷰는 `target="_blank"`를 무시하거나(데스크톱) 앱 자체를 그 페이지로 옮긴다(Android) | 셸 안에서만 클릭을 가로채 `open_external`로 넘긴다. 같은 origin 판정은 문자열 접두사가 아니라 `URL.origin` 비교다 |
| service worker | macOS의 커스텀 스킴은 worker를 받지 않고, 셸에서는 필요도 없다 | 셸 안에서는 등록하지 않는다 |
| IPC 스킴 | macOS·Linux는 `ipc:`를 쓰고, CSP의 `*`는 커스텀 스킴을 포함하지 않는다 | `connect-src`에 `ipc:`를 더했다 |
| `!!` 날짜 입력 | Android 소프트 키보드는 키 이벤트에 문자를 싣지 않는다 | 팔레트의 「오늘 날짜 붙이기」·「내일 날짜 붙이기」 |
| GitHub 로그인 | OAuth 콜백이 웹 origin으로 돌아와야 한다 | 셸 안에서는 버튼이 없고 PAT 붙여넣기만 쓴다 |
| 폴더 백엔드 | Android는 경로가 아니라 content URI를 준다 | 데스크톱에서만 제공한다 |

## 빌드

`.github/workflows/native.yml`이 GitHub의 무료 러너에서 모두 만든다. 공개 저장소라 분 단위 과금이 없다.

```
shell-tests ─┬─ desktop (macOS universal · Windows · Linux) ──┬─ evidence
             │     └ Linux: 실제 앱 스모크                       │
             └─ android (서명 전 APK) ─ android-sign ─ android-smoke ┘
                                              └──────── release (v* 태그일 때)
```

- **아이콘과 Android 프로젝트는 생성물이다.** 아이콘은 `public/icon.svg`에서, Android 프로젝트는
  `tauri.conf.json`에서 매번 만들고 커밋하지 않는다. 정본을 하나로 두기 위해서다.
- **쓰기 권한은 쓰는 잡에만 준다.** 워크플로 기본은 읽기 전용이고, `release`와 `evidence`만 쓸 수 있다.
  npm·cargo·gradle의 설치 스크립트가 도는 잡은 저장소에 쓸 수 없다.
- **서명은 따로 한다.** `android` 잡은 서명 전 APK를 올리고, `android-sign`이 그것을 받아 서명한다.
  서드파티 스크립트가 한 번도 돌지 않은 기계에서만 키가 풀린다.
- **Tauri CLI는 `devDependencies`에 없다.** `npm run tauri`가 `npx`로 받아 온다. 웹만 만지는 사람의
  `npm ci`에 플랫폼별 바이너리 수십 MB가 끼어들지 않게 하기 위해서다.

## 검증

| 층 | 무엇을 보나 | 어디서 |
|---|---|---|
| `folder.rs` 단독 테스트 | CAS, 사본 이름 규칙, 바뀐 사본은 옮기지 않음, 읽지 못한 파일 비켜 두기, 로컬 사본, 허용 목록 | `rustc --test`, CI의 `shell-tests` |
| `src/sync/__tests__/file.test.ts` | 웹 쪽 폴더 백엔드와 `shouldPush` — 덮어쓰인 파일 복구, 사본 병합, 암호 걸린 사본 건너뛰기, 캐시 | Vitest |
| `e2e/native/smoke.mjs` | **실제 Linux 앱**을 tauri-driver로 구동. IPC, 입력, 로컬 사본 파일, 허용되지 않은 폴더 거절, `outliner.json` 쓰기, 충돌 사본 병합과 이동 | CI `desktop (linux)` |
| `e2e/native/android.sh` | **에뮬레이터에 설치한 APK**. 실행, 입력, 머리말이 상태 표시줄 밑에 있지 않은지, 앱 충돌과 페이지 오류 | CI `android-smoke` |

스모크 테스트의 스크린샷과 결과는 `ci-evidence/<이름>` 브랜치에 남는다. 아티팩트 저장소에 닿지 못하는
환경에서도 git만으로 읽을 수 있게 하기 위해서다.

**확인하지 못한 것:** macOS와 Windows 앱은 빌드까지만 확인했다. macOS의 WKWebView에는 WebDriver가 없고,
Windows는 WebView2 버전에 맞는 드라이버를 러너에서 맞추는 일이 따로 필요하다. 둘 다 웹뷰가 이미 e2e로
검증된 엔진(Safari 계열, Chromium 계열)이라 위험은 낮다고 판단했다. 처음 실행할 때 문제가 보이면
여기에 기록한다.

### Android 스모크가 알아낸 것

- 웹뷰의 접근성 트리는 늦게 채워진다. 한 번 더 요청하면 대개 나오고, 끝내 안 나오면 좌표로 누른 뒤
  화면 픽셀의 변화로 입력을 판정한다(`e2e/native/ink.py`, 표준 라이브러리만 사용).
- uiautomator가 스스로 죽는 경우가 있다(`FATAL EXCEPTION: UiAutomation`). 앱의 충돌로 세지 않도록
  `Process:`가 이 앱인 것만 센다.
