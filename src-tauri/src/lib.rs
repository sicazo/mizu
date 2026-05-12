mod app_updater;
mod calendar;
mod mcp;
mod ai_agents;
mod ai_models;
mod claude_cli;
mod pi_discovery;
mod gemini_discovery;

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

    // One-time-ish hygiene: remove duplicated auto-seeded exam rows that can be
    // left behind from older unstable exam IDs.
    sqlx::query(
        "DELETE FROM grade_assignments
         WHERE course_id = ?
           AND id LIKE 'exam-%'
           AND EXISTS (
             SELECT 1
             FROM grade_assignments g2
             WHERE g2.course_id = grade_assignments.course_id
               AND g2.id LIKE 'exam-%'
               AND lower(trim(g2.name)) = lower(trim(grade_assignments.name))
               AND g2.weight = grade_assignments.weight
               AND g2.max_score = grade_assignments.max_score
               AND (
                 (g2.earned IS NULL AND grade_assignments.earned IS NULL)
                 OR g2.earned = grade_assignments.earned
               )
               AND g2.sort_order < grade_assignments.sort_order
           )",
    )
    .bind(&course_id)
    .execute(&pool)
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

// ── Notes (file-based) ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct NoteSummary {
    id: String,
    course_id: String,
    title: String,
    preview: String,
    lecture_num: Option<i64>,
    lecture_date: Option<String>,
    pinned: bool,
    modified_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteDocument {
    id: String,
    course_id: String,
    title: String,
    content: String,
    lecture_num: Option<i64>,
    lecture_date: Option<String>,
    location: Option<String>,
    pinned: bool,
}

#[derive(Debug, Deserialize)]
struct NoteInput {
    id: String,
    course_id: String,
    title: String,
    content: String,
    lecture_num: Option<i64>,
    lecture_date: Option<String>,
    location: Option<String>,
    pinned: bool,
}

// Each note is stored as `<notes_root>/<course_id>/<id>.md` with a YAML frontmatter header.
// The id is the bare filename without extension (a UUID).

fn note_path(notes_root: &str, course_id: &str, id: &str) -> std::path::PathBuf {
    std::path::Path::new(notes_root)
        .join(course_id)
        .join(format!("{id}.md"))
}

fn slugify_title(title: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;

    for ch in title.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }

    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "untitled-note".to_string()
    } else {
        out
    }
}

fn unique_note_id(dir: &std::path::Path, base: &str, current_id: &str) -> String {
    let mut candidate = base.to_string();
    let mut n = 2usize;

    loop {
        let path = dir.join(format!("{candidate}.md"));
        let occupied = path.exists() && candidate != current_id;
        if !occupied {
            return candidate;
        }
        candidate = format!("{base}-{n}");
        n += 1;
    }
}

fn serialize_note(note: &NoteInput) -> String {
    let lecture_num_str = note
        .lecture_num
        .map(|n| format!("\nlecture_num: {n}"))
        .unwrap_or_default();
    let lecture_date_str = note
        .lecture_date
        .as_deref()
        .map(|d| format!("\nlecture_date: {d}"))
        .unwrap_or_default();
    let location_str = note
        .location
        .as_deref()
        .map(|l| format!("\nlocation: {l}"))
        .unwrap_or_default();
    let pinned_str = format!("\npinned: {}", if note.pinned { "true" } else { "false" });
    let title = note.title.replace('\"', "\\\"");
    format!(
        "---\ntitle: \"{title}\"\ncourse_id: {course_id}{lecture_num_str}{lecture_date_str}{location_str}{pinned_str}\n---\n\n{content}",
        course_id = note.course_id,
        content = note.content,
    )
}

fn parse_note_file(
    path: &std::path::Path,
    course_id: &str,
) -> Option<(NoteDocument, String /* modified_at */)> {
    let raw = std::fs::read_to_string(path).ok()?;
    let id = path.file_stem()?.to_string_lossy().to_string();

    // Parse YAML frontmatter
    let (fm_str, body) = if raw.starts_with("---\n") {
        let end = raw[4..].find("\n---\n").map(|i| i + 4);
        match end {
            Some(e) => (&raw[4..e], raw[e + 5..].trim_start().to_string()),
            None => ("", raw.clone()),
        }
    } else {
        ("", raw.clone())
    };

    let mut title = id.clone();
    let mut lecture_num: Option<i64> = None;
    let mut lecture_date: Option<String> = None;
    let mut location: Option<String> = None;
    let mut pinned = false;

    for line in fm_str.lines() {
        if let Some(val) = line.strip_prefix("title:") {
            title = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = line.strip_prefix("lecture_num:") {
            lecture_num = val.trim().parse().ok();
        } else if let Some(val) = line.strip_prefix("lecture_date:") {
            lecture_date = Some(val.trim().to_string());
        } else if let Some(val) = line.strip_prefix("location:") {
            location = Some(val.trim().to_string());
        } else if let Some(val) = line.strip_prefix("pinned:") {
            let v = val.trim().to_ascii_lowercase();
            pinned = v == "true" || v == "yes" || v == "1";
        }
    }

    let modified_at = path
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let secs = t
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            // Format as ISO 8601 (UTC)
            let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(secs as i64, 0)
                .unwrap_or_default();
            dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        })
        .unwrap_or_default();

    Some((
        NoteDocument {
            id,
            course_id: course_id.to_string(),
            title,
            content: body,
            lecture_num,
            lecture_date,
            location,
            pinned,
        },
        modified_at,
    ))
}

