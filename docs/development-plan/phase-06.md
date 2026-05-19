# Phase 6: 개인 다기기 원격 동기화 - 완료됨

### 목표

snapshot + updates 방식으로 같은 사용자의 여러 브라우저/기기 변경을 병합한다. Firebase 연결보다 FakeRemoteStore 기반 통합 테스트를 먼저 완성한다.

### 완료된 산출물

- `RemoteStore` contract 기반 remote sync orchestration
- remote snapshot pull과 update log pull/push
- duplicate update applied id 관리
- append 실패 시 offline queue 유지와 재시도 flush
- subscribe 기반 remote update 반영
- snapshot 기반 two-client merge helper
- `useOutlineWorkspace`와 `App`의 optional `remoteStore` 연결
- runtime `syncStatus` badge 연결
- 명시적 `?remote=firebase` 설정 기반 optional adapter 생성
- Firebase 설정이 있더라도 명시적 remote mode가 없을 때 `local-only` fallback

### 완료된 테스트

- remote snapshot을 local Yjs workspace에 적용한다.
- remote update log를 수신 순서와 무관하게 적용한다.
- 같은 update를 여러 번 받아도 상태가 중복되지 않는다.
- append 실패 시 update가 offline queue에 남는다.
- 재연결 시 pending update가 flush되고 status가 `synced`가 된다.
- 두 fake client가 동시에 편집한 변경이 충돌 복사본 없이 병합된다.
- shared fake remote store를 통해 두 app runtime이 변경을 주고받는다.

### 구현 메모

- `RemoteStore` contract를 기준으로 sync orchestration을 앱에서 사용할 수 있게 정리한다.
- FakeRemoteStore 통합 테스트를 Firebase adapter 테스트보다 먼저 확장했다.
- Firebase configuration은 선택적 런타임 설정으로 둔다. 설정이 있어도 명시적 `?remote=firebase` 없이는 `local-only`로 동작한다.
- local Yjs update는 runtime client id와 client-local seq를 사용해 `${clientId}:${seq}` update id로 append한다.
- subscribe로 받은 remote update는 applied id set을 통해 중복 적용을 방지한다.
- offline queue flush와 sync status badge를 앱 상태에 연결한다.

### 완료 기준

- Firebase 없이 sync 로직 대부분이 테스트된다.
- 두 fake client의 동시 편집이 병합된다.
- 오프라인 편집 후 재연결 동기화가 통과한다.
- Firebase 설정이 있거나 없어도 명시적 remote mode 없이는 local-only MVP가 깨지지 않는다.
