# 네이티브 셸 — 명령 · 로컬 사본 · 폴더 허용 · 빌드와 검증

> SSOT 코드: `src-tauri/src/lib.rs`(명령과 플러그인), `src-tauri/src/folder.rs`(디스크 작업, std만 사용),
> `src-tauri/tauri.conf.json`, `src-tauri/android/MainActivity.kt`, `src/shared/api/native.ts`(웹 쪽 연결 코드),
> `.github/workflows/native.yml`(빌드·서명·스모크), `e2e/native/`(실제 앱을 구동하는 스모크 테스트)
>
> 관련 결정은 [ADR-0010](../adr/0010-native-shell.md)(셸)과 [ADR-0011](../adr/0011-folder-backend.md)(폴더
> 백엔드)에 기록되어 있고, 불변식은 DESIGN.md의 원칙 20·21이다.

## 한 벌의 코드, 네 개의 플랫폼

셸은 웹 배포와 **같은 정적 빌드**를 시스템 웹뷰에 띄운다. macOS는 WKWebView, Windows는 WebView2,
Linux는 WebKitGTK, Android는 Android System WebView를 쓴다. 편집·병합·검증 코드는 브라우저에서 쓰는 코드와
같은 한 벌이고, 셸이 추가하는 것은 아래 명령들뿐이다. 웹 코드는 `window.__TAURI__` 전역 객체가 있는지를
보고 셸 안에서 실행되는지 판단하며(`isNative()`), 브라우저에서는 이 경로가 전부 아무 일도 하지 않는다.

Electron이 아니라 Tauri를 고른 이유는 설치 파일 크기(수 MB 대 100MB 이상)와 Android 지원이다. 그 대가로
플랫폼마다 웹뷰 엔진이 다르다. 하지만 이 앱은 처음부터 Chrome·Safari·Firefox를 모두 대상으로 작성되어
있었기 때문에 새로 생긴 제약이 거의 없었다. 확인된 차이는 아래 「플랫폼별로 다른 것」 절에 모아 두었다.

## 명령

| 명령 | 하는 일 | 거절하는 경우 |
|---|---|---|
| `native_info` | `{ mobile, os }`를 돌려준다 | 없음 |
| `open_external` | 시스템 브라우저로 링크를 연다 | `http`·`https`·`mailto`가 아닌 주소 |
| `folder_pick` | 폴더 고르기 대화상자를 띄운다. 고른 폴더는 허용 목록에 추가된다 | 모바일 |
| `folder_allow` | 입력한 경로를 네이티브 확인 대화상자를 거쳐 허용한다 | 절대 경로가 아닌 경로, 줄바꿈이나 NUL이 든 이름, 사용자가 취소한 경우 |
| `folder_read` | `outliner.json`과 충돌 사본을 읽는다 | 허용되지 않은 폴더 |
| `folder_write` | 해시가 바뀌지 않았을 때만 `outliner.json`을 바꾸고, 병합한 사본을 옮긴다 | 허용되지 않은 폴더 |
| `folder_retire` | 이미 반영된 사본을 `.outliner-merged/`로 옮긴다 | 허용되지 않은 폴더 |
| `folder_set_aside` | 읽지 못한 `outliner.json`을 `outliner.unreadable-….json`으로 이름을 바꾼다 | 허용되지 않은 폴더 |
| `replica_read` / `replica_write` | 앱 데이터 폴더에 있는 `workspace.json`을 읽고 쓴다 | 없음 |

셸은 **파일 안을 보지 않는다**(원칙 20). 무엇이 읽을 수 없는 파일인지, 어느 사본에 새 내용이 들어 있는지는
웹 코드가 판정하고, 셸은 그 판정대로 바이트를 옮긴다. 그래서 암호가 걸린 워크스페이스도 셸 입장에서는 특별한
경우가 아니다.

디스크 작업은 허용 목록을 읽는 작업까지 포함해 전부 `spawn_blocking` 안에서 실행된다. 느린 네트워크
드라이브 때문에 창이 멈추거나 다른 명령이 막히지 않게 하기 위해서다. 동기화 폴더와 로컬 사본은 서로 다른
잠금을 쓴다. 그래서 동기화 폴더에 쓰는 작업이 느려도 로컬 저장은 기다리지 않는다. 기다려야 하는 명령은
전부 `async`로 정의되어 있다. `async`가 아닌 명령은 메인 스레드에서 실행되는데, 거기서 실행을 막는
대화상자를 띄우면 그 대화상자가 자신이 막은 이벤트 루프를 기다리게 된다.

