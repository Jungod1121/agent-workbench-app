//! 设置命令：set_window_theme（同步原生标题栏主题）

#[tauri::command]
pub fn set_window_theme(theme: String) -> Result<(), String> {
    log::info!("set_window_theme: {}", theme);
    Ok(())
}
