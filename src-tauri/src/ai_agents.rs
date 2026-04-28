use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AiAgentStatus {
    pub available: bool,
    pub message: String,
}

#[tauri::command]
pub async fn get_ai_agents_status() -> Result<AiAgentStatus, String> {
    Ok(AiAgentStatus {
        available: false,
        message: "AI agents not yet configured".to_string(),
    })
}

#[tauri::command]
pub async fn run_ai_agent_stream(
    _prompt: String,
    _window: tauri::Window,
) -> Result<(), String> {
    Err("AI agent streaming not yet implemented".to_string())
}
