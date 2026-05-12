use crate::ai_agents::AiAgentAvailability;
use std::path::{Path, PathBuf};

pub(crate) fn check_cli() -> AiAgentAvailability {
    match find_binary() {
        Ok(binary) => AiAgentAvailability {
            installed: true,
            version: version_for_binary(&binary),
        },
        Err(_) => AiAgentAvailability {
            installed: false,
            version: None,
        },
    }
}

pub(crate) fn find_binary() -> Result<PathBuf, String> {
    if let Some(binary) = find_binary_on_path() {
        return Ok(binary);
    }
    if let Some(binary) = find_binary_in_user_shell() {
        return Ok(binary);
    }
    if let Some(binary) = find_existing_binary(pi_binary_candidates()) {
        return Ok(binary);
    }
    Err("Pi CLI not found. Install it: https://pi.dev".into())
}

fn find_binary_on_path() -> Option<PathBuf> {
    let cmd = if cfg!(windows) { "where" } else { "which" };
    std::process::Command::new(cmd)
        .arg("pi")
        .output()
        .ok()
        .and_then(|o| path_from_output(&o))
}

fn find_binary_in_user_shell() -> Option<PathBuf> {
    let mut shells = Vec::new();
    if let Some(s) = std::env::var_os("SHELL") {
        if !s.is_empty() {
            shells.push(PathBuf::from(s));
        }
    }
    shells.push(PathBuf::from("/bin/zsh"));
    shells.push(PathBuf::from("/bin/bash"));
    shells
        .into_iter()
        .filter(|s| s.exists())
        .find_map(|shell| shell_command_path(&shell, "pi"))
}

fn shell_command_path(shell: &Path, cmd: &str) -> Option<PathBuf> {
    std::process::Command::new(shell)
        .arg("-lc")
        .arg(format!("command -v {cmd}"))
        .output()
        .ok()
        .and_then(|o| path_from_output(&o))
}

fn path_from_output(output: &std::process::Output) -> Option<PathBuf> {
    if !output.status.success() {
        return None;
    }
    first_existing_path(&String::from_utf8_lossy(&output.stdout))
}

fn first_existing_path(stdout: &str) -> Option<PathBuf> {
    stdout.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }
        let p = PathBuf::from(trimmed);
        p.exists().then_some(p)
    })
}

fn pi_binary_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidates.extend([
            home.join(".local/bin/pi"),
            home.join(".pi/bin/pi"),
            home.join(".local/share/mise/shims/pi"),
            home.join(".asdf/shims/pi"),
            home.join(".npm-global/bin/pi"),
            home.join(".npm/bin/pi"),
            home.join(".bun/bin/pi"),
            home.join(".linuxbrew/bin/pi"),
        ]);
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/pi"),
        PathBuf::from("/usr/local/bin/pi"),
        PathBuf::from("/home/linuxbrew/.linuxbrew/bin/pi"),
    ]);
    candidates
}

fn find_existing_binary(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|p| p.exists())
}

fn version_for_binary(binary: &Path) -> Option<String> {
    std::process::Command::new(binary)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}
