# Cloudflare Worker 백엔드

레퍼런스 서버(`server/outliner-server.mjs`)와 같은 계약을 Cloudflare 무료 플랜 위에 올린
것입니다. 앱은 둘을 구분하지 못하고, 동기화 설정의 **내 서버 / URL**에 주소만 넣으면 됩니다.

직접 띄우는 서버와 비교하면, 컴퓨터를 켜 둘 필요가 없고 TLS 인증서를 직접 관리하지 않아도
되며, 무료 VM처럼 유휴 상태를 이유로 회수되지도 않습니다
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
넣습니다.

| 칸 | 값 |
|---|---|
| 동기화 주소 | `https://outliner-sync.<계정>.workers.dev/workspace` |
| 토큰 | 위에서 정한 `OUTLINER_TOKEN` |

토큰을 정하지 않으면 Worker가 모든 요청에 503으로 답합니다. Worker 주소는 공개되어 있어서,
토큰이 없으면 주소를 아는 사람 누구나 노트를 읽을 수 있기 때문입니다. 서버 운영자에게도
내용을 보이고 싶지 않다면 앱에서 암호를 함께 거세요.

## 왜 Durable Object인가

KV는 결과적 일관성(eventual consistency)만 보장하므로, 두 기기가 오래된 사본을 기준으로 둘 다
`If-Match` 검사를 통과할 수 있습니다. Durable Object는 단일 스레드로 도는 인스턴스 하나이고
저장소가 트랜잭션을 보장하므로, 계약이 요구하는 compare-and-swap이 그대로 성립합니다.
Workers Free 플랜에서는 SQLite 기반 Durable Object만 만들 수 있고, 값 하나의 상한이 2MB라서
본문은 1MB 조각으로 나누어 저장합니다.

무료 한도(요청 수·저장 용량)는 개인 동기화에 비해 여유가 큽니다. 화면을 연 채로 둔 기기 하나가 10초마다
`GET`을 하나씩 보내므로 하루에 약 8,640회이고, 편집하는 동안에는 1.5초마다 `PUT`이 더해집니다.
요청마다 워크스페이스 전체가 오가므로, 큰 워크스페이스라면 대역폭보다 요청 수 한도를 먼저 보세요. 한도의 정확한 값은 바뀔 수 있으니
[Durable Objects 요금 문서](https://developers.cloudflare.com/durable-objects/platform/pricing/)에서
확인하세요.
