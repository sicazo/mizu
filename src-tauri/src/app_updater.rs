use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Runtime, Url};
use tauri_plugin_updater::UpdaterExt;

const RELEASES_BASE_URL: &str = "https://Sicazo.github.io/mizu";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateMetadata {
    pub current_version: String,
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum AppUpdateDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

fn updater_endpoint() -> Result<Url, String> {
    let endpoint = format!("{}/stable/latest.json", RELEASES_BASE_URL);
    Url::parse(&endpoint).map_err(|e| format!("Invalid updater endpoint: {e}"))
}

fn build_updater<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<tauri_plugin_updater::Updater, String> {
    app_handle
        .updater_builder()
        .endpoints(vec![updater_endpoint()?])
        .map_err(|e| format!("Failed to configure updater endpoint: {e}"))?
        .build()
        .map_err(|e| format!("Failed to build updater: {e}"))
}

fn to_update_metadata(update: tauri_plugin_updater::Update) -> AppUpdateMetadata {
    AppUpdateMetadata {
        current_version: update.current_version,
        version: update.version,
        date: update.date.map(|v| v.to_string()),
        body: update.body,
    }
}

#[tauri::command]
pub async fn check_for_app_update<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Option<AppUpdateMetadata>, String> {
    let updater = build_updater(&app_handle)?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {e}"))?;
    Ok(update.map(to_update_metadata))
}

#[tauri::command]
pub async fn download_and_install_app_update<R: Runtime>(
    app_handle: AppHandle<R>,
    expected_version: String,
    on_event: Channel<AppUpdateDownloadEvent>,
) -> Result<(), String> {
    let updater = build_updater(&app_handle)?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to refresh update metadata: {e}"))?
        .ok_or_else(|| "No update is currently available".to_string())?;

    if update.version != expected_version {
        return Err(format!(
            "Expected update version {}, found {}",
            expected_version, update.version
        ));
    }

    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = on_event.send(AppUpdateDownloadEvent::Started { content_length });
                }
                let _ = on_event.send(AppUpdateDownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(AppUpdateDownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| format!("Failed to download and install update: {e}"))
}
