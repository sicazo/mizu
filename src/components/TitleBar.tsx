import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sparkles, SlidersHorizontal, FolderSearch, FileText, Copy, Check, CircleX, MoreHorizontal } from "lucide-react";

interface TitleBarProps {
  breadcrumb: string[];
  onToggleAi: () => void;
  editorActions?: {
    showAi: boolean;
    showProperties: boolean;
    canToggleProperties: boolean;
    noteFilePath: string | null;
    onToggleProperties: () => void;
  };
}

export default function TitleBar({ breadcrumb, onToggleAi, editorActions }: TitleBarProps) {
  const [copyPathLabel, setCopyPathLabel] = useState("Copy path");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!overflowRef.current) return;
      if (!overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    }
    if (overflowOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [overflowOpen]);

  async function handleOpenInFinder() {
    if (!editorActions?.noteFilePath) return;
    await revealItemInDir(editorActions.noteFilePath);
    setOverflowOpen(false);
  }

  async function handleOpenFile() {
    if (!editorActions?.noteFilePath) return;
    await openPath(editorActions.noteFilePath);
    setOverflowOpen(false);
  }

  async function handleCopyPath() {
    if (!editorActions?.noteFilePath) return;
    try {
      await navigator.clipboard.writeText(editorActions.noteFilePath);
      setCopyPathLabel("Copied");
    } catch {
      setCopyPathLabel("Failed");
    }
    setOverflowOpen(false);
    window.setTimeout(() => setCopyPathLabel("Copy path"), 1200);
  }

  function handleDragStart(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [data-no-drag='true']")) return;
    getCurrentWindow().startDragging().catch(() => {
      // noop
    });
  }

  return (
    <div className="tb" data-tauri-drag-region onMouseDown={handleDragStart}>
      <div className="tb-drag-layer" data-tauri-drag-region onMouseDown={handleDragStart} />
      <div className="tb-center">
        <div className="bc">
          {breadcrumb.map((seg, i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className={i === breadcrumb.length - 1 ? "bc-current" : undefined}>{seg}</span>
              {i < breadcrumb.length - 1 && <span className="bc-sep">›</span>}
            </span>
          ))}
        </div>
        {editorActions && (
          <>
            <div aria-hidden="true" className="tb-drag-spacer" data-tauri-drag-region />
            <div className="tb-editor-actions" data-overflow-collapsed={overflowOpen}>
              <button className={`tb-action-btn${editorActions.showAi ? " tb-action-btn-active" : ""}`} onClick={onToggleAi} title="Toggle AI chat (⌘J)">
                <Sparkles size={16} />
              </button>
              <button
                className={`tb-action-btn${editorActions.showProperties ? " tb-action-btn-active" : ""}`}
                onClick={editorActions.onToggleProperties}
                title="Toggle properties"
                disabled={!editorActions.canToggleProperties}
              >
                <SlidersHorizontal size={16} />
              </button>

              <span className="tb-overflowable-action">
                <button className="tb-action-btn" onClick={handleOpenInFinder} title="Reveal note in Finder" disabled={!editorActions.noteFilePath}>
                  <FolderSearch size={16} />
                </button>
              </span>
              <span className="tb-overflowable-action">
                <button className="tb-action-btn" onClick={handleOpenFile} title="Open note file" disabled={!editorActions.noteFilePath}>
                  <FileText size={16} />
                </button>
              </span>
              <span className="tb-overflowable-action">
                <button className="tb-action-btn" onClick={handleCopyPath} title={copyPathLabel === "Copy path" ? "Copy note path" : copyPathLabel} disabled={!editorActions.noteFilePath}>
                  {copyPathLabel === "Copied" ? <Check size={16} /> : copyPathLabel === "Failed" ? <CircleX size={16} /> : <Copy size={16} />}
                </button>
              </span>

              <div className="tb-overflow-wrap" ref={overflowRef}>
                <button className="tb-action-btn tb-overflow-trigger" onClick={() => setOverflowOpen((v) => !v)} title="More actions">
                  <MoreHorizontal size={16} />
                </button>
                {overflowOpen && (
                  <div className="tb-overflow-menu">
                    <button className="tb-overflow-item" onClick={handleOpenInFinder} disabled={!editorActions.noteFilePath}>
                      <FolderSearch size={15} /> Reveal in Finder
                    </button>
                    <button className="tb-overflow-item" onClick={handleOpenFile} disabled={!editorActions.noteFilePath}>
                      <FileText size={15} /> Open file
                    </button>
                    <button className="tb-overflow-item" onClick={handleCopyPath} disabled={!editorActions.noteFilePath}>
                      <Copy size={15} /> Copy path
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
