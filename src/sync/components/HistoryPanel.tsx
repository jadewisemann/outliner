import { useEffect, useState } from "react";
import { visibleRows } from "../../outline/tree";
import { Panel } from "../../shared/components/Panel";
import type { Store } from "../../store";
import type { Revision } from "../api/remote";
import type { Doc } from "../../types";

/**
 * The document's past, read out of the repository.
 *
 * Nothing here writes history — every push has been a commit since the GitHub
 * backend existed, so the archive was already there and simply had no way in
 * from the app. This is that way in.
 */
export function HistoryPanel({ store, onClose }: { store: Store; onClose: () => void }) {
  const history = store.sync.history;
  const doc = store.doc;
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [chosen, setChosen] = useState<Revision | null>(null);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!history) return;
    let cancelled = false;
    void history
      .list(doc.id)
      .then((found) => !cancelled && setRevisions(found))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [history, doc.id]);

  useEffect(() => {
    if (!history || !chosen) return;
    let cancelled = false;
    setPreview(null);
    void history
      .read(doc.id, chosen.id)
      .then((found) => !cancelled && setPreview(found))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [history, chosen, doc.id]);

  return (
    <Panel className="history-panel" label="문서 히스토리" onClose={onClose}>
      <header className="panel-head">
        <h2>«{doc.title}» 히스토리</h2>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="history-body">
        <div className="history-list">
          {!history ? (
            <p className="search-empty">
              히스토리는 GitHub 저장소를 백엔드로 쓸 때만 있습니다. 푸시가 곧 커밋이기 때문입니다.
            </p>
          ) : failed ? (
            <p className="search-empty">저장소를 읽지 못했습니다.</p>
          ) : revisions === null ? (
            <p className="search-empty">읽는 중…</p>
          ) : revisions.length === 0 ? (
            <p className="search-empty">아직 커밋이 없습니다.</p>
          ) : (
            revisions.map((revision) => (
              <button
                key={revision.id}
                type="button"
                className={`history-hit${chosen?.id === revision.id ? " history-hit-active" : ""}`}
                onClick={() => setChosen(revision)}
              >
                <span className="history-when">{revision.at.slice(0, 16).replace("T", " ")}</span>
                <span className="history-what">{revision.message.split("\n")[0]}</span>
              </button>
            ))
          )}
        </div>

        <div className="history-preview">
          {chosen === null ? (
            <p className="search-empty">왼쪽에서 시점을 고르세요.</p>
          ) : preview === null ? (
            <p className="search-empty">불러오는 중…</p>
          ) : (
            <>
              <ol>
                {visibleRows(preview, preview.rootId).map((row) => (
                  <li key={row.id} style={{ paddingLeft: row.depth * 14 }}>
                    {row.node.text || "(빈 항목)"}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="history-restore"
                onClick={() => {
                  if (!confirm("이 시점의 내용으로 되돌릴까요? 지금 내용은 대체됩니다.")) return;
                  store.docs.restoreVersion(preview);
                  onClose();
                }}
              >
                이 시점으로 되돌리기
              </button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
