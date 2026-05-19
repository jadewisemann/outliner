# 8. 주요 인터페이스 초안

```ts
type RemoteUpdate = {
  id: string;
  clientId: string;
  seq: number;
  update: Uint8Array;
  createdAt: number;
};

interface RemoteStore {
  readSnapshot(): Promise<Uint8Array | null>;
  writeSnapshot(snapshot: Uint8Array, vector: Uint8Array): Promise<void>;
  appendUpdate(update: RemoteUpdate): Promise<void>;
  listUpdates(after?: string): Promise<RemoteUpdate[]>;
  subscribe(onUpdate: (update: RemoteUpdate) => void): () => void;
}
```

테스트와 앱 통합 순서는 FakeRemoteStore가 먼저다. Firebase Realtime Database adapter는 같은 인터페이스를 구현한다. `App`은 선택적 `remoteStore`를 받을 수 있고, `?remote=firebase`가 명시된 경우에만 Firebase adapter를 만든다. `VITE_FIREBASE_*`와 `VITE_OUTLINER_USER_ID` 설정이 있어도 명시적 remote mode가 없으면 `local-only`로 유지한다.
