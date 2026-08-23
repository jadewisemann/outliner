# Text buffer outliner POC

이 디렉터리는 [전환 검토안](../../docs/proposals/text-buffer-transition.md)의 1단계 POC입니다.
production 앱의 `src/`, IndexedDB, 동기화와 문서 모델을 사용하지 않습니다. CodeMirror와 Lezer
패키지도 루트 production 번들이 아니라 이 별도 Vite 진입점에서만 가져옵니다.

## 실행

```bash
npm run poc:text-buffer
npm run poc:text-buffer:build
npm run poc:text-buffer:e2e
```

개발 서버는 기본적으로 `http://localhost:5173`에 열립니다. production 앱과 동시에 실행할 때는
`npm run poc:text-buffer -- --port 5174`처럼 포트를 지정합니다.

## 구현한 검증 대상

- Markdown text buffer가 편집 가능한 유일한 정본입니다.
- `OutlineIndex`는 들여쓴 bullet, numbered list와 task를 파생합니다. front matter, fenced code,
  인용과 알 수 없는 블록은 인덱스에서 제외하고 원문에는 그대로 둡니다.
- Enter, Backspace, Tab, Shift+Tab, 서브트리 이동·복제·삭제를 CodeMirror transaction으로
  구현했습니다.
- marker와 깊이는 viewport decoration으로 표시합니다. CodeMirror가 화면 근처의 DOM만
  구성하므로 10,000행에서도 DOM 행 수가 문서 크기에 비례하지 않습니다.
- 접기, 노드 확대, 여러 selection과 모바일 touch bar를 넣었습니다.
- Markdown 파일 열기·저장과 base/local/remote 충돌 판정을 넣었습니다. 양쪽이 바뀐 경우에는
  buffer를 덮어쓰지 않고 로컬·외부 충돌 사본을 각각 내려받을 수 있습니다.
- composition 이벤트와 2,000행·10,000행 성능을 화면에서 계측합니다.

## 의도적으로 남긴 게이트

- 합성 DOM 이벤트는 실제 IME가 아닙니다. 한글 조합 손실 0회 판정은 데스크톱 한글 IME와
  Android Chrome·삼성 키보드에서 직접 입력한 결과가 필요합니다.
- `OutlineIndex`는 현재 변경마다 Outline Markdown 부분집합을 선형으로 다시 읽습니다. Lezer의
  Markdown 구문 트리는 증분으로 갱신되지만, 구조 인덱스 자체를 부분 갱신하는 최적화는 성능
  측정이 필요성을 보일 때만 추가합니다.
- 브라우저 다운로드 fallback은 새 파일을 내려받습니다. 같은 파일에 안전하게 덮어쓰는 경로는
  File System Access API가 제공되는 브라우저에서만 작동합니다.
- block ID 표기 두 후보의 제품 판정, 실제 폴더 선택과 외부 file watcher는 이 POC의 범위가
  아닙니다.

따라서 자동 검증이 통과해도 전환을 채택한 것은 아닙니다. 문서의 IME·Android 수동 게이트와
현재 production 편집기의 동일 장비 기준선 비교를 마친 뒤에만 채택 여부를 판정합니다.
