import type { Store } from "../../store";
import { Panel } from "../../shared/components/Panel";
import { DEFAULT_FOLDER, type SyncStatus } from "../api/remote";
import { beginGithubLogin } from "../api/githubAuth";
import type { OauthPrefill } from "../syncForm";
import { useSyncForm } from "../useSyncForm";

const STATUS_LABEL: Record<SyncStatus, string> = {
  off: "동기화 꺼짐",
  idle: "동기화됨",
  syncing: "동기화 중…",
  offline: "오프라인",
  error: "동기화 실패",
  locked: "암호가 맞지 않음"
};

export function SyncBadge({ store, onClick }: { store: Store; onClick: () => void }) {
  const { status } = store.sync;
  return (
    <button type="button" className={`sync-badge sync-${status}`} title={STATUS_LABEL[status]} onClick={onClick}>
      <span className="sync-dot" />
      {status === "idle" || status === "off" ? null : STATUS_LABEL[status]}
    </button>
  );
}

export function SyncSettings({ store, oauth, onClose }: { store: Store; oauth?: OauthPrefill; onClose: () => void }) {
  const config = store.sync.config;
  const {
    form,
    setField,
    folders,
    clientId,
    folderNote,
    repoNote,
    canSave,
    canCreateRepo,
    pickFolder,
    createRepo,
    save
  } = useSyncForm(store.sync, oauth);
  const { mode, url, repo, path, token, dir, passphrase, markdown } = form;

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
            onClick={() => setField("mode", "rest")}
          >
            내 서버 / URL
          </button>
          <button
            type="button"
            className={mode === "github" ? "mode-on" : ""}
            aria-pressed={mode === "github"}
            onClick={() => setField("mode", "github")}
          >
            GitHub 저장소
          </button>
          {folders ? (
            <button
              type="button"
              className={mode === "file" ? "mode-on" : ""}
              aria-pressed={mode === "file"}
              onClick={() => setField("mode", "file")}
            >
              이 컴퓨터의 폴더
            </button>
          ) : null}
        </div>

        {mode === "file" ? (
          <>
            <p className="sync-note">
              고른 폴더에 <code>outliner.json</code> 파일 하나를 두고, 그 파일을 정본으로 읽고 씁니다. iCloud
              Drive·Dropbox·Google Drive·OneDrive·Syncthing이 이미 동기화하는 폴더를 고르면 그 서비스가 파일을
              다른 컴퓨터로 옮겨 주고, 병합은 이 앱이 합니다. 서비스가 충돌 사본(<code>outliner (1).json</code> 같은
              파일)을 만들면 그 내용까지 합친 뒤, 사본을 지우지 않고 <code>.outliner-merged/</code> 폴더로 옮깁니다.
              그래서 <strong>이 앱 전용 폴더</strong>를 고르세요. 폴더를 공유하지 않으면 이 컴퓨터 안의 백업
              사본으로 쓰입니다. 폰에서는 이 방식을 쓸 수 없으므로, 폰과 함께 쓰려면 GitHub 저장소나 서버를
              고르세요.
            </p>
            <label className="field">
              <span>폴더</span>
              <input
                className="field-input"
                placeholder="/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Outliner"
                value={dir}
                onChange={(event) => setField("dir", event.target.value)}
              />
            </label>
            <button type="button" className="ghost repo-create" onClick={pickFolder}>
              폴더 고르기…
            </button>
            {folderNote ? <p className="sync-note">{folderNote}</p> : null}
          </>
        ) : mode === "rest" ? (
          <>
            <p className="sync-note">
              JSON 문서 하나를 <code>GET</code> / <code>PUT</code> 하는 주소면 무엇이든 됩니다. 무료로 띄울 수 있는
              Cloudflare Worker(<code>server/cloudflare/</code>)나 직접 띄우는 레퍼런스 서버의 주소를 넣어도 되고,
              Firebase Realtime Database 경로를 그대로 붙여넣어도 됩니다. 병합은 기기 쪽에서
              일어나므로 서버는 저장만 하면 됩니다. 문서 히스토리와 이미지 첨부는 GitHub 저장소 백엔드만의
              기능입니다 — 동기화와 병합은 어느 쪽이든 같습니다.
            </p>
            <label className="field">
              <span>동기화 주소</span>
              <input
                className="field-input"
                placeholder="https://example.com/my-outline.json"
                value={url}
                onChange={(event) => setField("url", event.target.value)}
              />
            </label>
            <label className="field">
              <span>토큰 (선택)</span>
              <input
                className="field-input"
                type="password"
                placeholder="Authorization: Bearer 로 전송"
                value={token}
                onChange={(event) => setField("token", event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <p className="sync-note">
              지정한 저장소의 폴더에 문서 하나당 파일 하나로 커밋합니다 — 고친 문서만 커밋되고, 커밋
              히스토리가 곧 버전 백업입니다. 개인 노트라면 비공개 저장소를 쓰세요.
            </p>

            {clientId && !token ? (
              <button type="button" className="github-login" onClick={() => beginGithubLogin(clientId)}>
                GitHub으로 로그인
              </button>
            ) : null}

            <label className="field">
              <span>저장소</span>
              <input
                className="field-input"
                placeholder="owner/repository"
                value={repo}
                onChange={(event) => setField("repo", event.target.value)}
              />
            </label>
            <label className="field">
              <span>폴더 경로</span>
              <input
                className="field-input"
                placeholder={DEFAULT_FOLDER}
                value={path}
                onChange={(event) => setField("path", event.target.value)}
              />
            </label>
            <label className="field">
              <span>토큰 {oauth ? "(로그인으로 채워짐)" : "(PAT)"}</span>
              <input
                className="field-input"
                type="password"
                placeholder="github_pat_…"
                value={token}
                onChange={(event) => setField("token", event.target.value)}
              />
            </label>

            {canCreateRepo ? (
              <button type="button" className="ghost repo-create" onClick={createRepo}>
                이 이름으로 비공개 저장소 만들기
              </button>
            ) : null}
            {repoNote ? <p className="sync-note">{repoNote}</p> : null}

            <p className="sync-note">
              로그인은 계정의 저장소 전체에 대한 권한(<code>repo</code> scope)을 받습니다 — GitHub OAuth의
              한계입니다. 권한을 노트 저장소 하나로 좁히고 싶으면 fine-grained PAT를 만들어 붙여넣으세요.
            </p>

            <label className="field field-check">
              <input
                type="checkbox"
                checked={markdown && passphrase === ""}
                disabled={passphrase !== ""}
                onChange={(event) => setField("markdown", event.target.checked)}
              />
              <span>읽을 수 있는 Markdown 사본도 함께 두기</span>
            </label>
            <p className="sync-note">
              문서마다 <code>markdown/제목.md</code>를 함께 커밋합니다. 앱이 다시 읽지 않는 <strong>파생
              사본</strong>이라, 앱 없이도 저장소만으로 노트를 읽을 수 있는 것이 목적입니다. 이 파일을 직접
              고쳐도 노트에 반영되지 않고 다음 저장에 덮어써집니다. 끄면 이미 만들어진 사본을 지웁니다.
              {passphrase !== "" ? (
                <>
                  {" "}
                  <strong>암호를 걸면 켤 수 없습니다</strong> — 암호문 옆에 평문 사본을 두면 암호를 건 의미가
                  사라집니다.
                </>
              ) : null}
            </p>
          </>
        )}

        <label className="field">
          <span>암호 (선택)</span>
          <input
            className="field-input"
            type="password"
            placeholder="비우면 평문으로 저장됩니다"
            value={passphrase}
            onChange={(event) => setField("passphrase", event.target.value)}
          />
        </label>
        <p className="sync-note">
          암호를 넣으면 기기를 떠나기 전에 내용이 암호화됩니다 — 저장소를 가진 쪽은 크기와 시각만 볼 수
          있습니다. 병합이 기기에서 일어나기 때문에 가능한 일입니다. 모든 기기에 <strong>같은 암호</strong>를
          넣어야 하고, <strong>잃어버리면 복구할 방법이 없습니다</strong>. 암호를 걸면 커밋 diff는 더 이상
          읽을 수 없게 됩니다.
        </p>

        <p className="sync-status-line">
          현재 상태: <strong>{STATUS_LABEL[store.sync.status]}</strong>
        </p>
        <StorageGradeLine store={store} />
        {store.sync.status === "locked" ? (
          <p className="sync-note">
            원격에 이 기기가 읽을 수 없는 내용이 있습니다. 암호가 맞을 때까지 아무것도 올리지 않습니다 —
            읽지 못한 것을 없는 것으로 보고 덮어쓰면 노트가 사라지기 때문입니다.
          </p>
        ) : null}
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
          <button type="button" className="primary" disabled={!canSave} onClick={() => save(onClose)}>
            저장하고 동기화
          </button>
        </div>
      </footer>
    </Panel>
  );
}

/** `storage/persist`'s `StorageGrade`, reached through the store like everything else outside `sync/`. */
type StorageGrade = Store["storage"]["grade"];

const GRADE_LABEL: Record<StorageGrade, string> = {
  persisted: "저장 보장됨",
  file: "앱 파일에도 보관됨",
  "best-effort": "보장되지 않음",
  unknown: "알 수 없음"
};

/**
 * The local storage grade, next to the remote's status, because the two answer
 * one question together: how many copies of these notes exist and who can
 * delete them. A grade below `persisted` is not decoration — it means the
 * browser may clear the workspace on its own, so it is stated rather than
 * hidden, along with the way to ask again.
 */
function StorageGradeLine({ store }: { store: Store }) {
  const { grade, request } = store.storage;
  return (
    <p className="sync-status-line">
      이 기기의 저장: <strong>{GRADE_LABEL[grade]}</strong>
      {grade === "persisted" || grade === "file" ? null : (
        <button type="button" className="search-save" onClick={request}>
          저장 보장 요청
        </button>
      )}
    </p>
  );
}
