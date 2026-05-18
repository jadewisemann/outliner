import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineRow } from "./OutlineRow";
import {
  bulkDeleteNodes,
  bulkIndentNodes,
  bulkMoveNodesDown,
  bulkMoveNodesUp,
  bulkOutdentNodes,
  bulkToggleCollapse,
  insertNodesFromText,
  selectVisibleRange,
  serializeNodesForClipboard
} from "../domain/bulkOutline";
import {
  createNodeAfter,
  ensureEditableNode,
  indentNode,
  moveNodeDown,
  moveNodeUp,
  outdentNode,
  removeEmptyNodeOrPromoteChildren,
  revealNode,
  splitNode,
  toggleCollapse,
  updateNodeLinks,
  updateNodeMetadata,
  updateNodeText,
  zoomInto,
  zoomToAncestor
} from "../domain/outline";
import {
  addCursorAbove,
  addCursorBelow,
  applyTextToCursors,
  clearCursors,
  type CursorTextEdit
} from "../domain/multiCursor";
import {
  getNextVisibleNode,
  getPreviousVisibleNode,
  getVisibleNodes
} from "../domain/outlineSelectors";
import {
  extractTags,
  findLinkCandidates,
  findNodesByTag,
  getBacklinks,
  searchOutline,
  type SearchResult
} from "../domain/searchSelectors";
import type { Clock, IdGenerator, NodeId, OutlineDocument, OutlineNodeMetadata, ViewState } from "../domain/outlineTypes";

type OutlinerProps = {
  document: OutlineDocument;
  view: ViewState;
  createId: IdGenerator;
  now: Clock;
  onDocumentChange: Dispatch<SetStateAction<OutlineDocument>>;
  onViewChange: (view: ViewState) => void;
  onRenderRow?: (nodeId: NodeId) => void;
};

const ROW_HEIGHT = 32;
const VIRTUALIZATION_THRESHOLD = 300;
const VIRTUAL_OVERSCAN = 12;
const FALLBACK_VIEWPORT_HEIGHT = 640;
type SearchMode = "context" | "flat";

