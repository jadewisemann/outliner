import { toggleFold } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import {
  deleteItem,
  duplicateItem,
  indentItems,
  moveItemDown,
  moveItemUp,
  outdentItems
} from "./commands";
import {
  createTextBufferEditor,
  zoomIn,
  zoomOut,
  zoomTitle,
  type CompositionEventRecord
} from "./editor";
import { generatedOutline, measureIdleMutations, runBenchmark, type BenchmarkReport } from "./metrics";
import { outlineIndexField } from "./outline";
import { FileSession, type ExternalChange } from "./workspace";
import "./style.css";

const SAMPLE = `---
outliner-id: poc-sample
---

- Text buffer POC
  - [ ] 한글 조합 입력을 확인합니다
  - [x] Markdown 원문이 편집 정본입니다 ^ol-sample
  - 구조 조작
    1. Tab과 Shift+Tab으로 들여씁니다
    2. Alt+Shift+↑/↓로 서브트리를 이동합니다
  - 접기와 확대
- 지원하지 않는 블록도 그대로 남습니다

> 이 인용문은 OutlineIndex 항목이 아니지만 저장할 때 보존됩니다.

\`\`\`ts
const raw = "- 목록처럼 보여도 코드 펜스 안에서는 원문입니다";
\`\`\`
`;

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: { types?: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle[]>;
};

