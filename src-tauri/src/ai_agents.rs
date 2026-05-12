use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiAgentId {
    ClaudeCode,
    Codex,
    Pi,
    Gemini,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiAgentAvailability {
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiAgentsStatus {
    pub claude_code: AiAgentAvailability,
    pub codex: AiAgentAvailability,
    pub pi: AiAgentAvailability,
    pub gemini: AiAgentAvailability,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum AiAgentStreamEvent {
    Init {
        session_id: String,
    },
    TextDelta {
        text: String,
    },
    ThinkingDelta {
        text: String,
    },
    ToolStart {
        tool_name: String,
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<String>,
    },
    ToolDone {
        tool_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        output: Option<String>,
    },
    Error {
        message: String,
    },
    Done,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiAgentStreamRequest {
    pub agent: AiAgentId,
    pub message: String,
    pub system_prompt: Option<String>,
    pub vault_path: String,
}

pub fn get_ai_agents_status() -> AiAgentsStatus {
    AiAgentsStatus {
        claude_code: availability_from_claude(),
        codex: availability_from_codex(),
        pi: crate::pi_discovery::check_cli(),
        gemini: crate::gemini_discovery::check_cli(),
    }
}

pub fn run_ai_agent_stream<F>(request: AiAgentStreamRequest, mut emit: F) -> Result<String, String>
where
    F: FnMut(AiAgentStreamEvent),
{
    match request.agent {
        AiAgentId::ClaudeCode => {
            let mapped = crate::claude_cli::AgentStreamRequest {
                message: request.message,
                system_prompt: request.system_prompt,
                vault_path: request.vault_path,
            };
            crate::claude_cli::run_agent_stream(mapped, |event| {
                if let Some(mapped_event) = map_claude_event(event) {
                    emit(mapped_event);
                }
            })
        }
        AiAgentId::Codex => run_codex_agent_stream(request, emit),
        AiAgentId::Pi => run_pi_agent_stream(request, emit),
        AiAgentId::Gemini => run_gemini_agent_stream(request, emit),
    }
}

fn availability_from_claude() -> AiAgentAvailability {
    let status = crate::claude_cli::check_cli();
    AiAgentAvailability {
        installed: status.installed,
        version: status.version,
    }
}

fn availability_from_codex() -> AiAgentAvailability {
    let binary = match find_codex_binary() {
        Ok(binary) => binary,
        Err(_) => {
            return AiAgentAvailability {
                installed: false,
                version: None,
            }
        }
    };
    AiAgentAvailability {
        installed: true,
        version: version_for_binary(&binary),
    }
}

fn version_for_binary(binary: &PathBuf) -> Option<String> {
    Command::new(binary)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ── Codex ──────────────────────────────────────────────────────────────────

fn find_codex_binary() -> Result<PathBuf, String> {
    if let Some(binary) = find_codex_binary_on_path() {
        return Ok(binary);
    }
    if let Some(binary) = find_codex_binary_in_user_shell() {
        return Ok(binary);
    }
    if let Some(binary) = find_existing_binary(codex_binary_candidates()) {
        return Ok(binary);
    }
    Err("Codex CLI not found. Install it: https://developers.openai.com/codex/cli".into())
}

fn find_codex_binary_on_path() -> Option<PathBuf> {
    Command::new("which")
        .arg("codex")
        .output()
        .ok()
        .and_then(|output| path_from_successful_output(&output))
}

fn find_codex_binary_in_user_shell() -> Option<PathBuf> {
    user_shell_candidates()
        .into_iter()
        .filter(|shell| shell.exists())
        .find_map(|shell| command_path_from_shell(&shell, "codex"))
}

fn user_shell_candidates() -> Vec<PathBuf> {
    let mut shells = Vec::new();
    if let Some(shell) = std::env::var_os("SHELL") {
        if !shell.is_empty() {
            shells.push(PathBuf::from(shell));
        }
    }
    shells.push(PathBuf::from("/bin/zsh"));
    shells.push(PathBuf::from("/bin/bash"));
    shells
}

fn command_path_from_shell(shell: &Path, command: &str) -> Option<PathBuf> {
    Command::new(shell)
        .arg("-lc")
        .arg(format!("command -v {command}"))
        .output()
        .ok()
        .and_then(|output| path_from_successful_output(&output))
}

fn path_from_successful_output(output: &std::process::Output) -> Option<PathBuf> {
    if output.status.success() {
        first_existing_path(&String::from_utf8_lossy(&output.stdout))
    } else {
        None
    }
}

fn first_existing_path(stdout: &str) -> Option<PathBuf> {
    stdout.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }
        let candidate = PathBuf::from(trimmed);
        candidate.exists().then_some(candidate)
    })
}

fn codex_binary_candidates() -> Vec<PathBuf> {
    dirs::home_dir()
        .map(|home| codex_binary_candidates_for_home(&home))
        .unwrap_or_default()
}

fn codex_binary_candidates_for_home(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".local/bin/codex"),
        home.join(".codex/bin/codex"),
        home.join(".local/share/mise/shims/codex"),
        home.join(".asdf/shims/codex"),
        home.join(".npm-global/bin/codex"),
        home.join(".npm/bin/codex"),
        home.join(".bun/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
    ]
}

fn find_existing_binary(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn run_codex_agent_stream<F>(request: AiAgentStreamRequest, mut emit: F) -> Result<String, String>
where
    F: FnMut(AiAgentStreamEvent),
{
    let binary = find_codex_binary()?;
    let prompt = build_prompt(&request.message, request.system_prompt.as_deref());

    let mut command = Command::new(binary);
    command
        .args(["exec", "--json", "-C", &request.vault_path])
        .arg(prompt)
        .current_dir(&request.vault_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| format!("Failed to spawn codex: {e}"))?;
    let stdout = child.stdout.take().ok_or("No stdout handle")?;
    let reader = std::io::BufReader::new(stdout);
    let mut session_id = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(e) => {
                emit(AiAgentStreamEvent::Error { message: format!("Read error: {e}") });
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if let Some(id) = json["thread_id"].as_str() {
            session_id = id.to_string();
        }
        dispatch_codex_event(&json, &mut emit);
    }

    let stderr_output = child.stderr.take()
        .and_then(|stderr| std::io::read_to_string(stderr).ok())
        .unwrap_or_default();
    let status = child.wait().map_err(|e| format!("Wait failed: {e}"))?;
    if !status.success() {
        emit(AiAgentStreamEvent::Error {
            message: format_codex_error(stderr_output, status.to_string()),
        });
    }
    emit(AiAgentStreamEvent::Done);
    Ok(session_id)
}

fn dispatch_codex_event<F>(json: &serde_json::Value, emit: &mut F)
where
    F: FnMut(AiAgentStreamEvent),
{
    match json["type"].as_str().unwrap_or_default() {
        "thread.started" => {
            if let Some(id) = json["thread_id"].as_str() {
                emit(AiAgentStreamEvent::Init { session_id: id.to_string() });
            }
        }
        "item.started" => emit_codex_item_event(json, false, emit),
        "item.completed" => emit_codex_item_event(json, true, emit),
        _ => {}
    }
}

fn emit_codex_item_event<F>(json: &serde_json::Value, completed: bool, emit: &mut F)
where
    F: FnMut(AiAgentStreamEvent),
{
    let item = &json["item"];
    let item_type = item["type"].as_str().unwrap_or_default();
    let item_id = item["id"].as_str().unwrap_or_default();

    match item_type {
        "command_execution" => {
            if completed {
                emit(AiAgentStreamEvent::ToolDone {
                    tool_id: item_id.to_string(),
                    output: item["aggregated_output"].as_str().map(str::to_string),
                });
            } else {
                emit(AiAgentStreamEvent::ToolStart {
                    tool_name: "Bash".into(),
                    tool_id: item_id.to_string(),
                    input: item["command"].as_str()
                        .map(|cmd| serde_json::json!({ "command": cmd }).to_string()),
                });
            }
        }
        "agent_message" if completed => {
            if let Some(text) = item["text"].as_str() {
                emit(AiAgentStreamEvent::TextDelta { text: text.to_string() });
            }
        }
        _ => {}
    }
}

fn format_codex_error(stderr_output: String, status: String) -> String {
    let lower = stderr_output.to_ascii_lowercase();
    if ["auth", "login", "sign in"].iter().any(|p| lower.contains(p)) {
        return "Codex CLI is not authenticated. Run `codex login` in your terminal.".into();
    }
    if stderr_output.trim().is_empty() {
        return format!("codex exited with status {status}");
    }
    stderr_output.lines().take(3).collect::<Vec<_>>().join("\n")
}

// ── Pi ────────────────────────────────────────────────────────────────────

fn run_pi_agent_stream<F>(request: AiAgentStreamRequest, mut emit: F) -> Result<String, String>
where
    F: FnMut(AiAgentStreamEvent),
{
    let binary = crate::pi_discovery::find_binary()?;
    let prompt = build_prompt(&request.message, request.system_prompt.as_deref());

    let mut command = Command::new(&binary);
    command
        .args(["--mode", "json", "--no-session"])
        .arg(&prompt)
        .current_dir(&request.vault_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| format!("Failed to spawn pi: {e}"))?;
    let stdout = child.stdout.take().ok_or("No stdout handle")?;
    let reader = std::io::BufReader::new(stdout);
    let mut session_id = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(e) => {
                emit(AiAgentStreamEvent::Error { message: format!("Read error: {e}") });
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        // Pi session id from {"type":"session","id":"..."}
        if json["type"].as_str() == Some("session") {
            if let Some(id) = json["id"].as_str().or_else(|| json["session_id"].as_str()) {
                session_id = id.to_string();
                emit(AiAgentStreamEvent::Init { session_id: session_id.clone() });
            }
        }
        dispatch_pi_event(&json, &mut emit);
    }

    let stderr_output = child.stderr.take()
        .and_then(|s| std::io::read_to_string(s).ok())
        .unwrap_or_default();
    let status = child.wait().map_err(|e| format!("Wait failed: {e}"))?;
    if !status.success() {
        let lower = stderr_output.to_ascii_lowercase();
        let msg = if ["auth", "login", "sign in", "api key", "401"].iter().any(|p| lower.contains(p)) {
            "Pi CLI is not authenticated. Run `pi /login` in your terminal.".into()
        } else if stderr_output.trim().is_empty() {
            format!("pi exited with status {status}")
        } else {
            stderr_output.lines().take(3).collect::<Vec<_>>().join("\n")
        };
        emit(AiAgentStreamEvent::Error { message: msg });
    }
    emit(AiAgentStreamEvent::Done);
    Ok(session_id)
}

fn dispatch_pi_event<F>(json: &serde_json::Value, emit: &mut F)
where
    F: FnMut(AiAgentStreamEvent),
{
    match json["type"].as_str().unwrap_or_default() {
        "message_update" => {
            let event = &json["assistantMessageEvent"];
            match event["type"].as_str().unwrap_or_default() {
                "text_delta" => {
                    if let Some(delta) = event["delta"].as_str() {
                        emit(AiAgentStreamEvent::TextDelta { text: delta.to_string() });
                    }
                }
                "thinking_delta" => {
                    if let Some(delta) = event["delta"].as_str() {
                        emit(AiAgentStreamEvent::ThinkingDelta { text: delta.to_string() });
                    }
                }
                _ => {}
            }
        }
        "tool_execution_start" => {
            emit(AiAgentStreamEvent::ToolStart {
                tool_name: json["toolName"].as_str().unwrap_or("tool").to_string(),
                tool_id: json["toolCallId"].as_str().unwrap_or("tool").to_string(),
                input: json.get("args").map(|a| a.to_string()),
            });
        }
        "tool_execution_end" => {
            emit(AiAgentStreamEvent::ToolDone {
                tool_id: json["toolCallId"].as_str().unwrap_or("tool").to_string(),
                output: json.get("result").map(|r| r.to_string()),
            });
        }
        "error" => {
            if let Some(msg) = json["message"].as_str().or_else(|| json["error"].as_str()) {
                emit(AiAgentStreamEvent::Error { message: msg.to_string() });
            }
        }
        _ => {}
    }
}

// ── Gemini ──────────────────────────────────────────────────────────────────

fn run_gemini_agent_stream<F>(request: AiAgentStreamRequest, mut emit: F) -> Result<String, String>
where
    F: FnMut(AiAgentStreamEvent),
{
    let binary = crate::gemini_discovery::find_binary()?;
    let prompt = build_prompt(&request.message, request.system_prompt.as_deref());

    let mut command = Command::new(&binary);
    command
        .args(["--output-format", "stream-json", "--approval-mode", "auto_edit"])
        .arg("--prompt")
        .arg(&prompt)
        .env("NO_COLOR", "1")
        .current_dir(&request.vault_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| format!("Failed to spawn gemini: {e}"))?;
    let stdout = child.stdout.take().ok_or("No stdout handle")?;
    let reader = std::io::BufReader::new(stdout);
    let mut session_id = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(e) => {
                emit(AiAgentStreamEvent::Error { message: format!("Read error: {e}") });
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if let Some(id) = json["session_id"].as_str() {
            if session_id.is_empty() {
                session_id = id.to_string();
            }
        }
        dispatch_gemini_event(&json, &mut emit);
    }

    let stderr_output = child.stderr.take()
        .and_then(|s| std::io::read_to_string(s).ok())
        .unwrap_or_default();
    let status = child.wait().map_err(|e| format!("Wait failed: {e}"))?;
    if !status.success() {
        let lower = stderr_output.to_ascii_lowercase();
        let msg = if ["auth", "login", "api key", "gemini_api_key", "oauth", "401"]
            .iter().any(|p| lower.contains(p))
        {
            "Gemini CLI is not authenticated. Run `gemini` in your terminal to sign in, or set GEMINI_API_KEY.".into()
        } else if stderr_output.trim().is_empty() {
            format!("gemini exited with status {status}")
        } else {
            stderr_output.lines().take(3).collect::<Vec<_>>().join("\n")
        };
        emit(AiAgentStreamEvent::Error { message: msg });
    }
    emit(AiAgentStreamEvent::Done);
    Ok(session_id)
}

fn dispatch_gemini_event<F>(json: &serde_json::Value, emit: &mut F)
where
    F: FnMut(AiAgentStreamEvent),
{
    match json["type"].as_str().unwrap_or_default() {
        "init" => {
            if let Some(id) = json["session_id"].as_str() {
                emit(AiAgentStreamEvent::Init { session_id: id.to_string() });
            }
        }
        "message" => {
            if json["role"].as_str() != Some("assistant") { return; }
            if let Some(content) = json["content"].as_str().filter(|c| !c.is_empty()) {
                emit(AiAgentStreamEvent::TextDelta { text: content.to_string() });
            }
        }
        "tool_use" => {
            let tool_name = json["tool_name"].as_str().unwrap_or("Gemini tool");
            let tool_id = json["tool_id"].as_str().unwrap_or(tool_name);
            let input = (!json["parameters"].is_null()).then(|| json["parameters"].to_string());
            emit(AiAgentStreamEvent::ToolStart {
                tool_name: tool_name.to_string(),
                tool_id: tool_id.to_string(),
                input,
            });
        }
        "tool_result" => {
            let tool_id = json["tool_id"].as_str().unwrap_or("gemini-tool");
            let output = json["output"].as_str()
                .or_else(|| json["error"]["message"].as_str())
                .map(str::to_string);
            emit(AiAgentStreamEvent::ToolDone { tool_id: tool_id.to_string(), output });
        }
        "error" => {
            if let Some(msg) = json["message"].as_str() {
                emit(AiAgentStreamEvent::Error { message: msg.to_string() });
            }
        }
        "result" => {
            if json["status"].as_str() == Some("error") {
                if let Some(msg) = json["error"]["message"].as_str() {
                    emit(AiAgentStreamEvent::Error { message: msg.to_string() });
                }
            }
        }
        _ => {}
    }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

fn build_prompt(message: &str, system_prompt: Option<&str>) -> String {
    match system_prompt.map(str::trim).filter(|p| !p.is_empty()) {
        Some(sp) => format!("System instructions:\n{sp}\n\nUser request:\n{message}"),
        None => message.to_string(),
    }
}

fn map_claude_event(event: crate::claude_cli::ClaudeStreamEvent) -> Option<AiAgentStreamEvent> {
    match event {
        crate::claude_cli::ClaudeStreamEvent::Init { session_id } => {
            Some(AiAgentStreamEvent::Init { session_id })
        }
        crate::claude_cli::ClaudeStreamEvent::TextDelta { text } => {
            Some(AiAgentStreamEvent::TextDelta { text })
        }
        crate::claude_cli::ClaudeStreamEvent::ThinkingDelta { text } => {
            Some(AiAgentStreamEvent::ThinkingDelta { text })
        }
        crate::claude_cli::ClaudeStreamEvent::ToolStart { tool_name, tool_id, input } => {
            Some(AiAgentStreamEvent::ToolStart { tool_name, tool_id, input })
        }
        crate::claude_cli::ClaudeStreamEvent::ToolDone { tool_id, output } => {
            Some(AiAgentStreamEvent::ToolDone { tool_id, output })
        }
        crate::claude_cli::ClaudeStreamEvent::Error { message } => {
            Some(AiAgentStreamEvent::Error { message })
        }
        crate::claude_cli::ClaudeStreamEvent::Done => Some(AiAgentStreamEvent::Done),
        crate::claude_cli::ClaudeStreamEvent::Result { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_status_contains_all_agents() {
        let status = get_ai_agents_status();
        assert!(matches!(status.claude_code.installed, true | false));
        assert!(matches!(status.codex.installed, true | false));
        assert!(matches!(status.pi.installed, true | false));
        assert!(matches!(status.gemini.installed, true | false));
    }

    #[test]
    fn build_prompt_keeps_system_prompt_first() {
        let prompt = build_prompt("Rename the note", Some("Be concise"));
        assert!(prompt.starts_with("System instructions:\nBe concise"));
        assert!(prompt.contains("User request:\nRename the note"));
    }

    #[test]
    fn build_prompt_skips_blank_system_prompt() {
        assert_eq!(build_prompt("Hello", Some("  ")), "Hello");
    }
}
