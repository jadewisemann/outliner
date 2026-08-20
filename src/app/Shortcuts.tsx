import { Panel } from "../shared/components/Panel";
import {
  ACTION_LABELS,
  PRESET_LABELS,
  UNBOUND,
  describe,
  presetOf,
  type Action,
  type Keymap
} from "../shared/keymap";

/**
 * An action reads its keys out of the live keymap; a pair is written out
 * literally.
 *
 * The literals are the keys no preset can move — Enter, Tab, the arrows — plus
 * the typing that turns into formatting. Everything else has to come from the
 * table, or the panel starts lying the moment a key is rebound or a preset
 * switched, and a shortcut reference that lies is worse than none.
 */
type Entry = Action | [string, string];

const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "편집",
    items: [
      ["Enter", "커서 위치에서 항목 분리"],
      ["Shift+Enter", "메모 편집"],
      ["Tab / Shift+Tab", "들여쓰기 / 내어쓰기"],
      "indent",
      "outdent",
      ["Backspace (줄 맨 앞)", "위 항목과 합치기"],
      "done",
      "duplicate",
      "delete",
      "undo",
      "redo"
    ]
  },
  {
    title: "서식",
    items: [
      "bold",
      "italic",
      "code",
      "strike",
      "highlight",
      "link",
      ["`# `, `## `, `### `", "제목 1·2·3"],
      ["`> `", "인용"],
      ["Backspace (변환 직후)", "변환 되돌리기"],
      ["`[[`, `#`", "문서 · 태그 자동 완성"]
    ]
  },
  {
    title: "목록과 색",
    items: [
      "checklist",
      "numbered",
      "color1",
      "color2",
      "color3",
      "color4",
      "color5",
      "color6",
      "colorNone",
      ["`[] `, `1. `", "타이핑으로 체크리스트 · 번호 목록"]
    ]
  },
  {
    title: "이동과 보기",
    items: [
      ["↑ / ↓", "위·아래 항목으로 이동"],
      "moveUp",
      "moveDown",
      "collapse",
      "collapseAll",
      "expandAll",
      "zoomIn",
      "zoomOut",
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
      ["색 키, 완료 키", "선택 항목에 일괄 적용"],
      ["⌘/Ctrl+C, X", "들여쓰기 텍스트로 복사 / 잘라내기"]
    ]
  },
  {
    title: "찾기와 실행",
    items: ["palette", "commands", "filter", "search", "sidebar", "help"]
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

export function Shortcuts({ keymap, onClose }: { keymap: Keymap; onClose: () => void }) {
  const preset = presetOf(keymap);

  return (
    <Panel className="shortcuts-panel" label="단축키" onClose={onClose}>
      <header className="panel-head">
        <h2>단축키</h2>
        <span className="shortcuts-preset">
          {preset ? `${PRESET_LABELS[preset]} 프리셋` : "직접 바꾼 키"}
        </span>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="shortcuts-grid">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.items
                // An action this preset leaves empty is simply not a shortcut
                // here — listing it as "없음" would only be noise.
                .filter((item) => Array.isArray(item) || keymap[item] !== UNBOUND)
                .map((item) => {
                  const [keys, description] = Array.isArray(item)
                    ? item
                    : [describe(keymap[item]), ACTION_LABELS[item]];
                  return (
                    <div key={Array.isArray(item) ? item[0] : item}>
                      <dt>{keys}</dt>
                      <dd>{description}</dd>
                    </div>
                  );
                })}
            </dl>
          </section>
        ))}
      </div>
      <footer className="panel-foot">
        마크다운 표기: <code>**굵게**</code> <code>*기울임*</code> <code>`코드`</code> <code>~~취소~~</code>{" "}
        <code>==강조==</code> <code>[[문서]]</code> <code>((항목))</code> <code>#태그</code>
      </footer>
    </Panel>
  );
}
