import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { moveItemDown } from "./commands";
import { outlineIndexField } from "./outline";

export type Distribution = {
  median: number;
  p95: number;
  max: number;
};

export type BenchmarkReport = {
  rows: number;
  replaceMs: number;
  parseMs: number;
  inputMs: Distribution;
  domLines: number;
  subtreeMoveMs: number | null;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  return { median: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0) };
}

export function generatedOutline(rows: number): string {
  const lines = ["---", "outliner-id: poc-benchmark", "---", ""];
  for (let index = 0; index < rows; index += 1) {
    const depth = index % 41 === 0 ? 0 : index % 7 === 0 ? 2 : 1;
    const indent = "  ".repeat(depth);
    const marker = index % 11 === 0 ? "- [ ]" : index % 13 === 0 ? `${(index % 9) + 1}.` : "-";
    lines.push(`${indent}${marker} 성능 측정 항목 ${index + 1}`);
  }
  return lines.join("\n");
}

export function replaceDocument(view: EditorView, text: string): number {
  const started = performance.now();
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: EditorSelection.cursor(0)
  });
  return round(performance.now() - started);
}

export function measureInput(view: EditorView, repetitions = 40): Distribution {
  const index = view.state.field(outlineIndexField);
  const item = index.items[Math.floor(index.items.length / 2)];
  if (!item) return distribution([0]);
  let position = item.contentTo;
  view.dispatch({ selection: EditorSelection.cursor(position), scrollIntoView: true });

  const samples: number[] = [];
  for (let count = 0; count < repetitions; count += 1) {
    const started = performance.now();
    view.dispatch({ changes: { from: position, insert: "x" }, selection: EditorSelection.cursor(position + 1) });
    samples.push(performance.now() - started);
    view.dispatch({ changes: { from: position, to: position + 1 }, selection: EditorSelection.cursor(position) });
  }
  return distribution(samples);
}

export function measureSubtreeMove(view: EditorView): number {
  const previous = view.state.doc.toString();
  const sample = ["- 이동할 루트", ...Array.from({ length: 1000 }, (_, index) => `  - 자식 ${index + 1}`), "- 다음 루트"].join("\n");
  replaceDocument(view, sample);
  const first = view.state.field(outlineIndexField).items[0];
  view.dispatch({ selection: EditorSelection.cursor(first.contentFrom) });
  const started = performance.now();
  moveItemDown(view);
  const elapsed = round(performance.now() - started);
  replaceDocument(view, previous);
  return elapsed;
}

export function runBenchmark(view: EditorView, rows: number, includeMove = false): BenchmarkReport {
  const replaceMs = replaceDocument(view, generatedOutline(rows));
  const parseMs = round(view.state.field(outlineIndexField).parseMs);
  const inputMs = measureInput(view);
  const domLines = view.contentDOM.querySelectorAll(".cm-line").length;
  const subtreeMoveMs = includeMove ? measureSubtreeMove(view) : null;
  return { rows, replaceMs, parseMs, inputMs, domLines, subtreeMoveMs };
}

export function measureIdleMutations(view: EditorView, milliseconds = 6000): Promise<number> {
  return new Promise((resolve) => {
    let mutations = 0;
    const observer = new MutationObserver((records) => {
      mutations += records.length;
    });
    observer.observe(view.dom, { attributes: true, childList: true, characterData: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(mutations);
    }, milliseconds);
  });
}
