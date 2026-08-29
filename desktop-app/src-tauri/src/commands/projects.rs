//! 项目命令：get_projects / save_projects / export / import（签名与行为与重构前完全一致）

use crate::database::Project;
use crate::services::project_service;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn get_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    project_service::list_all(&state.db)
}

#[tauri::command]
pub fn save_projects(state: State<'_, AppState>, projects: Vec<Project>) -> Result<(), String> {
    project_service::save_all(&state.db, projects)
}

#[tauri::command]
pub fn export_projects_to_file(path: String, projects: Vec<Project>) -> Result<(), String> {
    project_service::export_to_file(std::path::Path::new(&path), &projects)
}

#[tauri::command]
pub fn import_projects_from_file(path: String) -> Result<Vec<Project>, String> {
    project_service::import_from_file(std::path::Path::new(&path))
}
