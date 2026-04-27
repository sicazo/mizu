mod calendar;

use calendar::fetcher::{CalEvent, CalendarSync};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_calendar, get_events, sync_calendar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
