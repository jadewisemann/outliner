# 6. 원격 동기화 구조

현재 원격 sync의 앱 기본 경계는 `RemoteStoreV2` snapshot-primary sync다. v2는 전체 문서 상태를 update log에 계속 append하지 않고 최신 snapshot 1개를 덮어쓴다. 이로써 저장량과 신규 클라이언트 최초 sync가 과거 누적 로그에 비례해 폭증하는 문제는 줄었다.

단, v2 snapshot-primary는 최종 비용 해법이 아니다. 문서가 커진 상태에서 작은 편집이 발생해도 remote write payload는 전체 snapshot 크기에 비례한다. Firebase RTDB에 realtime listener가 붙어 있으면 다른 클라이언트의 read bandwidth도 전체 snapshot 크기에 비례할 수 있다. 따라서 Phase 12 이후 최우선 과제는 full-snapshot write/read bandwidth를 줄이는 저장소 또는 sync protocol 재설계다.

원격 sync의 제품 목표는 다중 사용자 공동편집이 아니라 개인 다기기 동기화다. 따라서 아키텍처의 우선순위는 항상 켜진 realtime stream보다 예측 가능한 비용, 작은 payload, bounded log, 복구 가능한 local-first 동작이다. RTDB는 현재 adapter 중 하나일 뿐이며, 저장소 교체 가능성을 `RemoteStore` 경계 안에 유지한다.

```txt
users/{userId}/workspaces/root/
  v2/snapshot
    version: number
    clientId: string
    updatedAt: number
    state: string
    vector?: string

  # legacy only
  snapshot/{state, vector, updatedAt}
  updates/{updateId}/
```

동작:

1. 앱은 로컬 persistence에서 먼저 Y.Doc 또는 `OutlineSnapshot`을 복원한다.
2. 원격 설정이 있으면 v2 latest snapshot을 가져와 Yjs workspace에 적용한다.
3. 로컬 변경은 debounce 후 v2 latest snapshot으로 conditional write한다.
4. 같은 version의 다른 client write는 reject/conflict로 처리한다.
5. 더 최신 remote snapshot이 pending local change를 밀어내면 현재 local snapshot을 conflict backup에 저장하고 `conflict` 상태를 표시한다.
6. 앱 시작, 포커스 복귀, optional adapter notification에서 remote pull을 수행한다.

앱의 런타임 흐름은 `local persistence -> Yjs workspace -> RemoteStoreV2 sync` 순서다. `RemoteStoreV2`가 주입되지 않으면 Firebase 설정이 없는 것으로 보고 `local-only` 상태로 기존 로컬 편집/저장/Undo/Redo 동작을 유지한다.

Phase 12-A 단기 비용 안정화 규칙:

- 원격 append는 keypress 단위가 아니라 의미 있는 transaction 또는 debounce window 단위로 batch한다.
- 단일 remote payload에는 byte budget을 두고, 초과 시 append하지 않는다.
- snapshot compaction은 오래된 update log cleanup과 함께 실행되어야 한다.
- RemoteStore 테스트 더블은 read/write byte count를 기록해 비용 회귀를 테스트한다.
- 새 클라이언트 sync는 최신 snapshot과 필요한 update만 읽어야 한다.
- Firebase RTDB `listUpdates`는 전체 `updates` tree를 읽고 클라이언트에서 자르지 않는다. 서버 query 또는 compacted cursor 기준으로 필요한 범위만 읽는다.
- `subscribe`는 과거 log 전체를 실시간 이벤트처럼 다시 적용하지 않게 start cursor를 가져야 한다.
- 비용 guard가 실패하면 remote 상태를 `error`로 보여주고 local persistence는 계속 유지한다.

Phase 12-B 중기 저장소 재검토 규칙:

- `RemoteStoreV2`는 최신 compacted snapshot을 primary artifact로 두며, 현재 앱 런타임은 v2 adapter를 사용한다.
- realtime subscription은 필수 contract가 아니다. provider가 realtime을 지원하지 않으면 앱 시작, 포커스 복귀, 수동 sync, 짧은 polling/debounce sync로 동작할 수 있어야 한다.
- 저장소 후보는 RTDB, Firestore, Supabase/Postgres, object storage 기반 snapshot 저장소를 같은 비용 모델로 비교한다.
- 기본 판단 기준은 10분 입력 테스트, 1시간 입력 테스트, 새 기기 최초 sync, 오프라인 후 재연결에서의 write bytes, read bytes, stored bytes다.
- 개인 다기기 동기화만 필요하면 정적 snapshot/blob 중심 저장소를 우선 후보로 둔다.

Phase 12-C 최우선 비용 과제:

- snapshot-primary v2는 remote stored bytes를 bounded하게 만들지만, write/read bandwidth는 문서 크기와 편집 빈도에 비례한다.
- Firebase RTDB를 계속 쓰는 경우 realtime listener는 전체 snapshot read를 반복할 수 있으므로 비용 검증 전까지 기본 요구사항이 아니다.
- 현재 1차 구현은 `RemoteStoreV2` optional patch capability다. 클라이언트가 같은 base version을 갖고 있으면 latest patch를 먼저 읽고, patch가 없거나 base가 맞지 않을 때만 latest snapshot을 읽는다.
- 다음 검증은 provider별 patch write/read byte가 full snapshot 반복보다 낮게 유지되는지 확인하고, 필요하면 chunked snapshot, content-addressed blob/object storage, metadata-only CAS, 서버/API 기반 compaction으로 확장한다.
