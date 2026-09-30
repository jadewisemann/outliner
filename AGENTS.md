# AGENTS.md — 에이전트 작업 방식의 정본

이 문서가 이 저장소에서 일하는 방식의 정본이다. `CLAUDE.md`는 이 문서를 가리키는 포인터일
뿐이다. Git 협업의 세부 사항은 [CONTRIBUTING.md](./CONTRIBUTING.md)가 SSOT이고, 아래 Git 절은
그 문서를 에이전트용으로 요약한 것이다. 둘이 충돌하면 CONTRIBUTING.md가 우선한다.

## 저장소 정보

- Dynalist를 대신하는 로컬 우선(local-first) 아웃라이너. 단일 패키지이므로 작업 디렉터리는 루트 하나다.
- 스택: Vite + React 18 + TypeScript. **런타임 의존성은 react/react-dom, 그리고 수식이 있을
  때만 지연 로드되는 katex뿐**이고, 이것은 의도된 제약이다 (DESIGN.md 원칙 12, ADR-0004).
  새 런타임 의존성을 추가하려면 ADR이 필요하다.
- 실행법·기능 목록·배포는 [README.md](./README.md)에, 설계·불변식은 [DESIGN.md](./DESIGN.md)에 있다.

## 절대 규칙

- `main`에 직접 커밋·push하지 않는다.
- 사용자가 명시적으로 요청하지 않는 한 push·PR 생성은 먼저 확인받는다.
- 문서와 코드가 충돌하면 **조용히 코드를 따르지 않는다.** 대신 아래 판정 규칙대로 판정한다.
- 바깥에서 오는 데이터(동기화 응답, 가져오기 파일, 저장소에 남아 있던 값)는 반드시
  `src/storage/validate.ts`를 통과시킨다.
- **한국어를 출력할 때는 [docs/korean-output.md](./docs/korean-output.md)를 준수한다.** 이
  지침은 작업 종류와 무관하게 항상 적용되므로, 하위 문서에 관한 「필요한 것만 연다」 규칙의
  예외다. 그 문서는 요약하지 않고 전문을 읽는다(이유가 문서 안에 서술되어 있다). 코드 주석·커밋
  메시지·로그 문자열처럼 코드에 속하는 텍스트는 이 지침의 적용 대상이 아니고 기존 관례를 따른다.
- 동작 차이(버그 포함)를 발견하면 조용히 "개선"하지 않는다. 대신 `IMPLEMENTATION_NOTES.md`에
  기록하고, 재현/수정 여부를 명시적으로 결정한다.

## 출력 지침이 겹칠 때의 우선순위

이 저장소에는 출력의 형태를 규정하는 지침이 둘 있다. 두 지침은 **다른 층위를 규정하기 때문에 함께
지킬 수 있고**, 겹치는 부분은 어느 하나를 버리는 방식으로 해소하지 않는다.

| 지침 | 규정하는 것 | 언제 적용되나 |
|---|---|---|
| [docs/korean-output.md](./docs/korean-output.md) | **문장을 어떻게 구성하는가**: 조사·어미·문장 성분·어휘 선택 | 한국어를 출력할 때 항상 |
| `i-have-adhd` 플러그인 스킬 | **무엇을 어떤 순서로 얼마나 쓰는가**: 행동 우선, 번호 매기기, 분량 | `/i-have-adhd`로 켰을 때만 |

`.claude/settings.json`이 마켓플레이스(`ayghri/i-have-adhd`)와 `enabledPlugins`를 선언하고
있으므로, 플러그인이 설치된 기기에서는 이 저장소의 세션에서 스킬을 쓸 수 있다. 다만 **선언이
설치를 대신하지는 않는다.** 플러그인 본체를 받아오는 과정이 수행되지 않은 환경에서는 스킬이
목록에 나타나지 않으며, Claude Code on the web의 원격 컨테이너가 그런 환경이다. 그때는 다음 두
명령으로 설치한다.

```bash
claude plugin marketplace add ayghri/i-have-adhd
claude plugin install i-have-adhd@i-have-adhd
```

이 두 명령이 기록하는 사용자 설정은 위 저장소 선언과 형식이 동일하므로, 저장소의 선언이 곧
공식 설치 방법을 그대로 옮긴 것이다.

스킬 본문에 `disable-model-invocation: true`가 있어서 **사용자가 켜지 않으면
활성화되지 않는다.** 상시 활성 플래그(`~/.claude/.i-have-adhd-always`)는 저장소가 아니라 기기에
있으므로, 선언을 커밋해도 다른 사람의 출력 방식이 강제로 바뀌지는 않는다. 개인적으로 끄려면
`.claude/settings.local.json`에 `"i-have-adhd@i-have-adhd": false`를 넣는다(설정 우선순위가
user < project < local이다).

**실제로 충돌하는 지점은 요청을 확인하는 문장 하나다.** korean-output.md의 「구 단위」 3번 조항은
예시에서 `요청을 확인했습니다`처럼 쓰라고 권하는데, 스킬의 10번 규칙은 그런 서두 자체를
금지한다. 판정은 다음과 같다.

