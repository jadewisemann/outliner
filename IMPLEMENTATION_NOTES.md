# IMPLEMENTATION_NOTES.md — 휘발성 working memory

작업 중 발견한 숨은 불변식·실측값·edge case·실패한 접근·문서-코드 충돌 판정 근거를
`## YYYY-MM-DD - 주제` 아래 불릿으로 적는다. **최신이 위.**

영구 지식은 Reconcile 단계에서 **승격 후 여기서 지운다** — 설계·불변식은 `DESIGN.md`, 동작
상세는 `docs/design/*`, 함정·실측값·실패한 대안은 `docs/design/code-rationale.md`.

---

## 2026-08-20 - R2 useOutline 분할

- **350줄 목표는 계획 내부에서 모순이었다.** refactor-plan.md는 "서식·구조 분기, 메모,
  확대, 첨부는 useOutline에 남는다"고 지시하면서 목표를 350줄 아래로 잡았는데, 남기라는
  것들(onTextKeyDown ~170줄 + api 조립 ~110줄 + OutlineView 타입/import ~100줄)만으로
  350을 넘는다. 지시를 따르고 목표는 실측으로 갱신했다: 834 → 566줄 (-32%).
  더 줄이려면 "행 키보드" 관심사(onTextKeyDown + autoUndo)를 다섯 번째 훅으로 뽑는
  결정이 필요하다 — 계획의 "조립만 한다"와는 맞고, "남긴다" 문장과는 어긋난다.
- **`Choice`/`Completion` 타입은 useCompletion.ts로 옮기되 useOutline이 재수출한다** —
  Row.tsx·팔레트의 import 경로를 깨지 않기 위해 (R2의 "Outline.tsx/Row.tsx 무변경" 기준).
- **onTextKeyDown의 자동완성 분기는 boolean 반환으로 순서를 유지한다** — completions
  .onKeyDown이 true를 돌려주면 그 키는 소비된 것: 계획이 지시한 패턴 그대로.
- e2e `settings.spec.ts:12`(표시 설정 리로드)가 4단계 검증의 전체 실행에서 1회 실패,
  단독 재실행에서 통과, 5단계 전체 실행(64/64)에서 재관찰 안 됨 — 변경 경로(자동완성)와
  무관한 flake로 판정. 다시 나타나면 그때는 조사 대상.
