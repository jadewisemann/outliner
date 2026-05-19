# Phase 12: 원격 sync 비용 안정화

### 목표

현재 snapshot 기반 update append 구조가 정상 사용량보다 큰 Firebase read/write를 만들 수 있음을 명시하고, 원격 sync가 dev와 실제 사용 환경에서 비용 상한을 넘지 않게 재설계한다. Firebase sync는 명시적 opt-in 상태로 유지하며, import/export 확장보다 우선한다.

Phase 12는 세 단계로 나눈다.

- Phase 12-A 단기 안정화: 기존 RTDB adapter에서 즉시 비용 누수를 막는다. - 완료됨
- Phase 12-B 중기 재설계: 개인 다기기 sync에 맞는 `RemoteStoreV2` snapshot-primary sync로 전환한다. - 완료됨
- Phase 12-C 최우선 비용 해소: full snapshot write/read bandwidth를 줄이는 저장소 또는 sync protocol로 전환한다. - 최우선

제품 범위는 다중 사용자 공동편집이 아니라 개인 다기기 동기화다. 따라서 realtime subscription은 있으면 좋은 구현 옵션이지 필수 요구사항이 아니다. 기본 목표는 local-first 동작을 유지하면서 작은 payload, bounded log, 예측 가능한 비용으로 여러 기기를 맞추는 것이다.

### 먼저 작성할 테스트

- Firebase configuration이 있어도 `?remote=firebase` 없이는 remote adapter를 만들지 않는다. - 완료됨
- 로컬 텍스트 입력 여러 번이 원격 append 여러 번으로 즉시 증폭되지 않고 debounce/batch된다. - 완료됨
- 단일 update/snapshot payload가 정해진 byte budget을 넘으면 remote write를 막고 `error` 또는 `offline` 상태로 전환한다. - 완료됨
- snapshot compaction 후 오래된 update log를 정리해 새 클라이언트가 전체 누적 로그를 다시 읽지 않는다. - v1 guard 완료, v2는 latest snapshot으로 대체됨
- 앱 시작 시 remote pull이 v2 latest snapshot만 읽는다. - 완료됨
- sync 비용 회귀를 잡기 위해 fake remote store가 encoded read/write byte count를 기록한다. - 완료됨
- RTDB adapter가 기본 앱 경로에서 `updates` append/list를 사용하지 않는다. - 완료됨
- RemoteStore v2 fake adapter가 realtime subscription 없이 앱 시작/포커스 복귀 sync를 통과한다. - 완료됨
- 10분 입력 시뮬레이션에서 stored bytes가 최신 snapshot 크기로 bounded됨을 검증한다. - 완료됨
- 큰 문서에서 편집 cadence가 debounce window보다 길 때 full snapshot write/read bytes가 비용 상한 안에 머문다. - 미완료, Phase 12-C 최우선

### Phase 12-A 구현 항목

- Firebase remote mode는 명시적 `?remote=firebase` opt-in 유지
- remote update debounce/batching
- update payload size guard와 사용자에게 보이는 sync error 상태
- snapshot compaction trigger와 update log cleanup contract
- `RemoteStore` read/write byte accounting test helper
- Firebase adapter cursor query 적용
- subscribe start cursor 적용
- Firebase emulator 또는 fake metering 기반 비용 회귀 테스트
- 비용 guard 실패 시 로컬 저장은 계속 성공하고 remote status만 `error`로 표시

### Phase 12-B 구현 항목

- `RemoteStoreV2` contract 작성 - 완료됨
  - 최신 compacted snapshot 읽기/쓰기
  - snapshot version 또는 cursor
  - compare-and-swap 기반 write accept/reject
  - 선택적 realtime subscribe
  - byte metering hook
- v2 adapter 구현 - 완료됨
  - FakeRemoteStoreV2
  - BrowserRemoteStoreV2
  - FirebaseRemoteStoreV2
- conflict backup 구현 - 완료됨
  - 더 최신 remote snapshot이 pending local change를 밀어내면 local conflict backup에 저장
  - SyncStatus `conflict`