- 확인 문장을 **쓰는 자리에서는** korean-output.md대로 완결된 문장으로 쓴다.
- ADHD 모드에서는 **그 자리를 두지 않는다.** 조항을 어기는 것이 아니라 해당 문장을 아예 쓰지
  않는 것이므로, 두 지침이 동시에 만족된다.

이 판정의 근거는 스킬 자체에도 있다. 스킬의 「When to break the rules」 6번 항목이 에이전트 harness
안에서는 system prompt가 스킬보다 우선한다고 밝히고 있고, korean-output.md는 이 저장소의 절대
규칙이다. 나머지 조항들은 오히려 같은 방향을 가리킨다. 예를 들어 비유적 어휘를 피하라는
korean-output.md의 「구 단위」 3번 조항과, 관용구를 삭제하라는 스킬의 pre-send check 5번이 그렇다.

## Source of truth

| 무엇 | 정본 |
|---|---|
| 설계·불변식 (What / Why / Invariant) | [`DESIGN.md`](./DESIGN.md) |
| 하위 시스템 상세 설계 | `docs/design/*.md` (DESIGN.md의 지도에서 **필요한 것만** 연다) |
| 결정의 이유 ("왜 이렇게 안 했는가") | `docs/adr/NNNN-*.md` |
| 진행 중 변경의 계획 | [`PLANS.md`](./PLANS.md) |
| 작업 중 발견 (휘발성 working memory) | [`IMPLEMENTATION_NOTES.md`](./IMPLEMENTATION_NOTES.md) |
| 함정·실측값·실패한 대안 | [`docs/design/code-rationale.md`](./docs/design/code-rationale.md) |
| Git 협업 규칙 | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| 한국어 출력 방식 | [`docs/korean-output.md`](./docs/korean-output.md) (**항상 적용된다**) |
| 실행법·기능 목록·배포 | [`README.md`](./README.md) |
| 기계가 소비하는 계약 (모델 타입, CSP 값, 매니페스트 …) | **코드** (DESIGN.md의 「코드가 정본인 것들」 목록 참고) |

## 문서-코드 충돌 판정 규칙

1. 코드가 DESIGN.md의 원칙·불변식이나 하위 문서의 서술과 어긋나면, 구현이 틀린 것인지 설계
   의도가 바뀐 것인지를 **판정**한다.
2. 의도가 바뀐 것이면 DESIGN.md(또는 해당 하위 문서)를 고치고, 구현이 틀린 것이면 구현을
   고친다. 판정 근거는 `IMPLEMENTATION_NOTES.md`에 남긴다.
3. 예외: DESIGN.md의 「코드가 정본인 것들」에 오른 파일은 계속 코드가 정본이다. 문서는
   이 파일들을 서술하기만 하고, 둘이 어긋나면 문서를 고친다.

## 작업 사이클 — Understand → Implement → Reconcile

모든 작업(작은 티켓 하나 포함)이 이 3단계를 거친다.

### 1. Understand — 코드보다 모델 먼저

1. `DESIGN.md`에서 관련 원칙·불변식을 읽는다.
2. 지도가 가리키는 하위 시스템 문서에서 **해당 시스템만** 읽는다. 관련 없는 문서는 열지 않는다.
3. `IMPLEMENTATION_NOTES.md`와 `docs/design/code-rationale.md`에서 관련 발견·함정을 확인한다.
4. 필요한 코드만 조사하고, **변경이 현재 설계에 어떻게 들어맞는지 설명할 수 있어야** 구현을
   시작한다.

### 2. Implement — 모델 안에서 구현

5. 구현한다. **설계 위반이 필요해 보이면 구현을 멈추고** DESIGN.md/ADR 쪽 논의로 돌아간다.
6. 작업 범위에 필요한 만큼만 검증한다(아래 검증 명령과 테스트 최소화 원칙 참고).
7. 작업 중 발견한 숨은 불변식·실측값·edge case·실패한 접근은 즉시 날짜와 함께
   `IMPLEMENTATION_NOTES.md`에 기록한다.

### 3. Reconcile — 모델을 현실에 맞춘다

8. `git diff`를 DESIGN.md·관련 하위 문서와 대조하면서 다음을 확인한다. 새 숨은 가정이 생기지
   않았는가? 문서가 서술하는 동작이 바뀌지 않았는가?
9. 정신 모델이 바뀌었으면 문서를 갱신한다. 구조적 결정이 새로 내려졌으면 ADR을 추가한다.
10. IMPLEMENTATION_NOTES.md의 영구 지식은 성격에 따라 **승격**한다. 즉 설계·불변식은
    DESIGN.md로, 동작 상세는 하위 시스템 문서로, 함정·실측값은 code-rationale.md로 옮긴다.
    승격한 항목은 notes에서 지운다.
11. PLANS.md에서 해당 단계의 체크리스트를 갱신한다.

> **강제되는 것은 "문서 수정"이 아니라 "문서와의 일관성 검토"다.** 단순 버그 수정이나 스타일
> 변경을 할 때는 의미 없는 문서 diff를 만들지 않는다.

## 검증 명령

