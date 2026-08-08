import { patchNode, setCollapsedDeep } from "../outline/tree";
import type { Store } from "../store";
import type { Color, Id, Node } from "../types";
import type { Command } from "./palette";

/**
 * Everything the app can do, as a flat list the palette can search.
 *
 * The point is coverage rather than convenience: anything reachable only from
 * a menu is unreachable from the keyboard, and one such gap is enough to send
 * a hand back to the trackpad.
 */
export type AppActions = {
  /** Reopens the palette on a given prefix, for commands that need a target. */
  openPalette(query: string): void;
  exportAs(format: "markdown" | "opml" | "text" | "backup"): void;
  importFile(): void;
  toggleTheme(): void;
  toggleSidebar(): void;
  openSync(): void;
  openHistory(): void;
  openSettings(): void;
  openShortcuts(): void;
};

const COLORS: [Color, string][] = [
  [1, "빨강"],
  [2, "노랑"],
  [3, "초록"],
  [4, "파랑"],
  [5, "보라"],
  [6, "회색"]
];

export function buildCommands(store: Store, actions: AppActions): Command[] {
  const { doc, view } = store;
  const focusId = view.focusId && doc.nodes[view.focusId] ? view.focusId : null;
  const focused = focusId ? doc.nodes[focusId] : null;
  const parentId = focused?.parent ?? null;
  const parent = parentId ? doc.nodes[parentId] : null;

  /** Edits the focused row; absent a focused row the command is not offered. */
  const onRow = (label: string, id: string, patch: Partial<Node>, hint?: string): Command[] =>
    focusId ? [{ id, label, hint, run: () => store.edit((current) => patchNode(current, focusId, patch)) }] : [];

  /** Edits the list the focused row belongs to. */
  const onList = (label: string, id: string, patch: Partial<Node>): Command[] =>
    parentId ? [{ id, label, run: () => store.edit((current) => patchNode(current, parentId, patch)) }] : [];

  return [
    /* structure */
    { id: "doc.new", label: "새 문서", run: () => store.docs.create() },
    { id: "doc.folder", label: "새 폴더", run: () => store.docs.createFolder() },
    {
      id: "doc.bookmark",
      label: doc.bookmarked ? "이 문서 즐겨찾기 해제" : "이 문서 즐겨찾기",
      hint: doc.title,
      run: () => store.docs.toggleBookmark(doc.id)
    },

    /* the focused row */
    ...onRow("제목 1", "row.h1", { heading: 1 }),
    ...onRow("제목 2", "row.h2", { heading: 2 }),
    ...onRow("제목 3", "row.h3", { heading: 3 }),
    ...onRow("본문으로", "row.h0", { heading: 0 }),
    ...COLORS.flatMap(([color, name]) => onRow(`색 — ${name}`, `row.color${color}`, { color })),
    ...onRow("색 지우기", "row.color0", { color: 0 }),
    ...(focused ? onRow(focused.done ? "완료 해제" : "완료 표시", "row.done", { done: !focused.done }) : []),
    ...(focused
      ? onRow(focused.bookmarked ? "항목 즐겨찾기 해제" : "항목 즐겨찾기", "row.bookmark", {
          bookmarked: !focused.bookmarked
        })
      : []),

    ...(focusId
      ? [
          {
            id: "row.move",
            label: "다른 문서로 이동…",
            hint: ">>",
            run: () => actions.openPalette(">>")
          }
        ]
      : []),

    /* the list the row is in */
    ...(parent ? onList(parent.checklist ? "체크리스트 끄기" : "체크리스트로", "list.checklist", {
      checklist: !parent.checklist
    }) : []),
    ...(parent ? onList(parent.numbered ? "번호 목록 끄기" : "번호 목록으로", "list.numbered", {
      numbered: !parent.numbered
    }) : []),

    /* the view */
    {
      id: "view.fold",
      label: "모두 접기",
      run: () => store.edit((current) => setCollapsedDeep(current, view.zoomId, true), { transient: true })
    },
    {
      id: "view.unfold",
      label: "모두 펼치기",
      run: () => store.edit((current) => setCollapsedDeep(current, view.zoomId, false), { transient: true })
    },
    {
      id: "view.completed",
      label: view.hideCompleted ? "완료 항목 보이기" : "완료 항목 숨기기",
      run: () => store.setView({ hideCompleted: !view.hideCompleted })
    },
    {
      id: "view.notes",
      label: view.hideNotes ? "메모 보이기" : "메모 숨기기",
      run: () => store.setView({ hideNotes: !view.hideNotes })
    },
    { id: "view.sidebar", label: "사이드바 열고 닫기", hint: "⌘\\", run: actions.toggleSidebar },
    { id: "view.theme", label: "테마 전환", run: actions.toggleTheme },
    { id: "view.settings", label: "표시 설정 — 글꼴·간격·너비", run: actions.openSettings },

    /* files and settings */
    { id: "file.md", label: "Markdown 내보내기", run: () => actions.exportAs("markdown") },
    { id: "file.opml", label: "OPML 내보내기", run: () => actions.exportAs("opml") },
    { id: "file.txt", label: "텍스트 내보내기", run: () => actions.exportAs("text") },
    { id: "file.backup", label: "전체 백업 (JSON)", run: () => actions.exportAs("backup") },
    { id: "file.import", label: "파일 가져오기", run: actions.importFile },
    { id: "app.sync", label: "동기화 설정", run: actions.openSync },
    { id: "app.history", label: "문서 히스토리", hint: doc.title, run: actions.openHistory },
    { id: "app.shortcuts", label: "단축키", hint: "⌘/", run: actions.openShortcuts },

    /* undo lives here too, so the palette is a complete answer to "how do I…" */
    { id: "edit.undo", label: "실행 취소", hint: "⌘Z", run: store.undo },
    { id: "edit.redo", label: "다시 실행", hint: "⇧⌘Z", run: store.redo }
  ];
}

/** The bookmarked documents and rows, for the sidebar. */
export function bookmarks(store: Store): { docId: Id; nodeId: Id | null; label: string }[] {
  const out: { docId: Id; nodeId: Id | null; label: string }[] = [];
  for (const doc of Object.values(store.workspace.docs)) {
    if (doc.bookmarked) out.push({ docId: doc.id, nodeId: null, label: doc.title });
    for (const node of Object.values(doc.nodes)) {
      if (node.bookmarked && node.id !== doc.rootId) out.push({ docId: doc.id, nodeId: node.id, label: node.text });
    }
  }
  return out;
}