웹 코드와 셸 사이의 계약은 문자열로 이루어진다. 명령 이름, 인자 이름, 주고받는 JSON의 필드 이름(`FolderRead`의
`canonical`·`copies`, `Entry`의 `name`·`text`·`stamp`)을 양쪽이 각자 따로 적는다. 웹 쪽 정의는 `remote/file.ts`와
`src/shared/api/native.ts`에 있다. 어느 한쪽에서 이름을 바꾸면 양쪽 모두 컴파일은 되지만 실행할 때 실패한다.
그러므로 이름을 바꿀 때는 두 곳을 함께 고친다. 이 계약을 확인하는 테스트는 Linux 스모크(`smoke.mjs`)뿐이다.

## 폴더 허용 목록

웹 페이지는 폴더 **이름을 댈** 수만 있고, 폴더를 **허용할** 수는 없다. 허용은 셸의 폴더 고르기 대화상자나
셸이 직접 그리는 확인 대화상자를 통해서만 이루어지고, 허용 목록은 앱 데이터 폴더의 `allowed-folders.txt`에
저장된다.

이렇게 설계한 이유는 CSP(`script-src 'self'`)가 막아 주는 범위를 벗어난 경우에 대비하기 위해서다. 앱의
명령은 페이지에 있는 어떤 스크립트든 호출할 수 있다. 셸이 경로가 절대 경로인지만 검사한다면, 스크립트
주입이 한 번이라도 일어났을 때 사용자에게 쓰기 권한이 있는 아무 폴더에나 파일을 만들 수 있게 된다.
허용 목록이 있으면 주입된 스크립트가 접근할 수 있는 곳은 사용자가 이미 고른 폴더로 한정된다.

- **폴더를 다루는 명령은 모두 한 곳의 검사를 거친다.** `folder_read`·`folder_write`·`folder_retire`·`folder_set_aside`는
  모두 `in_folder`를 거치고, 거기서 `folder::permitted`가 폴더 이름이 목록에 **글자 그대로** 있는지 검사한다.
  목록에 폴더를 추가할 수 있는 명령은 `folder_pick`과 `folder_allow`뿐이다.
- **줄바꿈이나 NUL이 든 이름은 거절한다.** 목록 파일은 한 줄에 폴더 하나를 적는 형식이고,
  `lines()`로 다시 읽는다. 이름에 `\n`이 들어 있으면 확인을 한 번 받는 것으로 폴더 두 개가 목록에 오른다.
  또한 줄 끝의 `\r`은 읽을 때 제거되므로, 확인받은 것과 다른 폴더가 허용된다. 이 취약점은 2026-09-30
  감사에서 발견했고, 지금은 목록을 확인하기 전에 이런 이름을 거절한다.

## 로컬 사본 — 웹뷰 저장소에 기대지 않는다

셸 안에서는 저장할 때마다 워크스페이스를 IndexedDB에 쓴 뒤, 앱 데이터 폴더의 `workspace.json`에도
쓴다(`saveWorkspace`). 파일에는 저장 시각(`savedAt`)이 함께 들어가고, IndexedDB에도 같은 값이 별도의 키에
저장된다.

- **시작할 때는 더 최근의 것을 통째로 쓴다**(`loadLocal`). 둘을 병합하지 않는다. 두 기록은 서로 다른
  두 기기의 기록이 아니라, 한 기기의 기록을 두 번 쓴 것이기 때문이다. 병합하면 묘비 없이 지우는 작업(예를
  들어 백업 가져오기로 워크스페이스를 통째로 바꾼 작업)을, 아직 따라오지 못한 사본이 되돌려 놓는다. 이
  판단은 리뷰에서 나왔고, 처음 구현에서는 두 기록을 병합했다.
- **쓰기는 순서대로 처리된다.** 셸 쪽에서는 `invoke` 호출 하나하나가 별개의 작업이어서, 시간이 겹친 두
  저장이 순서가 뒤바뀐 채 도착할 수 있다. 그래서 웹 쪽이 프로미스 체인(`replicaQueue`)으로 순서를 지킨다.
