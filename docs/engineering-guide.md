# 개발 규칙

## 1. 기본 원칙

- TDD를 기본 개발 방식으로 사용한다.
- 테스트하기 어려운 코드는 구조를 다시 본다.
- 외부 라이브러리 의존은 adapter에 모은다.
- 제품 동작이 바뀌면 요구사항 문서와 테스트를 함께 바꾼다.
- MVP 범위 밖 기능은 구현하지 않고 문서에 보류로 남긴다.

## 2. 추천 디렉터리 구조

```txt
src/
  app/
    App.tsx
    routes.tsx
  components/
    Outliner.tsx
    OutlineRow.tsx
    Breadcrumb.tsx
    SyncStatusBadge.tsx
  domain/
    outline.ts
    bulkOutline.ts
    outlineSelectors.ts
    outlineTypes.ts
  editor/
    lexicalAdapter.ts
    lexicalCommands.ts
  persistence/
    localPersistence.ts
  sync/
    yjsAdapter.ts
    remoteStore.ts
    firebaseRemoteStore.ts
    fakeRemoteStore.ts
    syncQueue.ts
  test/
    fixtures.ts
    factories.ts
    fakeClock.ts
```

## 3. 명명 규칙

- command 함수는 동사로 시작한다.
  - `createNodeAfter`
  - `splitNode`
  - `indentNode`
  - `outdentNode`
  - `toggleCollapse`
  - `bulkIndentNodes`
  - `bulkOutdentNodes`
  - `bulkDeleteNodes`
- selector 함수는 관찰 결과를 이름에 드러낸다.
  - `getVisibleNodes`
  - `getBreadcrumbPath`
  - `getNodeDepth`
- adapter는 외부 시스템 이름을 포함한다.
  - `lexicalAdapter`
  - `yjsAdapter`
  - `firebaseRemoteStore`

## 4. Definition of Done

기능 하나는 아래 조건을 만족해야 완료다.

- 실패하는 테스트가 먼저 작성되었다.
- 구현 후 관련 테스트가 통과한다.
- 리팩터링 후에도 테스트가 통과한다.
- 타입 체크가 통과한다.
- 핵심 경계 조건 테스트가 있다.
- 관련 문서가 최신 상태다.
- MVP 범위를 벗어난 동작은 구현하지 않았다.

## 5. 커밋 전 확인 후보

```sh
npm run typecheck
npm run test
npm run test:e2e
```

초기에는 전체 E2E가 느릴 수 있으므로 smoke E2E만 필수로 두고, 전체 E2E는 주요 변경 전후로 실행할 수 있다.

## 6. 구현 순서 규칙

1. 요구사항에서 사용자 관찰 동작을 고른다.
2. 단위 테스트로 표현 가능한지 먼저 확인한다.
3. 단위 테스트가 어렵다면 adapter 경계가 흐린지 점검한다.
4. 실패 테스트를 작성한다.
5. 최소 구현으로 통과시킨다.
6. 이름과 책임을 정리한다.
7. 필요한 경우 통합/E2E 테스트를 추가한다.

## 7. 금지할 패턴

- UI 컴포넌트 안에서 트리 구조를 직접 조작
- Firebase 호출을 컴포넌트에서 직접 수행
- 테스트에서 실제 네트워크에 의존
- ID와 현재 시각을 테스트에서 고정할 수 없게 작성
- 모든 동작을 Playwright로만 검증
- 구현 편의상 MVP 범위 밖 기능을 함께 추가

## 8. 문서 업데이트 규칙

- 새 요구사항은 `docs/requirements.md`에 추가한다.
- Phase 변경은 `docs/development-plan.md`에 반영한다.
- 테스트 구조 변경은 `docs/testing-strategy.md`에 반영한다.
- 구조 결정은 `docs/architecture.md`와 `docs/adr.md`에 남긴다.
- 개발 규칙 변경은 이 문서에 반영한다.
