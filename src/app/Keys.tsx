import { useState } from "react";
import { Panel } from "../shared/components/Panel";
import { ACTION_LABELS, DEFAULT_KEYMAP, conflicts, describe, specOf, type Action, type Keymap } from "../shared/keymap";

const GROUPS: [string, Action[]][] = [
  ["찾기와 실행", ["palette", "commands", "search", "filter", "sidebar", "help", "undo", "redo"]],
  ["서식", ["bold", "italic", "code", "strike", "highlight", "link"]],
  ["항목", ["duplicate", "delete", "indent", "outdent", "moveUp", "moveDown", "collapse", "zoomIn", "zoomOut", "done"]]
];

/**
 * Rebinding.
 *
 * Only shortcuts appear here. Enter, Backspace and the arrows are what the
 * editor *is* rather than a preference, and a rebindable Enter would make the
 * outline impossible to describe to anyone.
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

  return (
    <Panel className="keys-panel" label="단축키 바꾸기" onClose={onClose}>
      <header className="panel-head">
        <h2>단축키 바꾸기</h2>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="keys-body">
        {GROUPS.map(([title, actions]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {actions.map((action) => {
                const clash = conflicts(keymap, action, keymap[action]);
                return (
                  <div key={action}>
                    <dt>{ACTION_LABELS[action]}</dt>
                    <dd>
                      <button
                        type="button"
                        className={`keys-bind${recording === action ? " keys-bind-recording" : ""}${
                          clash.length > 0 ? " keys-bind-clash" : ""
                        }`}
                        title={clash.length > 0 ? `${clash.map((other) => ACTION_LABELS[other]).join(", ")} 와 겹칩니다` : ""}
                        onClick={() => setRecording(action)}
                        onKeyDown={(event) => {
                          if (recording !== action) return;
                          event.preventDefault();
                          if (event.key === "Escape") {
                            setRecording(null);
                            return;
                          }
                          const spec = specOf(event);
                          if (!spec) return;
                          onChange({ ...keymap, [action]: spec });
                          setRecording(null);
                        }}
                      >
                        {recording === action ? "키를 누르세요…" : describe(keymap[action])}
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
        이 기기에만 적용됩니다. Enter·Backspace·화살표는 편집 그 자체라 바꾸지 않습니다.
        <button type="button" className="search-save" onClick={() => onChange({ ...DEFAULT_KEYMAP })}>
          기본값으로
        </button>
      </footer>
    </Panel>
  );
}
