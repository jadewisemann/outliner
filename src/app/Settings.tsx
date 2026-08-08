import { Panel } from "../shared/components/Panel";
import { DEFAULT_APPEARANCE, type Appearance } from "./appearance";

const FAMILIES: [Appearance["family"], string][] = [
  ["sans", "산세리프"],
  ["serif", "세리프"],
  ["mono", "고정폭"]
];

/** Reading settings. Everything here is this device's, and applies instantly. */
export function Settings({
  appearance,
  onChange,
  onClose
}: {
  appearance: Appearance;
  onChange: (next: Appearance) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => onChange({ ...appearance, [key]: value });

  return (
    <Panel className="settings-panel" label="표시 설정" onClose={onClose}>
      <header className="panel-head">
        <h2>표시 설정</h2>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="settings-body">
        <label>
          <span>글꼴</span>
          <div className="settings-choices">
            {FAMILIES.map(([family, name]) => (
              <button
                key={family}
                type="button"
                className={appearance.family === family ? "settings-choice settings-choice-on" : "settings-choice"}
                onClick={() => set("family", family)}
              >
                {name}
              </button>
            ))}
          </div>
        </label>

        <label>
          <span>글자 크기</span>
          <input
            type="range"
            min={12}
            max={24}
            step={1}
            value={appearance.size}
            onChange={(event) => set("size", Number(event.target.value))}
          />
          <em>{appearance.size}px</em>
        </label>

        <label>
          <span>줄 간격</span>
          <input
            type="range"
            min={1.2}
            max={2.2}
            step={0.05}
            value={appearance.lineHeight}
            onChange={(event) => set("lineHeight", Number(event.target.value))}
          />
          <em>{appearance.lineHeight.toFixed(2)}</em>
        </label>

        <label>
          <span>본문 너비</span>
          <input
            type="range"
            min={520}
            max={1400}
            step={20}
            value={appearance.width}
            onChange={(event) => set("width", Number(event.target.value))}
          />
          <em>{appearance.width}px</em>
        </label>
      </div>

      <footer className="panel-foot">
        이 기기에만 적용됩니다.
        <button type="button" className="search-save" onClick={() => onChange(DEFAULT_APPEARANCE)}>
          기본값으로
        </button>
      </footer>
    </Panel>
  );
}
