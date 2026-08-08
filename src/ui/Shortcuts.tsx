import { Panel } from "./Panel";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "편집",
    items: [
      ["Enter", "커서 위치에서 항목 분리"],
      ["Shift+Enter", "메모 편집"],
      ["Tab / Shift+Tab", "들여쓰기 / 내어쓰기"],
      ["Backspace (줄 맨 앞)", "위 항목과 합치기"],
      ["⌘/Ctrl+Enter", "완료 표시"],
      ["⌘/Ctrl+Z, ⇧⌘Z", "실행 취소 / 다시 실행"]
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
    title: "전체",
    items: [
      ["⌘/Ctrl+K, ⌘F", "검색 (`#태그`도 가능)"],
      ["⌘/Ctrl+\\", "사이드바 열고 닫기"],
      ["상단 점 표시", "동기화 상태 · 눌러서 설정"],
      ["⌘/Ctrl+/", "이 도움말"]
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
