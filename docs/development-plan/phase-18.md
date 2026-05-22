# Phase 18: 데스크톱 앱, 계정, sync 제품화 - 예정

Stage 2 Distribution의 Phase다. Stage 1에서 다중 문서 workspace와 Obsidian식 링크 모델이 안정된 뒤 배포와 계정 기반 사용 흐름을 정리한다.

### 목표

- 데스크톱 앱 배포와 자동 업데이트 정책을 준비한다.
- 계정 생성, 로그인, 로그아웃, 기기 목록을 제품 표면으로 정리한다.
- 다중 문서 workspace sync 단위를 확정한다.

### 먼저 작성할 테스트

- workspace manifest와 document snapshot이 local persistence에서 복원된다.
- remote sync는 한 문서 편집이 모든 문서 payload를 반복 전송하지 않게 한다.
- 계정 연결/해제는 local-only 사용 흐름을 깨지 않는다.
- conflict backup은 workspace manifest conflict와 document conflict를 구분한다.

### 구현 항목

- desktop packaging
- account/session UI
- workspace remote manifest
- per-document snapshot/patch sync 검토 및 도입
- sync settings와 device/session management

### 완료 기준

- 사용자는 설치형 앱에서 다중 문서 workspace를 안정적으로 열고 동기화할 수 있다.
- sync 비용은 문서 수 증가와 분리되어 관리된다.
- 모바일 패키징 전에 계정/sync 경계가 확정된다.
