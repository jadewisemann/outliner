# 6. 수용 기준

### 구현 완료된 핵심 기준

- 키보드만으로 3뎁스 이상 아웃라인을 작성할 수 있다.
- 접힘 상태가 visible node 계산과 키보드 이동에 반영된다.
- 멀티라인 붙여넣기가 indentation 구조를 유지해 여러 노드를 만든다.
- 다중 노드 선택 후 들여쓰기/내어쓰기/삭제/접기 명령이 한 번에 적용된다.
- 선택 범위 복사/붙여넣기가 outline 구조를 보존한다.
- 모든 핵심 도메인 동작은 실패 테스트를 먼저 가진다.
- 새로고침 후 작성한 노드와 접힘/줌 상태가 유지된다.
- Yjs-backed runtime Undo/Redo가 텍스트와 구조 변경에 적용된다.
- FakeRemoteStore 기반 두 runtime 동시 편집이 병합된다.
- 오프라인 후 재연결 시 pending update가 flush된다.
- `Alt+ArrowUp/Down`으로 현재 노드 또는 선택 범위를 위아래로 이동할 수 있다.
- 첫 자식/마지막 자식의 `Alt+ArrowUp/Down` 부모 경계 이동 규칙이 도메인 테스트와 E2E로 검증된다.
- `Mod+Alt+ArrowUp/Down`으로 멀티 커서를 만들고 같은 텍스트 편집을 여러 row에 적용할 수 있다.

### MVP 체크리스트 완료 상태

- browser-backed 원격 sync E2E는 추가되었다.
- Firebase-backed 환경의 원격 sync smoke를 실제 프로젝트 설정으로 검증했다.
- 10,000개 노드 fixture에서 visible 계산과 기본 편집이 사용 가능한 성능을 보인다. - 완료됨
