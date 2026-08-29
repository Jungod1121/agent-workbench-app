//! 系统命令：open_external / report_frontend / frontend_ready

use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn open_external(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    log::info!("open_external called: {}", url);
    let url = if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else {
        format!("https://{url}")
    };
    log::info!("open_external opening: {}", url);
    let res = app
        .opener()
        .open_url(&url, None::<String>)
        .map_err(|e| format!("打开链接失败: {e}"));
    log::info!("open_external result: {:?}", res);
    res?;
    Ok(true)
}

#[tauri::command]
pub fn report_frontend(msg: String) -> Result<(), String> {
    log::info!("[frontend] {}", msg);
    Ok(())
}

// 前端就绪握手：前端完成首帧渲染后直接调用（隐藏窗口下 WKWebView 不跑 rAF，
// 不能等 rAF），此时 show 窗口；前端在 show 成功后再用双重 rAF 强制重绘一帧
#[tauri::command]
pub fn frontend_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    log::info!("frontend_ready received, showing window");
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
