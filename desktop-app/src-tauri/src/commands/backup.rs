//! 备份命令：backup_now / list_backups / restore_backup / delete_backup

use crate::database::BackupInfo;
use crate::services::backup_service;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn backup_now(state: State<'_, AppState>, note: String) -> Result<String, String> {
    backup_service::snapshot(&state.db, &note)
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> Result<Vec<BackupInfo>, String> {
    backup_service::list(&state.db)
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, id: String) -> Result<(), String> {
    backup_service::restore(&state.db, &id)
}

#[tauri::command]
pub fn delete_backup(state: State<'_, AppState>, id: String) -> Result<(), String> {
    backup_service::delete(&state.db, &id)
}
