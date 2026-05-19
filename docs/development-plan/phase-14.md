# Phase 14: 히스토리, 백업, 설정

### 목표

개인 로컬 우선 앱으로서 장기 사용 안정성을 높인다. 협업 권한, public share, 서버 사이드 비즈니스 로직은 포함하지 않는다.

### 먼저 작성할 테스트

- 일정 간격 또는 의미 있는 edit transaction마다 local snapshot history가 저장된다.
- 사용자가 이전 snapshot을 미리 보고 현재 workspace로 복원할 수 있다.
- 수동 백업 파일이 현재 workspace와 view/preference 중 필요한 데이터를 포함한다.
- shortcut/theme/font/spellcheck/word count 설정이 document와 분리되어 저장된다.
- 설정 변경은 outline Undo/Redo stack에 들어가지 않는다.

### 구현 항목

- snapshot history store
- restore preview와 restore transaction
- manual backup export
- remote snapshot/update compaction 정책
- preference store와 command registry
- keymap customization UI
- theme/font/spellcheck/word count/auto-focus settings

### 완료 기준

- 실수나 sync 문제 발생 시 사용자가 과거 상태로 되돌아갈 수 있다.
- 개인 설정이 문서 데이터와 분리되어 sync/export 정책을 명확히 가진다.