- 저장소 후보별 비용/복잡도 비교 문서 작성 - 진행 중
  - Firebase RTDB: realtime은 쉽지만 bandwidth와 listener 비용 관리가 필요하다.
  - Firestore: document 단위 read/write 과금이라 update log를 작게 쪼갤 수 있지만 listener/read 비용과 index overhead를 관리해야 한다.
  - Supabase/Postgres 또는 서버 API: query와 compaction 제어가 쉽지만 auth/API 운영이 필요하다.
  - Object storage 기반 snapshot/blob: 개인 sync에는 가장 정적이고 저렴할 수 있지만 충돌 병합과 auth URL 설계가 필요하다.
- 기본 후보를 정적 snapshot/blob 중심 저장소로 둘지 결정 - Phase 12-C
- 현재 RTDB adapter를 유지, 축소, 제거 중 하나로 결정 - Phase 12-C
- Phase 13 이후 import/export/history가 저장소 구현에 직접 의존하지 않도록 경계 재확인

### Phase 12-C 구현 항목 - 최우선

Phase 12-B 이후 남은 가장 중요한 문제는 “latest snapshot 하나만 저장하더라도 매 remote write/read payload가 전체 문서 크기에 비례한다”는 점이다. 이 문제를 해결하기 전까지 Phase 13 import/export보다 원격 비용 작업을 우선한다.

- 10분/1시간 realistic typing cadence 테스트를 fake timer로 작성
  - debounce보다 빠른 입력
  - debounce보다 느린 입력 - fake v2 patch write 회귀 테스트 추가됨
  - 큰 문서에서 한 글자 수정 - fake v2 patch write 회귀 테스트 추가됨
  - 연결된 두 번째 클라이언트가 있을 때 read bytes - fake v2 patch read 회귀 테스트 추가됨
- Firebase realtime subscription을 기본 경로에서 제거하거나 명시적 실험 옵션으로 격리
- full snapshot write를 줄이는 후보 중 하나를 구현 후보로 결정
  - object/blob storage + small metadata CAS
  - chunked snapshot with content hash
  - bounded delta log + periodic compacted snapshot - 1차 구현 후보로 선택, fake/browser/Firebase v2 adapter에 latest patch 경로 추가됨
  - 서버/API 기반 conditional write와 compaction
- `RemoteStoreV2`를 유지할지 `RemoteStoreV3`로 분리할지 결정 - v2 optional patch capability 유지로 결정
- 비용 acceptance 기준 정의
  - stored bytes는 최신 문서 크기 근처로 bounded
  - write bytes는 10분/1시간 입력에서 문서 크기 * 입력 횟수로 선형 폭증하지 않을 것 - fake v2 slow large-document test 추가됨
  - read bytes는 새 기기 최초 sync와 포커스 복귀 외에 realtime listener로 반복 폭증하지 않을 것 - patch read path 테스트 추가됨

### 완료 기준

- 일반 dev 실행은 Firebase env가 있어도 `local-only`이며, 실수로 원격 비용을 발생시키지 않는다.
- 정상적인 텍스트 입력이 매 keypress마다 전체 문서 update를 Firebase에 append하지 않는다.
- 누적 update log가 무한히 커지지 않고 latest snapshot 중심으로 bounded된다.
- 새 클라이언트가 동기화할 때 과거 전체 로그를 반복 read하지 않는다.
- 10분 입력 테스트가 GB 단위 저장량으로 증폭되지 않는다.
- 단, full snapshot bandwidth 비용은 provider별 patch 경로가 검증되기 전까지 미해결로 간주한다.
- 원격 sync 비용 모델과 한계가 문서화되어 Phase 13 이후 기능이 안전하게 원격 데이터를 다룰 수 있다.
- 중기 저장소 방향이 결정되어 RTDB를 계속 쓸지, 정적/저비용 저장소로 바꿀지 다음 구현 Phase로 넘길 수 있다.