| 명령 | 무엇을 보나 | 언제 돌리나 |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | 모든 코드 변경 |
| `npm test` | 순수 로직 유닛 (Vitest) | 트리·병합·정렬 키·검증·변환 등 순수 로직을 변경했을 때 |
| `npx vitest run <경로>` | 특정 테스트만 | 변경 범위와 직접 관련된 테스트를 우선한다 |
| `npm run build` | `tsc -b` + Vite 빌드 | 번들·CSP·에셋 경로에 영향을 주는 변경. **테스트 파일의 타입 오류는 typecheck가 놓치고 build가 잡는다.** 그래서 커밋 전에 한 번 실행한다 |
| `npm run test:e2e` | 실제 브라우저 시나리오 (Playwright) | UI 동작·동기화·CSP·터치를 변경했을 때 |

e2e는 웹 서버를 **둘** 띄운다. 하나는 dev(5173)이고, 다른 하나는 `vite preview`(4173)이다.
`csp.spec.ts`와 `install.spec.ts`는 빌드 결과(4173)를 대상으로 실행된다. GitHub 백엔드 스펙은
동기화 케이던스 때문에 오래 걸린다(`test.setTimeout(120_000)` 수준).

**브라우저는 `playwright.config.ts`가 스스로 찾는다.** Playwright가 고정해 둔 빌드가 없으면
`PLAYWRIGHT_BROWSERS_PATH` 아래에 실제로 있는 chromium을 쓴다. 이렇게 하는 이유는 컨테이너가
미리 넣어둔 브라우저와 패키지가 고정한 빌드가 각자 따로 갱신되기 때문이다. 둘이 어긋나면
**스펙 몇 개가 실패하는 것이 아니라 모든 스펙이 launch 단계에서 실패해서 e2e 신호가 0이 된다.**
그래서 이 설정이 스스로 찾지 못하는 브라우저(시스템 Chrome 등)를 가리킬 때만
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`가 필요하다.

## 테스트 최소화 원칙

- **작업 범위에 필요한 검증만** 실행한다. 모든 명령을 관성적으로 돌리지 않는다.
- 유닛 테스트는 깨지기 쉬운 **순수 로직만** 본다(정렬 키, 트리 연산, 병합 규칙, 왕복 변환,
  인라인 파싱, 검증). UI 행동은 실제 브라우저 e2e로 확인한다.
- 테스트는 명확한 회귀 위험이나 완료 조건이 있을 때만 작성·실행한다. 정적 스타일·단순 마크업
  변경은 typecheck(필요하면 build)까지만 실행한다.
- 미래 요구를 예상한 테스트, **구현을 그대로 옮겨 적는 테스트**, 단순 렌더링 확인 테스트는
  추가하지 않는다.
- 전체 테스트는 통합·마무리 단계에서 실행한다. **검증 개수를 작업 품질로 간주하지 않는다. 대신
  작업 위험과 완료 조건에 비례해 검증한다.**

## 코드 배치 규칙

- 코드는 도메인별 폴더(`outline/`, `palette/`, `sync/`, `storage/`, `search/`, `transfer/`,
  `shared/`, `app/`)로 나뉜다. 각 도메인 안에서 로직은 `.ts` 순수 함수와 훅으로, 렌더링은
  `components/`로 나뉜다.
- **컴포넌트는 렌더링만 한다.** 동작은 훅(`useOutline.ts` 등)과 순수 함수에 둔다. 예컨대
  `Outline.tsx`는 50줄이다.
- `api/`는 Vercel serverless function을 두는 폴더이고, client secret을 브라우저에 보내지 않기 위한
  OAuth code↔token 교환 외의 역할을 갖지 않는다.
- 새 트리 연산은 `outline/__tests__/tree.test.ts`의 `shape()` 자동 검사(파생 캐시 일관성)를
  통과해야 한다.

## 커밋 게이트 훅

`.claude/hooks/design-review-gate.mjs`(PreToolUse: Bash)가 커밋을 감시한다.
`src/`·`api/`·`index.html`의 변경이 설계 문서(DESIGN.md, IMPLEMENTATION_NOTES.md, PLANS.md,
`docs/`) 변경 없이 커밋되려 하면, 훅이 커밋을 **딱 한 번** 멈추고 위 Reconcile 검토를 요구한다.
검토 결과 "문서 변경 불필요"도 정당한 결론이다. 그 경우에는 같은 커밋 명령을 그대로 다시
실행하면 통과된다. 테스트(`__tests__`)만 바뀐 커밋은 훅이 멈추지 않는다.

## Git 요약 (SSOT는 CONTRIBUTING.md)

- `main`에 직접 커밋/push하는 것을 금지한다. `<type>/<짧은-영문-설명>` 브랜치에서 작업하고 PR로
  병합한다.
- 커밋: `<type>: <제목>` (type은 feat/fix/docs/style/refactor/test/chore 중 하나, 제목은 50자
  내외, 끝에 마침표를 찍지 않음).
- **병합은 언제나 Squash로 한다.** PR 제목이 곧 squash 커밋의 제목이다.
- push·PR 생성은 사용자가 명시적으로 요청하지 않는 한 먼저 확인받는다.