declare global {
  interface Window {
    textBufferPoc: {
      getText: () => string;
      load: (rows: number) => void;
      benchmark: (rows: number) => BenchmarkReport;
      compositionEvents: () => readonly CompositionEventRecord[];
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div>
      <p class="eyebrow">격리 실험 · production 경로와 저장소를 사용하지 않습니다</p>
      <h1>Text buffer outliner POC</h1>
    </div>
    <div class="file-actions">
      <button type="button" data-action="open">Markdown 열기</button>
      <button type="button" data-action="save" class="primary">저장</button>
      <input id="file-input" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden />
    </div>
  </header>

  <main class="workspace">
    <section class="document-panel">
      <nav class="breadcrumb" aria-label="확대 경로">
        <button type="button" data-command="zoom-out">전체 문서</button>
        <span id="zoom-title"></span>
      </nav>
      <div class="editor-toolbar" aria-label="아웃라인 명령">
        <button type="button" data-command="outdent" title="Shift+Tab">내어쓰기</button>
        <button type="button" data-command="indent" title="Tab">들여쓰기</button>
        <button type="button" data-command="move-up" title="Alt+Shift+↑">위로</button>
        <button type="button" data-command="move-down" title="Alt+Shift+↓">아래로</button>
        <button type="button" data-command="fold" title="Mod+.">접기</button>
        <button type="button" data-command="zoom-in" title="Mod+]">확대</button>
        <button type="button" data-command="duplicate" title="Mod+Shift+D">복제</button>
        <button type="button" data-command="delete" title="Mod+Shift+Backspace">삭제</button>
      </div>
      <div id="editor" aria-label="Text buffer 편집기"></div>
      <footer class="statusbar">
        <span id="file-name">POC-Sample.md</span>
        <span id="dirty-state">저장됨</span>
        <span id="document-stats"></span>
      </footer>
    </section>

    <aside class="lab-panel">
      <section>
        <h2>성능 게이트</h2>
        <p>같은 브라우저에서 동기 transaction, DOM 행 수와 1,000행 서브트리 이동을 측정합니다.</p>
        <div class="button-row">
          <button type="button" data-benchmark="2000">2,000행</button>
          <button type="button" data-benchmark="10000">10,000행</button>
          <button type="button" data-action="idle">유휴 6초</button>
        </div>
        <pre id="benchmark-output">아직 측정하지 않았습니다.</pre>
      </section>

      <section>
        <h2>한글 IME 계측</h2>
        <p>조합 중 Enter는 명령으로 소비하지 않습니다. 실제 Android와 삼성 키보드에서는 아래 이벤트 순서와 최종 문자를 확인합니다.</p>
        <div id="composition-summary" class="metric-grid"></div>
        <ol id="composition-log" class="event-log"></ol>
      </section>

      <section>
        <h2>외부 변경 충돌</h2>
        <p>마지막 저장본, 현재 buffer와 외부 파일을 구분합니다. 양쪽이 모두 바뀌면 자동으로 덮어쓰지 않습니다.</p>
        <textarea id="external-text" rows="7" spellcheck="false" aria-label="외부 파일 내용"></textarea>
        <button type="button" data-action="external">외부 변경 적용</button>
        <div id="conflict-output" role="status"></div>
      </section>
    </aside>
  </main>

  <div class="touchbar" aria-label="모바일 구조 조작">
    <button type="button" data-command="outdent">⇤</button>
    <button type="button" data-command="indent">⇥</button>
    <button type="button" data-command="move-up">↑</button>
    <button type="button" data-command="move-down">↓</button>
  </div>
`;

const session = new FileSession();
session.open(SAMPLE);
const compositionEvents: CompositionEventRecord[] = [];
let fileHandle: FileSystemFileHandle | null = null;
let fileName = "POC-Sample.md";
let view: EditorView;

function renderComposition() {
  const counts = new Map<string, number>();
  for (const event of compositionEvents) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  document.querySelector<HTMLDivElement>("#composition-summary")!.innerHTML = [
    ["시작", counts.get("compositionstart") ?? 0],
    ["갱신", counts.get("compositionupdate") ?? 0],
    ["종료", counts.get("compositionend") ?? 0],
    ["입력", counts.get("input") ?? 0]
  ].map(([label, value]) => `<span><strong>${value}</strong>${label}</span>`).join("");
  document.querySelector<HTMLOListElement>("#composition-log")!.innerHTML = compositionEvents
    .slice(-8)
    .reverse()
    .map((event) => `<li><code>${event.type}</code><span>${event.data ?? event.inputType ?? "-"}</span><small>${event.composing ? "조합 중" : "조합 밖"}</small></li>`)
    .join("");
}

function renderStatus() {
  const index = view.state.field(outlineIndexField);
  document.querySelector("#file-name")!.textContent = fileName;
  document.querySelector("#dirty-state")!.textContent = session.dirty ? "저장하지 않음" : "저장됨";
  document.querySelector("#dirty-state")!.classList.toggle("dirty", session.dirty);
  document.querySelector("#document-stats")!.textContent = `${index.items.length.toLocaleString()}개 항목 · ${view.state.doc.length.toLocaleString()}자 · index ${index.parseMs.toFixed(2)}ms`;
  const title = zoomTitle(view);
  document.querySelector("#zoom-title")!.textContent = title ? `/ ${title}` : "";
}

view = createTextBufferEditor({
  parent: document.querySelector<HTMLDivElement>("#editor")!,
  doc: SAMPLE,
  onComposition: (event) => {
    compositionEvents.push(event);
    if (compositionEvents.length > 120) compositionEvents.shift();
    renderComposition();
  },
  onUpdate: (update) => {
    if (update.docChanged) session.changed();
    renderStatus();
  }
});

const commands: Record<string, (target: EditorView) => boolean> = {
  outdent: outdentItems,
  indent: indentItems,
  "move-up": moveItemUp,
  "move-down": moveItemDown,
  fold: toggleFold,
  "zoom-in": zoomIn,
  "zoom-out": zoomOut,
  duplicate: duplicateItem,
  delete: deleteItem
};

document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    commands[button.dataset.command!]?.(view);
    view.focus();
    renderStatus();
  });
});

function setDocument(text: string, name = fileName) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  fileName = name;
  session.open(text);
  document.querySelector<HTMLTextAreaElement>("#external-text")!.value = text;
  renderStatus();
}

async function openHandle(handle: FileSystemFileHandle) {
  const file = await handle.getFile();
  setDocument(await file.text(), file.name);
  fileHandle = handle;
}

document.querySelector<HTMLButtonElement>("[data-action='open']")!.addEventListener("click", async () => {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) {
    document.querySelector<HTMLInputElement>("#file-input")!.click();
    return;
  }
  try {
    const [handle] = await picker({ types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }] });
    if (handle) await openHandle(handle);
  } catch (error) {
    if ((error as DOMException).name !== "AbortError") throw error;
  }
});

document.querySelector<HTMLInputElement>("#file-input")!.addEventListener("change", async (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  fileHandle = null;
  setDocument(await file.text(), file.name);
});

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.querySelector<HTMLButtonElement>("[data-action='save']")!.addEventListener("click", async () => {
  if (!fileHandle) {
    const snapshot = session.beginSave(view.state.doc.toString());
    download(fileName, snapshot.text);
    session.completeSave(snapshot);
    renderStatus();
    return;
  }

  let settled = false;
  while (!settled) {
    const snapshot = session.beginSave(view.state.doc.toString());
    const writable = await fileHandle.createWritable();
    await writable.write(snapshot.text);
    await writable.close();
    settled = session.completeSave(snapshot);
  }
  renderStatus();
});

function renderConflict(change: ExternalChange) {
  const output = document.querySelector<HTMLDivElement>("#conflict-output")!;
  if (change.kind === "replace") {
    setDocument(change.text);
    output.textContent = "로컬 buffer가 깨끗해서 외부 내용을 transaction으로 반영했습니다.";
    return;
  }
  if (change.kind === "keep-local") {
    output.textContent = "외부 파일이 마지막 저장본과 같아서 로컬 편집을 유지했습니다.";
    return;
  }
  output.innerHTML = `<strong>충돌을 감지했습니다.</strong><p>현재 buffer를 덮어쓰지 않았습니다.</p>`;
  const local = document.createElement("button");
  local.textContent = "로컬 충돌 사본 저장";
  local.addEventListener("click", () => download(fileName.replace(/\.md$/i, "") + ".local-conflict.md", change.local));
  const remote = document.createElement("button");
  remote.textContent = "외부 충돌 사본 저장";
  remote.addEventListener("click", () => download(fileName.replace(/\.md$/i, "") + ".remote-conflict.md", change.remote));
  output.append(local, remote);
}

document.querySelector<HTMLButtonElement>("[data-action='external']")!.addEventListener("click", () => {
  const remote = document.querySelector<HTMLTextAreaElement>("#external-text")!.value;
  renderConflict(session.external(view.state.doc.toString(), remote));
});

document.querySelectorAll<HTMLButtonElement>("[data-benchmark]").forEach((button) => {
  button.addEventListener("click", () => {
    const rows = Number(button.dataset.benchmark);
    const report = runBenchmark(view, rows, rows === 10000);
    session.open(view.state.doc.toString());
    fileName = `benchmark-${rows}.md`;
    document.querySelector("#benchmark-output")!.textContent = JSON.stringify(report, null, 2);
    renderStatus();
  });
});

document.querySelector<HTMLButtonElement>("[data-action='idle']")!.addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  button.textContent = "측정 중…";
  const mutations = await measureIdleMutations(view);
  document.querySelector("#benchmark-output")!.textContent = JSON.stringify({ idleMilliseconds: 6000, mutations }, null, 2);
  button.disabled = false;
  button.textContent = "유휴 6초";
});

document.querySelector<HTMLTextAreaElement>("#external-text")!.value = SAMPLE;
renderComposition();
renderStatus();

window.textBufferPoc = {
  getText: () => view.state.doc.toString(),
  load: (rows) => setDocument(generatedOutline(rows), `benchmark-${rows}.md`),
  benchmark: (rows) => runBenchmark(view, rows, rows === 10000),
  compositionEvents: () => compositionEvents
};