#[tauri::command]
fn notes_list_all(notes_root: String) -> Result<Vec<NoteSummary>, String> {
    use walkdir::WalkDir;
    let root = std::path::Path::new(&notes_root);
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut summaries: Vec<(NoteSummary, std::time::SystemTime)> = Vec::new();
    for entry in WalkDir::new(root).min_depth(2).max_depth(2) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        // course_id is the parent folder name
        let course_id = path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if let Some((doc, modified_at)) = parse_note_file(path, &course_id) {
            let mtime = path
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::UNIX_EPOCH);
            let preview: String = doc.content.chars().take(200).collect();
            summaries.push((
                NoteSummary {
                    id: doc.id,
                    course_id: doc.course_id,
                    title: doc.title,
                    preview,
                    lecture_num: doc.lecture_num,
                    lecture_date: doc.lecture_date,
                    pinned: doc.pinned,
                    modified_at,
                },
                mtime,
            ));
        }
    }
    summaries.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(summaries.into_iter().map(|(s, _)| s).collect())
}

#[tauri::command]
fn notes_list(notes_root: String, course_id: String) -> Result<Vec<NoteSummary>, String> {
    let dir = std::path::Path::new(&notes_root).join(&course_id);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut summaries: Vec<(NoteSummary, std::time::SystemTime)> = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        if let Some((doc, modified_at)) = parse_note_file(&path, &course_id) {
            let mtime = path
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::UNIX_EPOCH);
            let preview: String = doc.content.chars().take(200).collect();
            summaries.push((
                NoteSummary {
                    id: doc.id,
                    course_id: doc.course_id,
                    title: doc.title,
                    preview,
                    lecture_num: doc.lecture_num,
                    lecture_date: doc.lecture_date,
                    pinned: doc.pinned,
                    modified_at,
                },
                mtime,
            ));
        }
    }
    summaries.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(summaries.into_iter().map(|(s, _)| s).collect())
}

#[tauri::command]
fn note_get(notes_root: String, id: String, course_id: String) -> Result<NoteDocument, String> {
    let path = note_path(&notes_root, &course_id, &id);
    let (doc, _) = parse_note_file(&path, &course_id)
        .ok_or_else(|| format!("Note not found: {id}"))?;
    Ok(doc)
}

#[tauri::command]
fn note_save(notes_root: String, note: NoteInput) -> Result<String, String> {
    let dir = std::path::Path::new(&notes_root).join(&note.course_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let old_id = note.id.trim();
    let base = slugify_title(&note.title);
    let resolved_id = unique_note_id(&dir, &base, old_id);

    let old_path = note_path(&notes_root, &note.course_id, old_id);
    let new_path = note_path(&notes_root, &note.course_id, &resolved_id);
    let content = serialize_note(&note);

    std::fs::write(&new_path, content).map_err(|e| e.to_string())?;

    if old_path != new_path && old_path.exists() {
        std::fs::remove_file(&old_path).map_err(|e| e.to_string())?;
    }

    Ok(resolved_id)
}

#[tauri::command]
fn note_delete(notes_root: String, id: String, course_id: String) -> Result<(), String> {
    let path = note_path(&notes_root, &course_id, &id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn sanitize_attachment_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
            out.push(ch);
        } else {
            out.push('-');
        }
    }
    let cleaned = out.trim_matches('-').trim_matches('.').to_string();
    if cleaned.is_empty() {
        "attachment".to_string()
    } else {
        cleaned
    }
}

