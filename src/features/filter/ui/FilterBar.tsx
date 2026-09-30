import type { RefObject } from "react";
import { withChord, type Keymap } from "@/entities/keymap";
import type { Store } from "@/entities/workspace";

/**
 * Narrows the open document in place: the rows that stay are still the rows,
 * editable where they stand. Always mounted, so the filter key has something to
 * focus; it takes no room until it is used (panels.css `.filter-bar`).
 */
export function FilterBar({ store, keymap, inputRef }: { store: Store; keymap: Keymap; inputRef: RefObject<HTMLInputElement> }) {
  const { view } = store;
  return (
    <div className={`filter-bar${view.filter !== "" ? " filter-bar-on" : ""}`}>
      <input
        ref={inputRef}
        className="filter-input"
        placeholder={`${withChord("이 문서 안에서 거르기", keymap.filter)} — is:incomplete, date:today, #태그, -제외`}
        value={view.filter}
        onChange={(event) => store.setView({ filter: event.target.value })}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          store.setView({ filter: "" });
          event.currentTarget.blur();
        }}
      />
      {view.filter !== "" ? (
        <>
          <span className="filter-count">{store.rows.length}행</span>
          <button type="button" className="ghost" onClick={() => store.setView({ filter: "" })}>
            ×
          </button>
        </>
      ) : null}
      {view.hideCompleted ? (
        <button type="button" className="filter-flag" onClick={() => store.setView({ hideCompleted: false })}>
          완료 숨김 ×
        </button>
      ) : null}
    </div>
  );
}
