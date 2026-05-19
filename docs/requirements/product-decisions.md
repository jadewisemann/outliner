# 7. 제품 결정

- Phase 0~6은 로그인 없는 로컬 단일 문서, Yjs-backed local runtime, optional RemoteStore sync를 우선한다.
- 원격 동기화는 optional `RemoteStoreV2` adapter로 연결한다. Firebase Realtime Database는 v2 adapter를 제공하고, full snapshot bandwidth 비용은 optional patch capability로 줄인다. realtime subscription은 개인 sync의 필수 요구사항이 아니다.
- MVP 텍스트는 플레인 텍스트 중심이다.
- TODO/checkbox 노드는 MVP에서 제외한다.
- 자식 있는 빈 노드에서 `Backspace`를 누르면 자식을 같은 레벨로 승격한다.
- bullet 클릭은 줌인이다.
- 모바일 앱은 웹 MVP 이후로 분리한다.
- 협업 범위는 개인 다기기 동기화다.
- JSON과 Markdown 내보내기를 모두 지원한다.
- MVP 성능 수용 기준은 10,000개 노드, 구조 설계 목표는 50,000개 노드다.
- Dynalist 대안으로서 벌크 편집은 MVP 핵심 범위에 포함한다. 구현 순서는 기본 키보드 편집 이후, 로컬 persistence/Yjs 동기화 전에 넣는다.
- 벌크 편집, Yjs 런타임 통합, 개인 다기기 sync는 MVP 핵심 기능으로 구현 완료되었고, 이후 작업은 키보드 파워 편집과 성능 검증 순서로 진행한다.
