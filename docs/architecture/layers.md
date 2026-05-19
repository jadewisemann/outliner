# 2. 계층 구조

```txt
UI Components
  -> Editor Adapter
  -> Domain Commands
  -> Yjs Document Adapter
  -> Persistence / Remote Sync
```

현재 MVP 구현에서는 domain normalized tree가 행동의 기준이다. React UI는 domain command 결과를 표시하고, Lexical은 active row의 텍스트 입력 adapter로만 동작한다. 앱 런타임은 local persistence에서 복원한 `OutlineSnapshot`을 Yjs-backed workspace의 source of truth로 사용하고, 선택적으로 `RemoteStore`를 연결해 원격 update를 pull/push/subscribe한다.

### UI Components

- 화면 렌더링과 사용자 입력을 담당한다.
- 직접 트리를 변경하지 않는다.
- command 함수를 호출하고 결과 상태를 표시한다.

### Editor Adapter

- Lexical과 앱 도메인 사이의 번역 계층이다.
- Lexical command를 domain command로 연결한다.
- Lexical selection과 앱 selection state를 동기화한다.
- MVP에서는 선택된 active row에만 Lexical editor를 마운트하고, 나머지 visible row는 plain text로 렌더링한다.

### Domain Commands

- outline tree를 변경하는 순수 함수 모음이다.
- 가장 많은 단위 테스트를 가진다.
- React, Lexical, Yjs, Firebase를 import하지 않는다.

### Yjs Document Adapter

- domain state와 Y.Doc 사이의 변환/적용을 담당한다.
- update encode/decode를 담당한다.
- UndoManager 연결을 담당한다.

### Persistence / Remote Sync

- 로컬 저장과 원격 업데이트 송수신을 담당한다.
- sync status를 계산한다.
- 네트워크 실패와 재시도를 관리한다.
