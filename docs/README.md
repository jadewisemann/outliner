# Outliner 개발 문서

이 폴더는 Local-First Outliner MVP를 TDD로 개발하기 위한 기준 문서 모음이다. `.dev.md`는 제품 방향과 전체 요약이고, `docs/`는 실제 구현 중 계속 참조할 상세 문서다.

## 문서 목록

- [요구사항](./requirements.md)
  - 제품 범위, 사용자 시나리오, 기능 요구사항, 비기능 요구사항, 결정 필요 항목
- [개발 단계](./development-plan.md)
  - Phase별 목표, TDD 순서, 완료 기준, 산출물
- [테스트 전략](./testing-strategy.md)
  - 테스트 피라미드, 테스트 파일 구조, TDD 규칙, 우선 작성할 테스트 스키마
- [아키텍처](./architecture.md)
  - 모듈 경계, 데이터 모델, Yjs/Lexical/Firebase 연동 방식, 오프라인 동기화 구조
- [개발 규칙](./engineering-guide.md)
  - 코드 스타일, 커밋 전 확인, 디렉터리 구조, Definition of Done
- [결정 기록](./adr.md)
  - 확정된 기술/제품 결정과 기술 검증이 필요한 결정

## 개발자가 매번 확인할 순서

1. 새 기능을 시작하기 전 [요구사항](./requirements.md)에서 사용자 관찰 동작을 확인한다.
2. [테스트 전략](./testing-strategy.md)에 맞춰 실패하는 테스트를 먼저 작성한다.
3. [개발 단계](./development-plan.md)의 현재 Phase 완료 기준을 확인한다.
4. 구현 중 구조 판단이 필요하면 [아키텍처](./architecture.md)와 [개발 규칙](./engineering-guide.md)을 따른다.
5. 제품/기술 결정을 바꾸면 [결정 기록](./adr.md)에 남긴다.

## 문서 유지 규칙

- 구현과 문서가 어긋나면 같은 작업에서 함께 수정한다.
- 결정되지 않은 내용은 암묵적으로 구현하지 않고 `확정 필요`로 표시한다.
- 테스트가 제품 동작을 정의한다. 요구사항 변경은 테스트 변경을 동반해야 한다.
