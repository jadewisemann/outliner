# CONTRIBUTING — Git 협업 규칙

사람과 에이전트가 공용으로 따르는 Git 규칙의 단일 기준(SSOT)이다. `AGENTS.md`의 Git 절은 이
문서의 요약이고, 충돌하면 이 문서가 우선한다.

## 브랜치

- **main에 직접 커밋/push하지 않는다.** Protected Branch 설정 여부와 무관하게 규칙으로
  지킨다. 항상 작업 브랜치에서 작업하고 PR로 병합한다.
- 브랜치 이름: `<prefix>/<짧은-영문-설명>` — prefix는 대표 커밋 type(`feature/`·`fix/`·
  `refactor/`·`docs/`…), 소문자+하이픈+영문만. **브랜치 하나 = 작업 하나.**
- 원격 에이전트 세션이 지정받은 `claude/*` 브랜치는 예외로 허용한다 (세션이 이름을 정한다).

## 커밋

- 형식: `<type>: <제목>` — type은 feat / fix / docs / style / refactor / test / chore.
- 제목은 50자 내외, 끝에 마침표를 찍지 않는다.

## PR과 병합

- 사용자가 명시적으로 요청하지 않는 한 **push·PR 생성은 먼저 확인받는다.**
- **병합은 언제나 Squash, 예외 없음.** PR 제목이 곧 squash 커밋 제목이므로 커밋 컨벤션과
  같은 형식으로 쓴다. CLI/API로 병합할 때도 `merge_method: "squash"`.
- 병합 후 작업 브랜치는 삭제한다.

## 히스토리

- 공유 브랜치에서 rebase·force push 금지. 히스토리 재작성은 사용자 승인 + 원격 백업 브랜치를
  만든 뒤에만 한다.
