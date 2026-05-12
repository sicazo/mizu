import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiSettings } from "../hooks/useAiSettings";
import type { UpdateActions, UpdateStatus } from "../hooks/useUpdater";
import { restartApp } from "../hooks/useUpdater";
import type { AiTarget } from "../lib/aiProviders";
import { CLAUDE_CODE_TARGET } from "../lib/aiProviders";

type AgentId = "claude_code" | "codex" | "pi" | "gemini";

interface AgentAvailability {
  installed: boolean;
  version: string | null;
}

interface AgentsStatus {
  claude_code: AgentAvailability;
  codex: AgentAvailability;
  pi: AgentAvailability;
  gemini: AgentAvailability;
}

const AGENT_LABELS: Record<AgentId, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  pi: "Pi",
  gemini: "Gemini",
};

const AGENT_ICONS: Record<AgentId, string> = {
  claude_code: "⌘",
  codex: "◎",
  pi: "π",
  gemini: "✦",
};

const AGENT_INSTALL_URLS: Record<AgentId, string> = {
  claude_code: "https://docs.anthropic.com/en/docs/claude-code",
  codex: "https://developers.openai.com/codex/cli",
  pi: "https://pi.dev",
  gemini: "https://google-gemini.github.io/gemini-cli/",
};

const CLI_AGENTS: AgentId[] = ["claude_code", "codex", "pi", "gemini"];

interface StatusBarProps {
  onToggleTheme: () => void;
  onToggleSettings: () => void;
  onOpenAi: () => void;
  aiSettings: AiSettings;
  updateStatus: UpdateStatus;
  updateActions: UpdateActions;
}

function resolveAgentId(target: AiTarget): AgentId | null {
  if (target.kind === "claude_code") return "claude_code";
  // cli_agent kind stores agentId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((target as any).agentId) return (target as any).agentId as AgentId;
  return null;
}

