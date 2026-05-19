# 9. Git 작업 흐름

LLM이 수행하는 코드, 문서, 설정 변경은 아래 흐름을 따른다. 목표는 `main`의 이력을 읽기 쉽게 유지하고, 작업 단위와 최종 의도를 모두 남기는 것이다.

## 기본 원칙

- `main`에는 직접 커밋하지 않는다.
- 모든 변경은 새 작업 브랜치에서 시작한다.
- 작업 브랜치 이름은 가능하면 `codex/<short-task>` 형식을 사용한다.
- 작업 중에는 기능, 테스트, 문서처럼 검토 가능한 작은 단위로 커밋한다.
- `main` 최신화는 merge commit 대신 rebase로 한다.
- 작업 완료 후 `main`에는 squash merge로 반영한다.
- squash merge 메시지는 작업의 흐름과 최종 결과가 드러나도록 정리한다.

## 작업 순서

1. 작업 전 `git status --short --branch`로 현재 브랜치와 미커밋 변경을 확인한다.
2. `main`에서 새 브랜치를 만든다.
3. 변경을 작게 나누어 구현하고, 각 단위마다 관련 테스트나 문서 업데이트를 함께 확인한다.
4. 커밋 전에는 `docs/engineering-guide/pre-commit-checks.md`의 관련 항목을 실행한다.
5. `main`이 앞서가면 작업 브랜치에서 `git rebase main`으로 최신화한다.
6. 충돌을 해결한 뒤 같은 검증을 다시 실행한다.
7. 작업이 끝나면 squash merge를 사용해 `main`에 하나의 정리된 커밋으로 반영한다.

## 커밋 메시지

개별 작업 커밋과 squash merge 커밋 모두 같은 형식을 따른다.

```text
<type>(<scope>): <summary in English>

<본문은 한글로 작성한다. 변경 이유, 중요한 선택, 검증 내용을 짧게 적는다.>
```

- 제목은 영어로 쓴다.
- 제목은 `type(scope): summary` 형식을 사용한다.
- 본문은 한글로 쓴다.
- 본문에는 변경 이유, 주요 결정, 검증 결과를 남긴다.
- `scope`는 영향을 받은 영역을 짧게 쓴다.
- 사소한 WIP 커밋도 최종 squash 전에는 의미가 읽히게 정리한다.

## 추천 type

- `feat`: 사용자 관찰 기능 추가 또는 확장
- `fix`: 버그 수정
- `docs`: 문서 변경
- `test`: 테스트 추가 또는 수정
- `refactor`: 동작을 바꾸지 않는 구조 개선
- `chore`: 빌드, 설정, 유지보수 변경

## 예시

```text
docs(workflow): Define rebase-based LLM workflow

LLM 작업은 새 브랜치에서 작은 커밋으로 진행하고, main 최신화는 rebase로 처리하도록 정했다.
최종 반영은 squash merge로 제한해 main 이력을 작업 결과 중심으로 읽을 수 있게 한다.
```

```text
feat(history): Add backup retention preferences

히스토리 백업 보관 기간을 사용자가 조정할 수 있게 했다.
기본값은 기존 동작과 맞추고, 설정 변경 후에도 기존 백업 목록이 유지되는지 검증했다.
```

## 금지 사항

- `main`에 직접 기능 커밋을 쌓지 않는다.
- 작업 브랜치에 `main`을 merge해서 merge commit을 만들지 않는다.
- `sync`, `update`, `fix stuff`처럼 변경 의도가 드러나지 않는 제목을 쓰지 않는다.
- 여러 독립 변경을 하나의 큰 커밋으로 묶지 않는다.
