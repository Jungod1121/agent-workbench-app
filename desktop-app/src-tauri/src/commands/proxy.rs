//! 代理命令：get_proxy_status / start_proxy / stop_proxy / set_proxy_upstream

use crate::services::proxy_service::{ProxyState, ProxyStatus};
use tauri::State;

#[tauri::command]
pub fn get_proxy_status(state: State<'_, ProxyState>) -> Result<ProxyStatus, String> {
    Ok(state.get_status())
}

#[tauri::command]
pub async fn start_proxy(state: State<'_, ProxyState>, upstream: String) -> Result<ProxyStatus, String> {
    state.start(upstream).await
}

#[tauri::command]
pub async fn stop_proxy(state: State<'_, ProxyState>) -> Result<(), String> {
    state.stop().await
}

#[tauri::command]
pub async fn set_proxy_upstream(state: State<'_, ProxyState>, upstream: String) -> Result<ProxyStatus, String> {
    let st = state.get_status();
    if st.is_running {
        state.stop().await.ok();
        state.start(upstream).await
    } else {
        state.set_upstream(upstream.clone());
        Ok(state.get_status())
    }
}