export default function StatusBar({ onToggleTheme, onToggleSettings, onOpenAi, aiSettings, updateStatus, updateActions }: StatusBarProps) {
  const [agentsStatus, setAgentsStatus] = useState<AgentsStatus | null>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { target, setTarget } = aiSettings;
  const activeAgentId = resolveAgentId(target);

  async function refreshAgentsStatus() {
    try {
      const status = await invoke<AgentsStatus>("get_ai_agents_status");
      setAgentsStatus(status);
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    refreshAgentsStatus();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showAgentMenu) return;
    function handleOutside(e: MouseEvent) {
      const node = e.target as Node;
      const inAnchor = anchorRef.current?.contains(node);
      const inMenu = menuRef.current?.contains(node);
      if (!inAnchor && !inMenu) setShowAgentMenu(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showAgentMenu]);

  function handleAgentSelect(agentId: AgentId) {
    const newTarget: AiTarget = agentId === "claude_code"
      ? CLAUDE_CODE_TARGET
      : ({ kind: "cli_agent", agentId } as unknown as AiTarget);
    setTarget(newTarget);
    setShowAgentMenu(false);
    onOpenAi();
  }

  function handleActiveAgentClick() {
    if (!agentsStatus) return;
    const currentId = activeAgentId ?? "claude_code";
    const availability = agentsStatus[currentId];
    if (!availability?.installed) {
      window.open(AGENT_INSTALL_URLS[currentId], "_blank");
      return;
    }
    onOpenAi();
  }

  const currentId: AgentId = activeAgentId ?? "claude_code";
  const currentAvailability = agentsStatus?.[currentId];
  const currentInstalled = currentAvailability?.installed ?? null; // null = still checking

  return (
    <footer className="status-bar" data-testid="status-bar">
      <div className="status-left">
        {/* AI agent selector */}
        <div className="sb-agent-wrap" ref={anchorRef}>
          <button
            className={`status-btn sb-agent-btn${currentInstalled === false ? " status-warn" : ""}`}
            onClick={handleActiveAgentClick}
            onContextMenu={(e) => { e.preventDefault(); setShowAgentMenu((v) => !v); }}
            title={
              currentInstalled === null
                ? `${AGENT_LABELS[currentId]} (checking…)`
                : currentInstalled
                ? `${AGENT_LABELS[currentId]}${currentAvailability?.version ? ` ${currentAvailability.version}` : ""} — click to open AI panel`
                : `${AGENT_LABELS[currentId]} not installed — click to install`
            }
          >
            <span className="sb-agent-icon">{AGENT_ICONS[currentId]}</span>
            <span className="sb-agent-dot" data-status={
              currentInstalled === null ? "checking" : currentInstalled ? "ok" : "missing"
            } />
            <span>{AGENT_LABELS[currentId]}</span>
            {currentInstalled === false && <span className="sb-warn-icon">⚠</span>}
          </button>

          <button
            className="status-btn sb-agent-chevron"
            onClick={() => {
              if (!showAgentMenu && anchorRef.current) {
                const rect = anchorRef.current.getBoundingClientRect();
                setMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
              }
              setShowAgentMenu((v) => !v);
            }}
            title="Switch AI agent"
          >
            ⌄
          </button>

          {showAgentMenu && menuPos && (
            <div
              ref={menuRef}
              className="sb-agent-menu"
              style={{ position: "fixed", left: menuPos.left, bottom: menuPos.bottom, top: "auto" }}
            >
              <div className="sb-agent-menu-label">CLI AGENTS</div>
              {CLI_AGENTS.map((agentId) => {
                const avail = agentsStatus?.[agentId];
                const isActive = currentId === agentId;
                return (
                  <button
                    key={agentId}
                    className={`sb-agent-item${isActive ? " sb-agent-item-active" : ""}`}
                    onClick={() => handleAgentSelect(agentId)}
                  >
                    <span className="sb-agent-item-icon">{AGENT_ICONS[agentId]}</span>
                    <span className="sb-agent-item-dot" data-status={
                      avail == null ? "checking" : avail.installed ? "ok" : "missing"
                    } />
                    <span className="sb-agent-item-label">{AGENT_LABELS[agentId]}</span>
                    {avail?.version && (
                      <span className="sb-agent-item-version">{avail.version}</span>
                    )}
                    {avail && !avail.installed && (
                      <span className="sb-agent-item-missing">not installed</span>
                    )}
                  </button>
                );
              })}

              {aiSettings.providers.length > 0 && (
                <>
                  <div className="sb-agent-menu-label sb-agent-menu-label-sep">API MODELS</div>
                  {aiSettings.providers.map((p) =>
                    p.models.map((m) => {
                      const isApiActive =
                        target.kind === "api_model" &&
                        (target as { providerId?: string }).providerId === p.id &&
                        (target as { modelId?: string }).modelId === m.id;
                      return (
                        <button
                          key={`${p.id}::${m.id}`}
                          className={`sb-agent-item${isApiActive ? " sb-agent-item-active" : ""}`}
                          onClick={() => {
                            setTarget({ kind: "api_model", providerId: p.id, modelId: m.id });
                            setShowAgentMenu(false);
                            onOpenAi();
                          }}
                        >
                          <span className="sb-agent-item-icon">◈</span>
                          <span className="sb-agent-item-dot" data-status="ok" />
                          <span className="sb-agent-item-label">{p.name}</span>
                          <span className="sb-agent-item-version">{m.display_name ?? m.id}</span>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="status-right">
        {updateStatus.state === "idle" && (
          <span className="status-update-progress" title="Updater active — no update available">✓ Up to date</span>
        )}
        {updateStatus.state === "available" && (
          <button className="status-btn status-update" onClick={updateActions.startDownload} title={`Update to ${updateStatus.version}`}>
            ⬇ Update {updateStatus.version}
          </button>
        )}
        {updateStatus.state === "downloading" && (
          <span className="status-update-progress">Updating… {Math.round(updateStatus.progress * 100)}%</span>
        )}
        {updateStatus.state === "ready" && (
          <button className="status-btn status-update-ready" onClick={restartApp} title="Restart to finish update">
            ↻ Restart to update
          </button>
        )}
        {updateStatus.state === "error" && (
          <span className="status-update-progress" title="Update check failed">Update unavailable</span>
        )}
        <button className="status-btn" onClick={onToggleTheme} title="Toggle theme">◐</button>
        <button className="status-btn" onClick={onToggleSettings} title="Settings">⚙</button>
      </div>
    </footer>
  );
}