- **저장 등급은 `file`이다.** 원칙 18은 브라우저에 보장을 요청하고, 요청이 거절되면 그 사실을 알리도록
  한다. 셸 안에서는 저장을 보장하는 주체가 브라우저가 아니라 앱이 직접 쓰는 파일이므로, 등급을 `file`로
  보고하고 경고를 띄우지 않는다. 파일 쓰기가 실패하면 저장 실패로 표시된다.

## Android: 창 인셋

Android 15부터는 앱이 화면 가장자리까지 그려진다. 그대로 두면 머리말이 상태 표시줄 밑에 가려지고, 터치
바가 키보드 밑에 숨는다. 이 앱에서 생성물이 아닌 Android 파일은 `src-tauri/android/MainActivity.kt` 하나뿐이다.
이 파일은 상태 표시줄·디스플레이 컷아웃·키보드가 차지하는 영역을 콘텐츠 뷰의 여백으로 바꾼다. 그러면 웹뷰의
크기가 페이지가 쓸 수 있는 영역과 정확히 같아지고, 페이지 아래쪽에 붙은 터치 바가 키보드 바로 위에 놓인다.
CI는 `tauri android init`을 실행한 뒤, 그때 생성된 파일을 이 파일로 교체한다.

## 플랫폼별로 다른 것

| 무엇 | 차이 | 대응 |
|---|---|---|
| 외부 링크 | 웹뷰는 `target="_blank"`를 무시하거나(데스크톱) 앱 자체를 그 페이지로 이동시킨다(Android) | 셸 안에서만 클릭을 가로채 `open_external`로 넘긴다. 같은 origin인지는 문자열 접두사가 아니라 `URL.origin`을 비교해 판정한다 |
| service worker | macOS의 커스텀 스킴은 worker를 지원하지 않고, 셸에서는 worker가 필요하지도 않다 | 셸 안에서는 등록하지 않는다 |
| IPC 스킴 | macOS·Linux는 `ipc:`를 쓰고, CSP의 `*`는 커스텀 스킴을 포함하지 않는다 | `connect-src`에 `ipc:`를 추가했다 |
| 터치 바 | Android 에뮬레이터의 웹뷰가 `pointer: coarse`가 아니라고 보고했다. 그러면 휴대폰에서 Tab 대신 쓰는 막대가 나타나지 않는다 | Android·iOS 셸 안에서는 포인터 보고와 무관하게 터치 기기로 간주한다(`useTouchBar`). 스모크 테스트가 편집 중에 막대가 나타나는지 확인한다 |
| `!!` 날짜 입력 | Android 소프트 키보드는 키 이벤트에 입력한 문자를 포함하지 않는다 | 팔레트의 「오늘 날짜 붙이기」·「내일 날짜 붙이기」로 대신한다 |
| GitHub 로그인 | OAuth 콜백이 웹 origin으로 돌아와야 한다 | 셸 안에서는 로그인 버튼이 없고, PAT를 붙여 넣는 방식만 쓴다 |
| 폴더 백엔드 | Android는 경로가 아니라 content URI를 돌려준다 | 데스크톱에서만 제공한다 |

## 빌드

`.github/workflows/native.yml`이 GitHub의 무료 러너에서 모든 산출물을 만든다. 공개 저장소이므로 분 단위 과금이 없다.

```
shell-tests ─┬─ desktop (macOS universal · Windows · Linux) ──┬─ evidence
             │     └ Linux: 구동 스모크 · macOS·Windows: 실행 스모크 │
             └─ android (서명 전 APK) ─ android-sign ─ android-smoke ┘
                                              └──────── release (v* 태그일 때)
```

- **아이콘과 Android 프로젝트는 생성물이다.** 아이콘은 `public/icon.svg`에서, Android 프로젝트는
  `tauri.conf.json`에서 매번 새로 만들고, 커밋하지 않는다. 정본을 하나로 유지하기 위해서다.
- **쓰기 권한은 쓰는 잡에만 준다.** 워크플로의 기본 권한은 읽기 전용이고, `release`와 `evidence` 잡만
  저장소에 쓸 수 있다. npm·cargo·gradle의 설치 스크립트가 실행되는 잡은 저장소에 쓸 수 없다.
- **서명은 따로 한다.** `android` 잡은 서명 전 APK를 올리고, `android-sign` 잡이 그 APK를 받아 서명한다.
  서명 키는 서드파티 스크립트가 한 번도 실행되지 않은 기계에서만 디코딩된다.
