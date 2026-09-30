# Cloudflare Worker 백엔드

이 백엔드는 레퍼런스 서버(`server/outliner-server.mjs`)와 같은 계약을 Cloudflare 무료 플랜 위에
구현한 것입니다. 앱은 둘을 구분하지 못하므로, 동기화 설정의 **내 서버 / URL**에 주소만 넣으면 됩니다.

직접 실행하는 서버와 비교하면, 이 백엔드는 컴퓨터를 켜 둘 필요가 없고 TLS 인증서를 직접 관리하지
않아도 되며, 무료 VM과 달리 유휴 상태를 이유로 회수되지도 않습니다
([backend-capacity.md](../../docs/research/backend-capacity.md) §5·§6).

## 배포

Cloudflare 계정만 있으면 되고, 결제 수단은 필요하지 않습니다.

```bash
cd server/cloudflare
npx wrangler login
npx wrangler deploy
npx wrangler secret put OUTLINER_TOKEN   # 길고 무작위한 값을 넣는다
```

배포가 끝나면 `https://outliner-sync.<계정>.workers.dev`가 출력됩니다. 앱에는 다음과 같이
값을 넣습니다.

| 칸 | 값 |
|---|---|
| 동기화 주소 | `https://outliner-sync.<계정>.workers.dev/workspace` |
| 토큰 | 위에서 `OUTLINER_TOKEN`으로 정한 값 |

토큰을 정하지 않으면 Worker가 모든 요청에 503으로 답합니다. Worker 주소는 공개되어 있어서,
토큰이 없으면 주소를 아는 사람은 누구나 노트를 읽을 수 있기 때문입니다. 서버 운영자에게도
내용을 보이고 싶지 않다면 앱에서 암호를 함께 거세요.

주소의 경로(`/workspace`)는 `wrangler.toml`의 `OUTLINER_PATH`가 정합니다. 이 값은 노트를 담는
Durable Object의 이름이기도 합니다. 그래서 이미 쓰고 있는 배포에서 값을 바꾸면 Worker가 비어 있는 새
객체를 가리키게 되고, 노트는 옛 객체에 남습니다. 앱은 원격이 빈 것으로 보고 이 기기의 노트를 새 객체에
올립니다.

Worker 안에서 저장소 호출이 실패하면 CORS 헤더를 단 500으로 답합니다. 헤더 없이 나간 오류는
브라우저가 서버 오류가 아니라 네트워크 오류로 보고하기 때문입니다. 앱은 이 오류를 동기화 배지에
표시하고 나중에 다시 시도합니다.

## 왜 Durable Object인가

KV는 결과적 일관성(eventual consistency)만 보장하므로, 두 기기가 오래된 사본을 기준으로 둘 다
`If-Match` 검사를 통과할 수 있습니다. Durable Object는 단일 스레드로 실행되는 인스턴스 하나이고
그 저장소가 트랜잭션을 보장하므로, 계약이 요구하는 compare-and-swap이 그대로 성립합니다.
Workers Free 플랜에서는 SQLite 기반 Durable Object만 만들 수 있고, 값 하나의 크기 상한이 2MB라서
본문은 1MB 조각으로 나누어 저장합니다.

무료 한도(요청 수·저장 용량)는 개인 동기화에 필요한 양에 비해 여유가 큽니다. 화면을 연 채로 둔 기기 하나가 10초마다
`GET`을 하나씩 보내므로 요청 수는 하루에 약 8,640회가 되고, 편집하는 동안에는 여기에 1.5초마다 `PUT`이 더해집니다.
요청마다 워크스페이스 전체가 오가므로, 큰 워크스페이스라면 대역폭보다 요청 수 한도를 먼저 보세요. 한도의 정확한 값은 바뀔 수 있으니
[Durable Objects 요금 문서](https://developers.cloudflare.com/durable-objects/platform/pricing/)에서
확인하세요.
