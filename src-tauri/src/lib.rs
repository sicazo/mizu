mod app_updater;
mod calendar;
mod mcp;
mod ai_agents;
mod claude_cli;

use calendar::fetcher::{CalEvent, CalendarSync};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct Assignment {
    id: String,
    course_id: String,
    name: String,
    weight: f64,
    earned: Option<f64>,
    max_score: f64,
    sort_order: i64,
}

fn app_db_url() -> Result<String, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "cannot find data directory".to_string())?
        .join("mizu");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("calendar.db");
    Ok(format!("sqlite://{}?mode=rwc", path.display()))
}

#[tauri::command]
async fn fetch_calendar(url: String) -> Result<Vec<CalEvent>, String> {
    let pool = sqlx::SqlitePool::connect(&app_db_url()?)
        .await
        .map_err(|e| e.to_string())?;

    let syncer = CalendarSync::new(pool, url)
        .await
        .map_err(|e| e.to_string())?;

    syncer.sync().await.map_err(|e| e.to_string())?;
    syncer.events().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_events() -> Result<Vec<CalEvent>, String> {
    let pool = sqlx::SqlitePool::connect(&app_db_url()?)
        .await
        .map_err(|e| e.to_string())?;
    calendar::fetcher::read_events(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_calendar() -> Result<Vec<CalEvent>, String> {
    let pool = sqlx::SqlitePool::connect(&app_db_url()?)
        .await
        .map_err(|e| e.to_string())?;
    calendar::fetcher::sync_from_stored_url(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn grades_load(course_id: String) -> Result<Vec<Assignment>, String> {
    let pool = sqlx::SqlitePool::connect(&app_db_url()?)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let rows = sqlx::query_as::<_, Assignment>(
        "SELECT id, course_id, name, weight, earned, max_score, sort_order
         FROM grade_assignments WHERE course_id = ? ORDER BY sort_order",
    )
    .bind(&course_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Deserialize)]
struct AssignmentInput {
    id: String,
    name: String,
    weight: f64,
    earned: Option<f64>,
    max_score: f64,
}

#[tauri::command]
async fn grades_save(course_id: String, assignments: Vec<AssignmentInput>) -> Result<(), String> {
    let pool = sqlx::SqlitePool::connect(&app_db_url()?)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM grade_assignments WHERE course_id = ?")
        .bind(&course_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (i, a) in assignments.iter().enumerate() {
        sqlx::query(
            "INSERT INTO grade_assignments (id, course_id, name, weight, earned, max_score, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&a.id)
        .bind(&course_id)
        .bind(&a.name)
        .bind(a.weight)
        .bind(a.earned)
        .bind(a.max_score)
        .bind(i as i64)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── MCP commands ────────────────────────────────────────────────────────────────

#[tauri::command]
fn mcp_config_snippet() -> Result<String, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "cannot find data directory".to_string())?
        .join("mizu");
    mcp::mcp_config_snippet(&data_dir.to_string_lossy())
}

#[tauri::command]
fn register_mcp() -> Result<String, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "cannot find data directory".to_string())?
        .join("mizu");
    mcp::register_mcp(&data_dir.to_string_lossy())
}

#[tauri::command]
fn mcp_status() -> String {
    let data_dir = dirs::data_dir()
        .map(|d| d.join("mizu").to_string_lossy().to_string())
        .unwrap_or_default();
    match mcp::check_mcp_status(&data_dir) {
        mcp::McpStatus::Installed => "installed".to_string(),
        mcp::McpStatus::NotInstalled => "not_installed".to_string(),
    }
}

#[tauri::command]
async fn ai_query(prompt: String, course_id: Option<String>) -> Result<String, String> {
    // This broadcasts to the UI which then uses the MCP to call Claude/Codex
    // For now, return a placeholder - the frontend will handle this via WebSocket
    Ok(format!("Query sent: {}", prompt))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            fetch_calendar,
            get_events,
            sync_calendar,
            grades_load,
            grades_save,
            mcp_config_snippet,
            register_mcp,
            mcp_status,
            ai_query,
            app_updater::check_for_app_update,
            app_updater::download_and_install_app_update,
            ai_agents::get_ai_agents_status,
            ai_agents::run_ai_agent_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