- **Tauri CLI는 `devDependencies`에 없다.** `npm run tauri`가 실행될 때 `npx`로 내려받는다. 웹 코드만
  수정하는 사람이 `npm ci`를 실행할 때 플랫폼별 바이너리 수십 MB가 함께 설치되지 않게 하기 위해서다.

## 검증

| 층 | 무엇을 보나 | 어디서 |
|---|---|---|
| `folder.rs` 단독 테스트 9개 | CAS, 사본 이름 규칙, 바뀐 사본은 옮기지 않음, 읽지 못한 파일 비켜 두기, 로컬 사본, 허용 목록(절대 경로, 글자 그대로 일치, 줄바꿈 거절) | `rustc --test`, CI의 `shell-tests` |
| `src/entities/sync/api/__tests__/file.test.ts` | 웹 쪽 폴더 백엔드와 `shouldPush`: 덮어쓰인 파일 복구, 사본 병합, 암호 걸린 사본 건너뛰기, 캐시 | Vitest |
| `e2e/native/smoke.mjs` | **실제 Linux 앱**을 tauri-driver로 구동한다. IPC, 입력, 로컬 사본 파일, 허용되지 않은 폴더 거절, `outliner.json` 쓰기, 충돌 사본 병합과 이동 | CI `desktop (linux)` |
| `e2e/native/launch.sh` | **실제 macOS·Windows 앱**을 실행만 한다. 앱이 계속 실행 중인지, 페이지가 첫 저장을 IPC로 보내서 셸이 로컬 사본(`workspace.json`)을 디스크에 썼는지 | CI `desktop (macos)`·`desktop (windows)` |
| `e2e/native/android.sh` | **에뮬레이터에 설치한 APK**. 실행, 입력, 편집 중 터치 바, 머리말이 상태 표시줄 밑에 있지 않은지, 앱 충돌과 페이지 오류 | CI `android-smoke` |

`run-driver.sh`는 tauri-driver가 `/status`에 응답할 때까지 최대 10초를 기다린 뒤 스모크 테스트를 시작한다.
고정된 시간만큼 기다리는 방식으로는, 느린 러너에서 드라이버가 준비되기 전에 첫 요청이 도착한다.

스모크 테스트의 스크린샷과 결과는 `ci-evidence/<이름>` 브랜치에 남는다. 아티팩트 저장소에 접근하지 못하는
환경에서도 git만으로 결과를 읽을 수 있게 하기 위해서다. 증거는 스모크가 실패해도 올린다(실패했을 때 증거가
가장 필요하기 때문이다). 다만 취소된 실행의 증거는 올리지 않는다(`if: ${{ !cancelled() }}`). 새 push 때문에
취소된 실행이 새 실행의 증거를 덮어쓰지 않게 하기 위해서다. `launch.sh`와 `smoke.mjs`는 앱의 실제 데이터
폴더를 지우거나 덮어쓰므로 CI 러너에서만 실행한다.

**macOS와 Windows는 입력까지 구동하지 않는다.** macOS의 WKWebView에는 WebDriver가 없다. Windows에서는
tauri-driver와 WebView2 버전에 맞춘 msedgedriver로 시도했지만, 드라이버가 Tauri 웹뷰에 연결되지 못했고
60초 뒤 `DevToolsActivePort file doesn't exist` 오류와 함께 세션 생성에 실패했다(2026-09-29, WebView2 153).
그래서 두 플랫폼에서는 `launch.sh`로 실행과 IPC·디스크 쓰기까지만 확인한다. 입력과 폴더 백엔드는 같은 웹
코드를 Linux 스모크와 브라우저 e2e(Safari 계열, Chromium 계열 엔진)가 이미 확인하므로, 남는 위험이
낮다고 판단했다.

### Android 스모크가 알아낸 것

- 웹뷰의 접근성 트리는 늦게 채워진다. 한 번 더 요청하면 대개 채워진 트리를 받는다. 끝내 채워지지 않으면
  좌표로 화면을 누른 뒤, 화면 픽셀이 변했는지를 보고 입력을 판정한다(`e2e/native/ink.py`, 표준 라이브러리만 사용).
- uiautomator가 스스로 비정상 종료되는 경우가 있다(`FATAL EXCEPTION: UiAutomation`). 이것을 앱의 충돌로
  세지 않도록, `Process:`가 이 앱인 충돌만 센다.