#[tauri::command]
fn note_import_attachment(
    notes_root: String,
    course_id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if notes_root.trim().is_empty() {
        return Err("Notes folder is not configured".to_string());
    }
    if course_id.trim().is_empty() {
        return Err("Course ID is required".to_string());
    }

    let original_name = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment");
    let safe_name = sanitize_attachment_name(original_name);

    let path_name = std::path::Path::new(&safe_name);
    let stem = path_name
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("attachment");
    let ext = path_name.extension().and_then(|e| e.to_str()).unwrap_or("");

    let attachments_dir = std::path::Path::new(&notes_root)
        .join(&course_id)
        .join("attachments");
    std::fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;

    let mut candidate = if ext.is_empty() {
        stem.to_string()
    } else {
        format!("{stem}.{ext}")
    };
    let mut idx = 2usize;
    while attachments_dir.join(&candidate).exists() {
        candidate = if ext.is_empty() {
            format!("{stem}-{idx}")
        } else {
            format!("{stem}-{idx}.{ext}")
        };
        idx += 1;
    }

    let destination = attachments_dir.join(candidate);
    std::fs::write(&destination, bytes).map_err(|e| e.to_string())?;
    Ok(destination.to_string_lossy().to_string())
}

/// Opens a native folder picker and returns the chosen path.
#[tauri::command]
async fn notes_pick_folder(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app_handle
        .dialog()
        .file()
        .set_title("Choose notes folder")
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
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
fn check_claude_cli() -> claude_cli::ClaudeCliStatus {
    claude_cli::check_cli()
}

#[tauri::command]
fn get_ai_agents_status() -> ai_agents::AiAgentsStatus {
    ai_agents::get_ai_agents_status()
}

#[tauri::command]
async fn stream_ai_agent(
    app_handle: tauri::AppHandle,
    request: ai_agents::AiAgentStreamRequest,
) -> Result<String, String> {
    use tauri::Emitter;

    tokio::task::spawn_blocking(move || {
        ai_agents::run_ai_agent_stream(request, |event| {
            let _ = app_handle.emit("ai-agent-stream", &event);
        })
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?
}

#[tauri::command]
async fn ai_query(prompt: String, course_id: Option<String>) -> Result<String, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is empty".to_string());
    }

    let course_prefix = course_id
        .as_deref()
        .filter(|c| !c.is_empty())
        .map(|c| format!("[{c}] "))
        .unwrap_or_default();

    let lowered = prompt.to_lowercase();
    let response = if lowered.contains("quiz") {
        format!(
            "{}Quick quiz mode:\n1) Define the core concept in one sentence.\n2) Give one concrete example.\n3) What mistake is most common here?\n\nReply with your answers and I'll grade them.",
            course_prefix
        )
    } else if lowered.contains("summarize") || lowered.contains("summary") {
        format!(
            "{}Summary template:\n• Main idea\n• 3 key points\n• 1 likely exam question\n• What to review next\n\nIf you want, paste a lecture section and I'll summarize it directly.",
            course_prefix
        )
    } else if lowered.contains("explain") {
        format!(
            "{}Here's a clean explanation path:\n1) intuition\n2) formal definition\n3) worked example\n4) edge cases\n\nTell me the exact topic and I'll walk through it step-by-step.",
            course_prefix
        )
    } else {
        format!(
            "{}Got it: \"{}\"\n\nI can help you by:\n• summarizing lecture chunks\n• generating practice questions\n• explaining topics step-by-step\n\nTry: \"Summarize lecture 11\" or \"Quiz me on this topic\".",
            course_prefix,
            prompt
        )
    };

    Ok(response)
}

// ── AI Model commands ────────────────────────────────────────────────────────

#[tauri::command]
async fn stream_ai_model(
    app_handle: tauri::AppHandle,
    request: ai_models::AiModelStreamRequest,
) -> Result<String, String> {
    use tauri::Emitter;
    tokio::task::spawn_blocking(move || {
        ai_models::run_ai_model_stream(request, |event| {
            let _ = app_handle.emit("ai-agent-stream", &event);
        })
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?
}

#[tauri::command]
async fn save_provider_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ai_models::save_provider_api_key(provider_id, api_key))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
}

#[tauri::command]
async fn delete_provider_api_key(provider_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ai_models::delete_provider_api_key(provider_id))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
}

#[tauri::command]
async fn test_ai_model_provider(
    request: ai_models::AiModelProviderTestRequest,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || ai_models::test_ai_model_provider(request))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            check_claude_cli,
            get_ai_agents_status,
            stream_ai_agent,
            ai_query,
            stream_ai_model,
            save_provider_api_key,
            delete_provider_api_key,
            test_ai_model_provider,
            app_updater::check_for_app_update,
            app_updater::download_and_install_app_update,
            notes_list_all,
            notes_list,
            note_get,
            note_save,
            note_delete,
            note_import_attachment,
            notes_pick_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