function useStableCallback<T extends (...args: never[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}

export function Outliner({
  document,
  view,
  createId,
  now,
  onDocumentChange,
  onViewChange,
  onRenderRow
}: OutlinerProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: FALLBACK_VIEWPORT_HEIGHT });
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [searchMode, setSearchMode] = useState<SearchMode>("context");
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const visibleNodes = useMemo(() => getVisibleNodes(document, view.zoomNodeId), [document, view.zoomNodeId]);
  const searchResults = useMemo(() => {
    if (tagFilter) {
      return findNodesByTag(document, view.zoomNodeId, tagFilter);
    }
    return searchOutline(document, query, { zoomNodeId: view.zoomNodeId });
  }, [document, query, tagFilter, view.zoomNodeId]);
  const resultIds = useMemo(() => new Set(searchResults.map((result) => result.nodeId)), [searchResults]);
  const tagTokens = useMemo(() => collectTags(document, view.zoomNodeId), [document, view.zoomNodeId]);
  const flatNodes = useMemo(
    () =>
      searchResults
        .map((result) => {
          const node = document.nodes[result.nodeId];
          return node ? { id: result.nodeId, node, depth: result.depth } : undefined;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [document.nodes, searchResults]
  );
  const displayedNodes = searchMode === "flat" && searchResults.length > 0 ? flatNodes : visibleNodes;
  const selectedNodeIds = useMemo(() => {
    if (!view.selectionAnchorNodeId || !view.selectionFocusNodeId) {
      return [];
    }
    return selectVisibleRange(document, view.zoomNodeId, view.selectionAnchorNodeId, view.selectionFocusNodeId);
  }, [document, view.selectionAnchorNodeId, view.selectionFocusNodeId, view.zoomNodeId]);
  const hasBulkSelection = selectedNodeIds.length > 1;
  const hasMultiCursor = (view.cursors?.length ?? 0) > 1;
  const virtualWindow = useMemo(() => {
    if (displayedNodes.length <= VIRTUALIZATION_THRESHOLD) {
      return {
        nodes: displayedNodes,
        start: 0,
        beforeHeight: 0,
        afterHeight: 0,
        totalHeight: displayedNodes.length * ROW_HEIGHT,
        virtualized: false
      };
    }
    const selectedIndex = view.selectedNodeId
      ? displayedNodes.findIndex((item) => item.id === view.selectedNodeId)
      : -1;
    const scrollStart = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const viewportRows = Math.ceil(viewport.height / ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
    const selectedStart =
      selectedIndex >= 0 ? Math.max(0, selectedIndex - Math.floor(viewportRows / 2)) : scrollStart;
    const start = viewport.scrollTop === 0 && selectedIndex >= viewportRows ? selectedStart : scrollStart;
    const end = Math.min(displayedNodes.length, start + viewportRows);
    return {
      nodes: displayedNodes.slice(start, end),
      start,
      beforeHeight: start * ROW_HEIGHT,
      afterHeight: (displayedNodes.length - end) * ROW_HEIGHT,
      totalHeight: displayedNodes.length * ROW_HEIGHT,
      virtualized: true
    };
  }, [view.selectedNodeId, viewport.height, viewport.scrollTop, displayedNodes]);
  const selectedBacklinks = useMemo(
    () => (view.selectedNodeId ? getBacklinks(document, view.selectedNodeId) : []),
    [document, view.selectedNodeId]
  );
  const selectedNode = view.selectedNodeId ? document.nodes[view.selectedNodeId] : undefined;
  const activeNodeText = view.selectedNodeId ? document.nodes[view.selectedNodeId]?.text ?? "" : "";
  const linkQuery = parseOpenLinkQuery(activeNodeText);
  const linkCandidates = useMemo(
    () => (linkQuery ? findLinkCandidates(document, view.zoomNodeId, linkQuery.query) : []),
    [document, linkQuery, view.zoomNodeId]
  );

  const selectNode = useStableCallback((nodeId: NodeId) => {
    onViewChange({
      ...view,
      selectedNodeId: nodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: undefined
    });
  });

  const commitDocument = (
    next: OutlineDocument,
    selectedNodeId = view.selectedNodeId,
    options: { preserveSelection?: boolean } = {}
  ) => {
    onDocumentChange(next);
    onViewChange({
      ...view,
      selectedNodeId,
      selectionAnchorNodeId: options.preserveSelection ? view.selectionAnchorNodeId : undefined,
      selectionFocusNodeId: options.preserveSelection ? view.selectionFocusNodeId : undefined,
      cursors: options.preserveSelection ? view.cursors : undefined
    });
  };

  const createAfter = useStableCallback((nodeId: NodeId, offset?: number) => {
    const node = document.nodes[nodeId];
    const result =
      typeof offset === "number"
        ? splitNode(document, nodeId, offset, createId, now)
        : createNodeAfter(document, nodeId, createId, now);
    commitDocument(result.document, result.nodeId);
    if (!node || typeof offset !== "number") {
      return;
    }
  });

  const pasteText = useStableCallback((nodeId: NodeId, offset: number, text: string) => {
    const result = insertNodesFromText(document, nodeId, offset, text, createId, now);
    commitDocument(result.document, result.selectedNodeId);
  });

  const updateText = useStableCallback((nodeId: NodeId, text: string) => {
    onDocumentChange((current) => updateNodeText(current, nodeId, text, now));
  });

  const updateMetadata = useStableCallback((metadata: Partial<OutlineNodeMetadata>) => {
    if (!view.selectedNodeId) {
      return;
    }
    onDocumentChange((current) => updateNodeMetadata(current, view.selectedNodeId!, metadata, now));
  });

  const goToResult = useStableCallback((result: SearchResult, index: number) => {
    onDocumentChange((current) => revealNode(current, result.nodeId, now));
    onViewChange({
      ...view,
      selectedNodeId: result.nodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: undefined
    });
    setActiveResultIndex(index);
  });

  const stepResult = useStableCallback((direction: 1 | -1) => {
    if (searchResults.length === 0) {
      return;
    }
    const nextIndex = (activeResultIndex + direction + searchResults.length) % searchResults.length;
    goToResult(searchResults[nextIndex], nextIndex);
  });

  const selectTagFilter = useStableCallback((tag: string) => {
    setTagFilter(tag);
    setQuery("");
    setActiveResultIndex(-1);
    const results = findNodesByTag(document, view.zoomNodeId, tag);
    if (results[0]) {
      goToResult(results[0], 0);
    }
  });

  const clearSearch = useStableCallback(() => {
    setQuery("");
    setTagFilter(undefined);
    setActiveResultIndex(-1);
  });

  const insertInternalLink = useStableCallback((targetNodeId: NodeId, label: string) => {
    const sourceNodeId = view.selectedNodeId;
    const openLink = sourceNodeId ? parseOpenLinkQuery(document.nodes[sourceNodeId]?.text ?? "") : undefined;
    if (!sourceNodeId || !openLink) {
      return;
    }
    const source = `[[${label}]]`;
    onDocumentChange((current) => {
      const node = current.nodes[sourceNodeId];
      if (!node) {
        return current;
      }
      const nextText = `${node.text.slice(0, openLink.start)}${source}${node.text.slice(openLink.end)}`;
      const nextLinks = [
        ...(node.links ?? []).filter((link) => link.source !== source || link.targetNodeId !== targetNodeId),
        { source, targetNodeId, label }
      ];
      return updateNodeLinks(updateNodeText(current, sourceNodeId, nextText, now), sourceNodeId, nextLinks, now);
    });
  });

  const indent = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkIndentNodes(document, selectedNodeIds, now), nodeId, { preserveSelection: true });
      return;
    }
    commitDocument(indentNode(document, nodeId, now), nodeId);
  });

  const outdent = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkOutdentNodes(document, selectedNodeIds, now), nodeId, { preserveSelection: true });
      return;
    }
    commitDocument(outdentNode(document, nodeId, now), nodeId);
  });

  const removeEmpty = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      const result = bulkDeleteNodes(document, selectedNodeIds, now);
      onDocumentChange(result.document);
      onViewChange({
        ...view,
        selectedNodeId: result.selectedNodeId,
        selectionAnchorNodeId: undefined,
        selectionFocusNodeId: undefined
      });
      return;
    }
    const result = removeEmptyNodeOrPromoteChildren(document, nodeId, now);
    onDocumentChange(result.document);
    onViewChange({
      ...view,
      selectedNodeId: result.selectedNodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined
    });
  });

  const moveSelection = useStableCallback((direction: "previous" | "next", nodeId: NodeId) => {
    const nextId =
      direction === "previous"
        ? getPreviousVisibleNode(document, view.zoomNodeId, nodeId)
        : getNextVisibleNode(document, view.zoomNodeId, nodeId);
    if (nextId) {
      selectNode(nextId);
    }
  });

  const moveNode = useStableCallback((direction: "previous" | "next", nodeId: NodeId) => {
    if (hasBulkSelection) {
      const nextDocument =
        direction === "previous"
          ? bulkMoveNodesUp(document, selectedNodeIds, view.zoomNodeId, now)
          : bulkMoveNodesDown(document, selectedNodeIds, view.zoomNodeId, now);
      commitDocument(nextDocument, nodeId, { preserveSelection: true });
      return;
    }
    const nextDocument =
      direction === "previous"
        ? moveNodeUp(document, nodeId, view.zoomNodeId, now)
        : moveNodeDown(document, nodeId, view.zoomNodeId, now);
    commitDocument(nextDocument, nodeId);
  });

  const extendSelection = useStableCallback((direction: "previous" | "next", nodeId: NodeId) => {
    const nextId =
      direction === "previous"
        ? getPreviousVisibleNode(document, view.zoomNodeId, nodeId)
        : getNextVisibleNode(document, view.zoomNodeId, nodeId);
    if (!nextId) {
      return;
    }
    const anchor = view.selectionAnchorNodeId ?? view.selectedNodeId ?? nodeId;
    onViewChange({
      ...view,
      selectedNodeId: nextId,
      selectionAnchorNodeId: anchor,
      selectionFocusNodeId: nextId
    });
  });

  const toggle = useStableCallback((nodeId: NodeId) => {
    if (hasBulkSelection) {
      commitDocument(bulkToggleCollapse(document, selectedNodeIds, !document.nodes[nodeId].collapsed, now), nodeId, {
        preserveSelection: true
      });
      return;
    }
    commitDocument(toggleCollapse(document, nodeId, now), nodeId);
  });

  const addCursor = useStableCallback((direction: "previous" | "next", nodeId: NodeId, offset: number) => {
    const cursors =
      direction === "previous"
        ? addCursorAbove(document, view.zoomNodeId, view.cursors, { nodeId, offset })
        : addCursorBelow(document, view.zoomNodeId, view.cursors, { nodeId, offset });
    onViewChange({
      ...view,
      selectedNodeId: nodeId,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors
    });
  });

  const applyCursorEdit = useStableCallback((edit: CursorTextEdit) => {
    if (!view.cursors || view.cursors.length <= 1) {
      return;
    }
    const result = applyTextToCursors(document, view.zoomNodeId, view.cursors, edit, now);
    onDocumentChange(result.document);
    onViewChange({
      ...view,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: result.cursors
    });
  });

  const clearPowerSelection = useStableCallback(() => {
    onViewChange({
      ...view,
      selectionAnchorNodeId: undefined,
      selectionFocusNodeId: undefined,
      cursors: clearCursors()
    });
  });

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = window.document.activeElement as HTMLElement | null;
      if (activeElement?.getAttribute("role") !== "textbox") {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
        if (event.key === "Escape" && (hasBulkSelection || hasMultiCursor)) {
          event.preventDefault();
          event.stopPropagation();
          clearPowerSelection();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Tab" && view.selectedNodeId) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          outdent(view.selectedNodeId);
        } else {
          indent(view.selectedNodeId);
        }
        return;
      }
      if (event.key === "Escape" && (hasBulkSelection || hasMultiCursor)) {
        event.preventDefault();
        event.stopPropagation();
        clearPowerSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  });

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }
    setViewport((current) => ({
      ...current,
      height: element.clientHeight || FALLBACK_VIEWPORT_HEIGHT
    }));
  }, [displayedNodes.length]);

  const copySelection = useStableCallback(() =>
    hasBulkSelection ? serializeNodesForClipboard(document, selectedNodeIds) : undefined
  );

  const zoom = useStableCallback((nodeId: NodeId) => {
    onViewChange(zoomInto(view, document, nodeId));
  });

  const navigate = useStableCallback((nodeId: NodeId) => {
    onViewChange(zoomToAncestor(view, document, nodeId));
  });

  const ensureNode = () => {
    const result = ensureEditableNode(document, createId, now);
    onDocumentChange(result.document);
    onViewChange({ ...view, selectedNodeId: result.nodeId });
  };

  return (
    <section className="outliner-panel">
      <div className="search-toolbar" role="search">
        <input
          ref={searchInputRef}
          type="search"
          aria-label="Search outline"
          value={tagFilter ? tagFilter : query}
          placeholder="Search"
          onChange={(event) => {
            setTagFilter(undefined);
            setQuery(event.target.value);
    setActiveResultIndex(-1);
          }}
        />
        <button type="button" aria-label="Previous search result" onClick={() => stepResult(-1)}>
          ^
        </button>
        <button type="button" aria-label="Next search result" onClick={() => stepResult(1)}>
          v
        </button>
        <span className="search-count" aria-label="Search result count">
          {searchResults.length}
        </span>
        <button
          type="button"
          className={searchMode === "context" ? "toolbar-button-active" : ""}
          onClick={() => setSearchMode("context")}
        >
          Context
        </button>
        <button
          type="button"
          className={searchMode === "flat" ? "toolbar-button-active" : ""}
          onClick={() => setSearchMode("flat")}
        >
          Flat
        </button>
        <button type="button" onClick={clearSearch}>
          Clear
        </button>
      </div>
      {tagTokens.length > 0 ? (
        <div className="tag-strip" aria-label="Tags">
          {tagTokens.map((tag) => (
            <button key={tag} type="button" onClick={() => selectTagFilter(tag)}>
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      {linkQuery && linkCandidates.length > 0 ? (
        <div className="link-candidates" aria-label="Internal link candidates">
          {linkCandidates.map((candidate) => (
            <button key={candidate.nodeId} type="button" onClick={() => insertInternalLink(candidate.nodeId, candidate.label)}>
              {candidate.label}
            </button>
          ))}
        </div>
      ) : null}
      <Breadcrumb document={document} zoomNodeId={view.zoomNodeId} onNavigate={navigate} />
      {selectedNode ? <FormatToolbar node={selectedNode} onChange={updateMetadata} /> : null}
      {searchMode === "flat" && searchResults.length > 0 ? (
        <div className="flat-result-context" aria-label="Flat search context">
          {searchResults.map((result) => (
            <button key={result.nodeId} type="button" onClick={() => goToResult(result, searchResults.indexOf(result))}>
              {result.breadcrumbIds.map((id) => document.nodes[id]?.text || "Root").join(" / ")}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={listRef}
        className={`outline-list ${virtualWindow.virtualized ? "outline-list-virtualized" : ""}`}
        role="tree"
        aria-label="Outline"
        data-visible-count={displayedNodes.length}
        data-rendered-count={virtualWindow.nodes.length}
        onScroll={(event) => {
          const element = event.currentTarget;
          setViewport({
            scrollTop: element.scrollTop,
            height: element.clientHeight || FALLBACK_VIEWPORT_HEIGHT
          });
        }}
      >
        {displayedNodes.length === 0 ? (
          <button className="empty-node-button" type="button" onClick={ensureNode}>
            Start writing
          </button>
        ) : (
          <>
            {virtualWindow.beforeHeight > 0 ? (
              <div aria-hidden="true" style={{ height: virtualWindow.beforeHeight }} />
            ) : null}
            {virtualWindow.nodes.map((item) => (
              <OutlineRow
                key={item.id}
                node={item.node}
                depth={item.depth}
                active={view.selectedNodeId === item.id}
                selected={selectedNodeIds.includes(item.id)}
                highlighted={resultIds.has(item.id)}
                hasCursor={(view.cursors ?? []).some((cursor) => cursor.nodeId === item.id)}
                hasBulkSelection={hasBulkSelection}
                hasMultiCursor={hasMultiCursor}
                onSelect={() => selectNode(item.id)}
                onSelectTag={selectTagFilter}
                onTextChange={(text) => updateText(item.id, text)}
                onCreateAfter={(offset) => createAfter(item.id, offset)}
                onPasteText={(offset, text) => pasteText(item.id, offset, text)}
                onIndent={() => indent(item.id)}
                onOutdent={() => outdent(item.id)}
                onRemoveEmpty={() => removeEmpty(item.id)}
                onMoveSelection={(direction) => moveSelection(direction, item.id)}
                onMoveNode={(direction) => moveNode(direction, item.id)}
                onExtendSelection={(direction) => extendSelection(direction, item.id)}
                onAddCursor={(direction, offset) => addCursor(direction, item.id, offset)}
                onApplyTextToCursors={applyCursorEdit}
                onClearPowerSelection={clearPowerSelection}
                onToggleCollapse={() => toggle(item.id)}
                onCopySelection={copySelection}
                onZoom={() => zoom(item.id)}
                onRender={onRenderRow}
              />
            ))}
            {virtualWindow.afterHeight > 0 ? (
              <div aria-hidden="true" style={{ height: virtualWindow.afterHeight }} />
            ) : null}
          </>
        )}
      </div>
      {selectedBacklinks.length > 0 ? (
        <aside className="backlink-panel" aria-label="Backlinks">
          <strong>Backlinks</strong>
          {selectedBacklinks.map((backlink) => (
            <button
              key={`${backlink.sourceNodeId}:${backlink.source}`}
              type="button"
              onClick={() => goToResult(
                {
                  nodeId: backlink.sourceNodeId,
                  text: document.nodes[backlink.sourceNodeId]?.text ?? "",
                  depth: 0,
                  breadcrumbIds: [],
                  matchStart: 0,
                  matchEnd: backlink.source.length,
                  matchText: backlink.source
                },
                0
              )}
            >
              {document.nodes[backlink.sourceNodeId]?.text ?? backlink.source}
            </button>
          ))}
        </aside>
      ) : null}
    </section>
  );
}

function FormatToolbar({
  node,
  onChange
}: {
  node: { heading?: 1 | 2 | 3; color?: string; numbered?: boolean; note?: string; noteVisible?: boolean };
  onChange: (metadata: Partial<OutlineNodeMetadata>) => void;
}) {
  return (
    <div className="format-toolbar" aria-label="Formatting">
      <select
        aria-label="Heading"
        value={node.heading ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          onChange({ heading: value ? (Number(value) as 1 | 2 | 3) : undefined });
        }}
      >
        <option value="">Text</option>
        <option value="1">H1</option>
        <option value="2">H2</option>
        <option value="3">H3</option>
      </select>
      <label>
        Color
        <input
          aria-label="Node color"
          type="color"
          value={node.color ?? "#17202a"}
          onChange={(event) => onChange({ color: event.target.value })}
        />
      </label>
      <label>
        Numbered
        <input
          aria-label="Numbered node"
          type="checkbox"
          checked={node.numbered ?? false}
          onChange={(event) => onChange({ numbered: event.target.checked })}
        />
      </label>
      <label>
        Note visible
        <input
          aria-label="Note visible"
          type="checkbox"
          checked={node.noteVisible !== false}
          onChange={(event) => onChange({ noteVisible: event.target.checked })}
        />
      </label>
      <textarea
        aria-label="Node note"
        value={node.note ?? ""}
        placeholder="Note"
        onChange={(event) => onChange({ note: event.target.value })}
      />
    </div>
  );
}

function collectTags(document: OutlineDocument, zoomNodeId: NodeId): string[] {
  const zoomNode = document.nodes[zoomNodeId];
  if (!zoomNode) {
    return [];
  }
  const tags = new Set<string>();
  const stack = [...zoomNode.children].reverse();
  while (stack.length > 0) {
    const node = document.nodes[stack.pop()!];
    if (!node) {
      continue;
    }
    for (const tag of extractTags(node.text)) {
      tags.add(tag.source);
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push(node.children[index]);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}

function parseOpenLinkQuery(text: string): { start: number; end: number; query: string } | undefined {
  const start = text.lastIndexOf("[[");
  if (start < 0) {
    return undefined;
  }
  const end = text.indexOf("]]", start);
  if (end >= 0) {
    return undefined;
  }
  return { start, end: text.length, query: text.slice(start + 2) };
}
