import { useState } from "react";
import { Panel } from "../shared/components/Panel";
import {
  ACTION_LABELS,
  PRESETS,
  PRESET_LABELS,
  UNBOUND,
  conflicts,
  describe,
  presetOf,
  specOf,
  type Action,
  type Keymap,
  type PresetName
} from "../shared/keymap";

const GROUPS: [string, Action[]][] = [
  ["찾기와 실행", ["palette", "commands", "search", "filter", "sidebar", "help", "undo", "redo"]],
  ["서식", ["bold", "italic", "code", "strike", "highlight", "link"]],
  ["항목", ["duplicate", "delete", "indent", "outdent", "moveUp", "moveDown", "done"]],
  ["보기", ["collapse", "collapseAll", "expandAll", "zoomIn", "zoomOut"]],
  [
    "목록과 색",
    ["checklist", "numbered", "color1", "color2", "color3", "color4", "color5", "color6", "colorNone"]
  ]
];

const PRESET_NOTES: Record<PresetName, string> = {
  editor: "마크다운·코드 에디터의 관례 — ⌘K는 링크, ⌘]는 들여쓰기",
  dynalist: "Dynalist에서 손에 익은 키 — ⌘]는 확대, ⌘⇧1~6은 색 라벨"
};

/**
 * Rebinding, and the two presets it starts from.
 *
 * Only shortcuts appear here. Enter, Backspace, Tab and the arrows are what the
 * editor *is* rather than a preference, and a rebindable Enter would make the
 * outline impossible to describe to anyone — which is also why switching to the
 * Dynalist preset never costs a hand Tab and Shift+Tab.
 */
export function Keys({
  keymap,
  onChange,
  onClose
}: {
  keymap: Keymap;
  onChange: (next: Keymap) => void;
  onClose: () => void;
}) {
  const [recording, setRecording] = useState<Action | null>(null);
  const active = presetOf(keymap);

  return (
    <Panel className="keys-panel" label="단축키 바꾸기" onClose={onClose}>
      <header className="panel-head">
        <h2>단축키 바꾸기</h2>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="keys-presets">
        {(Object.keys(PRESETS) as PresetName[]).map((name) => (
          <button
            key={name}
            type="button"
            className={`keys-preset${active === name ? " keys-preset-active" : ""}`}
            aria-pressed={active === name}
            title={PRESET_NOTES[name]}
            onClick={() => onChange({ ...PRESETS[name] })}
          >
            {PRESET_LABELS[name]}
          </button>
        ))}
        <p className="keys-preset-note">{active ? PRESET_NOTES[active] : "직접 바꾼 키가 있습니다"}</p>
      </div>

      <div className="keys-body">
        {GROUPS.map(([title, actions]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {actions.map((action) => {
                const clash = conflicts(keymap, action, keymap[action]);
                const unbound = keymap[action] === UNBOUND;
                return (
                  <div key={action}>
                    <dt>{ACTION_LABELS[action]}</dt>
                    <dd>
                      <button
                        type="button"
                        className={`keys-bind${recording === action ? " keys-bind-recording" : ""}${
                          clash.length > 0 ? " keys-bind-clash" : ""
                        }${unbound ? " keys-bind-unbound" : ""}`}
                        title={
                          clash.length > 0
                            ? `${clash.map((other) => ACTION_LABELS[other]).join(", ")} 와 겹칩니다`
                            : unbound
                              ? "이 프리셋에서는 비어 있습니다"
                              : ""
                        }
                        onClick={() => setRecording(action)}
                        onKeyDown={(event) => {
                          if (recording !== action) return;
                          event.preventDefault();
                          if (event.key === "Escape") {
                            setRecording(null);
                            return;
                          }
                          // Bare Backspace clears the binding. A preset needs
                          // empty slots — Dynalist spends ⌘]/⌘[ on zoom — so a
                          // hand editing one needs to make them too.
                          if (
                            (event.key === "Backspace" || event.key === "Delete") &&
                            !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                          ) {
                            onChange({ ...keymap, [action]: UNBOUND });
                            setRecording(null);
                            return;
                          }
                          const spec = specOf(event);
                          if (!spec) return;
                          onChange({ ...keymap, [action]: spec });
                          setRecording(null);
                        }}
                      >
                        {recording === action ? "키를 누르세요…" : unbound ? "없음" : describe(keymap[action])}
                      </button>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>

      <footer className="panel-foot">
        이 기기에만 적용됩니다. Enter·Backspace·Tab·화살표는 편집 그 자체라 바꾸지 않습니다 — 프리셋을
        바꿔도 들여쓰기는 Tab 그대로입니다. 녹화 중 Backspace는 키를 비웁니다.
      </footer>
    </Panel>
  );
}
