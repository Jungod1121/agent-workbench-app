//! 更新命令：check_for_updates / install_update（tauri-plugin-updater 真检查）

use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    log::info!("check_for_updates requested");
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;
    match updater.check().await {
        Ok(Some(update)) => {
            log::info!("update available: {}", update.version);
            Ok(serde_json::json!({
                "available": true,
                "version": update.version,
                "notes": update.body,
            }))
        }
        Ok(None) => {
            log::info!("already up to date");
            Ok(serde_json::json!({ "available": false }))
        }
        Err(e) => {
            log::warn!("update check failed: {e}");
            Err(format!("检查更新失败: {e}"))
        }
    }
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<String, String> {
    log::info!("install_update requested");
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;
    match updater.check().await {
        Ok(Some(update)) => {
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| format!("安装失败: {e}"))?;
            log::info!("update installed");
            Ok("installed".to_string())
        }
        Ok(None) => Ok("up_to_date".to_string()),
        Err(e) => Err(format!("检查更新失败: {e}")),
    }
}