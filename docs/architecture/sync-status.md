# 7. Sync 상태

```ts
type SyncStatus =
  | "local-only"
  | "offline"
  | "syncing"
  | "synced"
  | "error"
  | "conflict";
```

- `local-only`: Phase 0~5의 기본 상태. 로그인 또는 원격 설정 없이 로컬만 사용
- `offline`: 원격 설정은 있으나 네트워크 없음
- `syncing`: 원격 update 송수신 중
- `synced`: 로컬 대기 update 없음
- `error`: 마지막 원격 작업 실패
- `conflict`: 더 최신 remote snapshot이 pending local change를 밀어냈고, 밀려난 local snapshot을 conflict backup에 저장함
