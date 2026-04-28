import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type McpStatus = "checking" | "installed" | "not_installed" | "error";
type ClaudeCodeStatus = "checking" | "installed" | "missing";

interface ClaudeCliResult {
  installed: boolean;
  version: string | null;
}

interface StatusBarProps {
  onToggleTheme: () => void;
  onToggleSettings: () => void;
}

export default function StatusBar({ onToggleTheme, onToggleSettings }: StatusBarProps) {
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("checking");
  const [claudeStatus, setClaudeStatus] = useState<ClaudeCodeStatus>("checking");
  const [claudeVersion, setClaudeVersion] = useState<string | null>(null);
  const [installingMcp, setInstallingMcp] = useState(false);

  async function refreshMcp() {
    try {
      const status = await invoke<string>("mcp_status");
      setMcpStatus(status === "installed" ? "installed" : "not_installed");
    } catch {
      setMcpStatus("error");
    }
  }

  async function refreshClaude() {
    try {
      const result = await invoke<ClaudeCliResult>("check_claude_cli");
      setClaudeStatus(result.installed ? "installed" : "missing");
      setClaudeVersion(result.version ?? null);
    } catch {
      setClaudeStatus("missing");
    }
  }

  async function handleInstallMcp() {
    setInstallingMcp(true);
    try {
      await invoke<string>("register_mcp");
      await refreshMcp();
    } finally {
      setInstallingMcp(false);
    }
  }

  function handleClaudeClick() {
    if (claudeStatus === "missing") {
      window.open("https://docs.anthropic.com/en/docs/claude-code", "_blank");
    }
  }

  useEffect(() => {
    refreshMcp();
    refreshClaude();
  }, []);

  const showMcpBadge = mcpStatus === "not_installed" || mcpStatus === "error";
  const mcpLabel = "MCP";

  const claudeLabel =
    claudeStatus === "installed"
      ? "Claude Code"
      : claudeStatus === "checking"
      ? "Claude Code …"
      : "Claude Code missing";

  return (
    <footer className="status-bar" data-testid="status-bar">
      <div className="status-left">
        <button className="status-btn" title="Git branch / sync">
          <span>⑂</span>
          <span>Git</span>
        </button>
        <span className="status-sep">|</span>
        <button className="status-btn" title="Sync status">
          <span>↻</span>
          <span>Synced</span>
        </button>
        {showMcpBadge && (
          <>
            <span className="status-sep">|</span>
            <button
              className="status-btn status-warn"
              onClick={handleInstallMcp}
              disabled={installingMcp}
              title="External AI tools not connected — click to set up"
            >
              <span>⌁</span>
              <span>{installingMcp ? "Installing…" : mcpLabel}</span>
              <span>⚠</span>
            </button>
          </>
        )}
        {claudeStatus !== "checking" && (
          <>
            <span className="status-sep">|</span>
            <button
              className={`status-btn ${claudeStatus === "missing" ? "status-warn" : ""}`}
              onClick={handleClaudeClick}
              title={claudeStatus === "missing" ? "Claude Code not found — click to install" : `Claude Code${claudeVersion ? ` ${claudeVersion}` : ""}`}
            >
              <span>⌘</span>
              <span>{claudeLabel}</span>
              {claudeStatus === "missing" && <span>⚠</span>}
            </button>
          </>
        )}
      </div>

      <div className="status-right">
        <button className="status-btn" onClick={onToggleTheme} title="Toggle theme">◐</button>
        <button className="status-btn" onClick={onToggleSettings} title="Settings">⚙</button>
      </div>
    </footer>
  );
}
