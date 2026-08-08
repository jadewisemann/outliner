import { useState } from "react";
import type { Store } from "../core/store";

const STATUS_LABEL: Record<string, string> = {
  off: "동기화 꺼짐",
  idle: "동기화됨",
  syncing: "동기화 중…",
  offline: "오프라인",
  error: "동기화 실패"
};

export function SyncBadge({ store, onClick }: { store: Store; onClick: () => void }) {
  const { status } = store.sync;
  return (
    <button type="button" className={`sync-badge sync-${status}`} title={STATUS_LABEL[status]} onClick={onClick}>
      <span className="sync-dot" />
      {status === "syncing" || status === "error" || status === "offline" ? STATUS_LABEL[status] : null}
    </button>
  );
}

export function SyncSettings({ store, onClose }: { store: Store; onClose: () => void }) {
  const [url, setUrl] = useState(store.sync.config?.url ?? "");
  const [token, setToken] = useState(store.sync.config?.token ?? "");

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel sync-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="panel-head">
          <h2>기기 간 동기화</h2>
          <button type="button" className="ghost" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="sync-body">
          <p className="sync-note">
            JSON 문서 하나를 <code>GET</code> / <code>PUT</code> 하는 주소면 무엇이든 됩니다. Firebase Realtime
            Database 경로를 그대로 붙여넣어도 되고 (<code>https://…firebaseio.com/outliner.json?auth=…</code>),
            직접 만든 엔드포인트여도 됩니다. 병합은 기기 쪽에서 일어나므로 서버는 저장만 하면 됩니다.
          </p>

          <label className="field">
            <span>동기화 주소</span>
            <input
              className="field-input"
              placeholder="https://example.com/my-outline.json"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>

          <label className="field">
            <span>토큰 (선택)</span>
            <input
              className="field-input"
              type="password"
              placeholder="Authorization: Bearer 로 전송"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>

          <p className="sync-status-line">
            현재 상태: <strong>{STATUS_LABEL[store.sync.status]}</strong>
          </p>
        </div>

        <footer className="panel-foot sync-actions">
          {store.sync.config ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                store.sync.setConfig(null);
                onClose();
              }}
            >
              연결 끊기
            </button>
          ) : (
            <span />
          )}
          <div>
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                store.sync.setConfig(url.trim() ? { url: url.trim(), token: token.trim() } : null);
                onClose();
              }}
            >
              저장하고 동기화
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
