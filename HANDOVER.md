# 인수인계 (아카이브)

> ⚠️ **이 문서는 2026-08-19 문서 체계 개편([ADR-0001](./docs/adr/0001-design-doc-authority.md))
> 이후 갱신되지 않는다 — 명세로 쓰지 않는다.** 역할은 이렇게 넘어갔다:
>
> - 설계·불변식 → [DESIGN.md](./DESIGN.md)
> - 작업 방식·검증 → [AGENTS.md](./AGENTS.md)
> - 결정과 근거 → [docs/adr/](./docs/adr/)
> - 조심할 것(함정·실측값) → [docs/design/code-rationale.md](./docs/design/code-rationale.md)
> - 다음 작업 큐 → [PLANS.md](./PLANS.md)
> - 작업 중 발견 → [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)
>
> 아래는 재작성 세션(~2026-08)의 서사를 역사 기록으로만 남긴 것이다.

## 한 줄 요약

Yjs/Lexical/Firebase 기반 9,200줄 TDD 산출물을 폐기하고, 의존성 0(react/react-dom 제외)의
로컬 우선 아웃라이너로 재작성했다. 자체 병합 모델 기반 기기 간 동기화(임의 REST + **GitHub
저장소** 백엔드), GitHub OAuth 로그인, 가상화까지가 1차. 그 위에 **문서당 파일 분할 · CSP ·
종단 간 암호화 · PWA 매니페스트 · 모바일 터치 바 · Pages 배포**를 얹었다.

## 커밋 히스토리 (이 작업의 서사)

| 커밋 | 내용 |
| --- | --- |
| `736c29c` rewrite | 전면 재작성. 행 = textarea(포커스 시) / 렌더된 마크다운(비포커스) → 한글 IME가 브라우저 기본 동작. 9,200줄 → 2,345줄 |
| `ebf3587` feat | 동기화(노드 단위 LWW + 분수 인덱스 + 묘비) + 250행 초과 시 가상화. 1만 줄 붙여넣기 57초 → 3.2초 (draft 패턴) |
| `669e03d` fix | **서브에이전트 5방향 감사** 결과 수정. 핵심: 동시 삽입 시 sort 키 충돌로 해당 행 영구 편집 불가, 부활 문서가 묘비에 다시 묻힘, 논리 시계 포화, 악성 페이로드로 병합 크래시, undo가 sync에 되돌려짐. `validate.ts`(신뢰 경계)와 `history.ts`(재스탬프 undo) 신설 |
| `8b6cfc1` docs | 죽은 docs/ 트리 29파일 삭제 (사용자 지시) |
| `460819e` feat | **GitHub 저장소 백엔드**. contents API의 GET(내용+sha)/PUT(sha 요구)이 기존 전송 계약과 정확히 일치 |
| `fe01f62` refactor | **도메인 폴더 재구성** + 컴포넌트 렌더링 전용화(Outline 400→50줄) + **GitHub OAuth 로그인** |
| `95d5de9` feat | **문서당 파일 하나**. `{폴더}/docs/{id}.json` + `graves.json`, 고친 문서만 커밋. 키 정렬·들여쓰기로 "같은 내용 = 같은 바이트 = 커밋 없음". 목록의 blob sha가 곧 내용 해시라 안 바뀐 문서는 받지도 않음 |
| `86b6440` feat | **CSP 메타 태그**. 엄격한 정책은 `index.html`에, dev 서버용 완화는 Vite 플러그인이. 빌드 산출물을 상대로 도는 e2e |
| `610d4b1` feat | **종단 간 암호화(선택)**. PBKDF2→AES-GCM, salt는 봉투 안에. `locked` 상태를 실패와 분리 |
| `ca95c67` feat | **PWA 매니페스트** + 아이콘. 상대 `start_url`이라 하위 경로 서빙도 동작 |
| `de5e896` feat | **모바일 터치 바**. 폰에 Tab이 없어 들여쓰기가 불가능했던 것 — 편집 중에만 키보드 위에 ⇤ ⇥ ↑ ↓ |
| `a8c4c9a` build | `base: "./"` + **GitHub Pages 워크플로**. Vercel/Pages 배포 문서화 |
| `413455e` fix | 긴 문서에서 **편집 중인 행에서 스크롤해 벗어나면 1초 뒤 도로 끌려오던 버그**. large.spec.ts가 가끔 실패하던 진짜 원인 |
