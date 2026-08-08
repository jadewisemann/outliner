import { Component, type ReactNode } from "react";
import { loadWorkspace } from "../storage/persist";
import { exportBackup } from "../transfer/formats";

/**
 * A render crash in a notes app must never be a dead end. Whatever went wrong,
 * the notes are still in IndexedDB, so the fallback's one job is to get them
 * out to a file the user can keep.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { failed: true, message: error.message };
  }

  async download() {
    const workspace = await loadWorkspace();
    if (!workspace) return;
    const url = URL.createObjectURL(new Blob([exportBackup(workspace)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "outliner-rescue.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <h1>화면을 그리지 못했습니다</h1>
        <p>
          문서는 이 기기에 그대로 남아 있습니다. 아래에서 백업 파일로 내려받은 뒤 새로고침하세요.
        </p>
        <div className="crash-actions">
          <button type="button" className="primary" onClick={() => void this.download()}>
            백업 내려받기
          </button>
          <button type="button" onClick={() => location.reload()}>
            새로고침
          </button>
        </div>
        <code>{this.state.message}</code>
      </div>
    );
  }
}
