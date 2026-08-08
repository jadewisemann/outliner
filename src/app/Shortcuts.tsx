import { Panel } from "../shared/components/Panel";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "편집",
    items: [
      ["Enter", "커서 위치에서 항목 분리"],
      ["Shift+Enter", "메모 편집"],
      ["Tab / Shift+Tab", "들여쓰기 / 내어쓰기"],
      ["⌘/Ctrl+] / [", "들여쓰기 / 내어쓰기"],
      ["Backspace (줄 맨 앞)", "위 항목과 합치기"],
      ["⌘/Ctrl+Enter", "완료 표시"],
      ["⌘/Ctrl+D", "항목 복제 (자식까지)"],
      ["⌘/Ctrl+⇧+K", "항목 삭제"],
      ["⌘/Ctrl+Z, ⇧⌘Z", "실행 취소 / 다시 실행"]
    ]
  },
  {
    title: "서식",
    items: [
      ["⌘/Ctrl+B / I / E", "굵게 / 기울임 / 코드"],
      ["⌘/Ctrl+⇧+X / H", "취소선 / 강조"],
      ["⌘/Ctrl+K", "링크 (선택 영역을 감싼다)"],
      ["`# `, `## `, `### `", "제목 1·2·3"],
      ["`[] `", "이 목록을 체크리스트로"],
      ["`1. `", "이 목록을 번호 목록으로"],
      ["Backspace (변환 직후)", "변환 되돌리기"],
      ["`[[`, `#`", "문서 · 태그 자동 완성"]
    ]
  },
  {
    title: "이동과 구조",
    items: [
      ["↑ / ↓", "위·아래 항목으로 이동"],
      ["⌘/Ctrl+⇧+↑ / ↓", "항목을 위·아래로 옮기기"],
      ["⌘/Ctrl+.", "접기 / 펼치기"],
      ["⌘/Ctrl+⇧+. / ,", "확대 / 축소"],
      ["Bullet 드래그", "다른 위치로 옮기기"]
    ]
  },
  {
    title: "여러 항목",
    items: [
      ["Esc", "현재 줄을 항목 단위로 선택"],
      ["⇧+↑ / ↓, ⇧+클릭", "선택 범위 넓히기"],
      ["Tab, ⌘⇧↑↓, Backspace", "선택 항목 일괄 조작"],
      ["Space", "선택 항목 접기 / 펼치기"],
      ["⌘/Ctrl+C, X", "들여쓰기 텍스트로 복사 / 잘라내기"]
    ]
  },
  {
    title: "찾기와 실행",
    items: [
      ["⌘/Ctrl+P", "팔레트 — 문서·항목으로 이동"],
      ["⌘/Ctrl+⇧+P", "팔레트 — 명령 실행"],
      ["⌘/Ctrl+F", "이 문서 안에서 거르기 (제자리 필터)"],
      ["⌘/Ctrl+⇧+F", "워크스페이스 전체 검색"],
      ["⌘/Ctrl+\\", "사이드바 열고 닫기"],
      ["⌘/Ctrl+/", "이 도움말"]
    ]
  },
  {
    title: "검색·필터 연산자",
    items: [
      ["#태그", "하위 태그까지 (`#일/급함`)"],
      ["is:completed, is:incomplete", "완료 여부"],
      ["is:heading, is:bookmarked", "제목 · 즐겨찾기"],
      ["has:note, has:link, has:tag", "가진 것으로"],
      ["edited:3d, created:2w", "최근 며칠·몇 주 안"],
      ["parent:, ancestor:", "어디에 있는지로"],
      ['"따옴표", -제외', "구절 그대로 · 빼기"]
    ]
  }
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Panel className="shortcuts-panel" label="단축키" onClose={onClose}>
      <header className="panel-head">
        <h2>단축키</h2>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="shortcuts-grid">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map(([keys, description]) => (
                  <div key={keys}>
                    <dt>{keys}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
      </div>
      <footer className="panel-foot">
        마크다운 표기: <code>**굵게**</code> <code>*기울임*</code> <code>`코드`</code> <code>~~취소~~</code>{" "}
        <code>==강조==</code> <code>[[문서]]</code> <code>#태그</code>
      </footer>
    </Panel>
  );
}
