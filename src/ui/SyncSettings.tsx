import { useState } from "react";
import type { Store } from "../core/store";
import type { SyncConfig } from "../core/sync";
import { Panel } from "./Panel";

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
  const config = store.sync.config;
  const [mode, setMode] = useState<"rest" | "github">(config?.kind ?? "rest");
  const [url, setUrl] = useState(config?.kind === "rest" ? config.url : "");
  const [repo, setRepo] = useState(config?.kind === "github" ? config.repo : "");
  const [path, setPath] = useState(config?.kind === "github" ? config.path : "outliner.json");
  const [token, setToken] = useState(config?.token ?? "");

  const built: SyncConfig | null =
    mode === "github"
      ? /^[^\s/]+\/[^\s/]+$/.test(repo.trim()) && token.trim() !== ""
        ? { kind: "github", repo: repo.trim(), path: path.trim() || "outliner.json", token: token.trim() }
        : null
      : url.trim() !== ""
        ? { kind: "rest", url: url.trim(), token: token.trim() }
        : null;

  return (
    <Panel className="sync-panel" label="기기 간 동기화" onClose={onClose}>
      <header className="panel-head">
        <h2>기기 간 동기화</h2>
        <button type="button" className="ghost" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="sync-body">
        <div className="mode-switch" role="radiogroup" aria-label="저장 위치">
          <button
            type="button"
            className={mode === "rest" ? "mode-on" : ""}
            aria-pressed={mode === "rest"}
            onClick={() => setMode("rest")}
          >
            내 서버 / URL
          </button>
          <button
            type="button"
            className={mode === "github" ? "mode-on" : ""}
            aria-pressed={mode === "github"}
            onClick={() => setMode("github")}
          >
            GitHub 저장소
          </button>
        </div>

        {mode === "rest" ? (
          <>
            <p className="sync-note">
              JSON 문서 하나를 <code>GET</code> / <code>PUT</code> 하는 주소면 무엇이든 됩니다. Firebase Realtime
              Database 경로를 그대로 붙여넣어도 되고, 직접 만든 엔드포인트여도 됩니다. 병합은 기기 쪽에서
              일어나므로 서버는 저장만 하면 됩니다.
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
          </>
        ) : (
          <>
            <p className="sync-note">
              지정한 저장소의 파일 하나에 워크스페이스를 커밋합니다 — 커밋 히스토리가 곧 버전 백업입니다.
              토큰은 fine-grained personal access token을 만들어 <strong>이 저장소 하나</strong>에만 Contents
              읽기/쓰기 권한을 주는 것을 권장합니다. 개인 노트라면 비공개 저장소를 쓰세요.
            </p>
            <label className="field">
              <span>저장소</span>
              <input
                className="field-input"
                placeholder="owner/repository"
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
              />
            </label>
            <label className="field">
              <span>파일 경로</span>
              <input
                className="field-input"
                placeholder="outliner.json"
                value={path}
                onChange={(event) => setPath(event.target.value)}
              />
            </label>
            <label className="field">
              <span>토큰 (PAT)</span>
              <input
                className="field-input"
                type="password"
                placeholder="github_pat_…"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
          </>
        )}

        <p className="sync-status-line">
          현재 상태: <strong>{STATUS_LABEL[store.sync.status]}</strong>
        </p>
      </div>

      <footer className="panel-foot sync-actions">
        {config ? (
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
            disabled={built === null}
            onClick={() => {
              store.sync.setConfig(built);
              onClose();
            }}
          >
            저장하고 동기화
          </button>
        </div>
      </footer>
    </Panel>
  );
}
