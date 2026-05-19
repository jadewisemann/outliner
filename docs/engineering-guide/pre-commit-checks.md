# 5. 커밋 전 확인 후보

```sh
npm run typecheck
npm run test
npm run test:e2e
```

초기에는 전체 E2E가 느릴 수 있으므로 smoke E2E만 필수로 두고, 전체 E2E는 주요 변경 전후로 실행할 수 있다.
