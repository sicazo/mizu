mod calendar;

use calendar::fetcher::{CalEvent, CalendarSync};

#[tauri::command]
async fn fetch_calendar(url: String) -> Result<Vec<CalEvent>, String> {
    let pool = sqlx::SqlitePool::connect("sqlite::memory:")
        .await
        .map_err(|e| e.to_string())?;

    let syncer = CalendarSync::new(pool, url)
        .await
        .map_err(|e| e.to_string())?;

    syncer.sync().await.map_err(|e| e.to_string())?;
    syncer.events().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_calendar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
