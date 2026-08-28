use tauri::{Emitter, Manager, State};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

#[cfg(target_os = "macos")]
use tauri::image::Image;

mod db;
mod proxy;
use db::{BackupInfo, Database, Project};
use proxy::{ProxyState, ProxyStatus};

const TRAY_ID: &str = "main-tray";

struct AppState {
    db: Database,
}

// ---- Tauri commands: DB / backup (W1) ----
#[tauri::command]
fn get_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    state.db.get_all_projects()
}

#[tauri::command]
fn save_projects(state: State<'_, AppState>, projects: Vec<Project>) -> Result<(), String> {
    state.db.save_all_projects(projects)
}

#[tauri::command]
fn backup_now(state: State<'_, AppState>, note: String) -> Result<String, String> {
    state.db.backup_now(&note)
}

#[tauri::command]
fn list_backups(state: State<'_, AppState>) -> Result<Vec<BackupInfo>, String> {
    state.db.list_backups()
}

#[tauri::command]
fn restore_backup(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.restore_backup(&id)
}

#[tauri::command]
fn delete_backup(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_backup(&id)
}

#[tauri::command]
fn set_window_theme(theme: String) -> Result<(), String> {
    log::info!("set_window_theme: {}", theme);
    Ok(())
}

#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    let url = if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else {
        format!("https://{url}")
    };
    app.opener()
        .open_url(&url, None::<String>)
        .map_err(|e| format!("打开链接失败: {e}"))?;
    Ok(true)
}

// ---- W2: Proxy minimal (对标 CC Switch proxyApi) ----
#[tauri::command]
fn get_proxy_status(state: State<'_, ProxyState>) -> Result<ProxyStatus, String> {
    Ok(state.get_status())
}

#[tauri::command]
async fn start_proxy(state: State<'_, ProxyState>, upstream: String) -> Result<ProxyStatus, String> {
    state.start(upstream).await
}

#[tauri::command]
async fn stop_proxy(state: State<'_, ProxyState>) -> Result<(), String> {
    state.stop().await
}

#[tauri::command]
async fn set_proxy_upstream(state: State<'_, ProxyState>, upstream: String) -> Result<ProxyStatus, String> {
    let st = state.get_status();
    if st.is_running {
        state.stop().await.ok();
        state.start(upstream).await
    } else {
        state.set_upstream(upstream.clone());
        Ok(state.get_status())
    }
}

#[tauri::command]
fn export_projects_to_file(path: String, projects: Vec<Project>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&serde_json::json!({"projects": projects})).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_projects_from_file(path: String) -> Result<Vec<Project>, String> {
    let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    let projects: Vec<Project> = v
        .get("projects")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(projects)
}

fn fallback_config_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("agent-workbench")
}

fn handle_deeplink_url(app: &tauri::AppHandle, url: &str) -> bool {
    if !url.starts_with("agentworkbench://") {
        return false;
    }
    log::info!("Deep link: {url}");
    if let Err(e) = app.emit("deeplink-import", url.to_string()) {
        log::error!("emit deeplink-import failed: {e}");
    } else {
        log::info!("emitted deeplink-import");
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    true
}

#[cfg(target_os = "windows")]
fn set_windows_app_user_model_id(app: &tauri::AppHandle) {
    let app_id = app.config().identifier.clone();
    let wide: Vec<u16> = app_id.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let r = windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
        if r < 0 {
            log::warn!("SetCurrentProcessExplicitAppUserModelID failed: 0x{r:08X}");
        }
    }
}

fn window_state_flags() -> StateFlags {
    StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            log::info!("single-instance second launch: {:?}", args);
            for arg in &args {
                if handle_deeplink_url(app, arg) {
                    break;
                }
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }

    builder = builder.plugin(tauri_plugin_deep_link::init());

    builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if window.label() == "main" {
                api.prevent_close();
                let _ = window.hide();
                #[cfg(target_os = "windows")]
                {
                    let _ = window.set_skip_taskbar(true);
                }
            }
        }
    });

    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_projects,
            save_projects,
            backup_now,
            list_backups,
            restore_backup,
            delete_backup,
            set_window_theme,
            open_external,
            get_proxy_status,
            start_proxy,
            stop_proxy,
            set_proxy_upstream,
            export_projects_to_file,
            import_projects_from_file
        ])
        .setup(|app| {
            // W2: Proxy state
            app.manage(ProxyState::default());
            // ---- W1: SQLite 初始化（对标 CC Switch Database::init） ----
            {
                let config_dir = app
                    .path()
                    .app_config_dir()
                    .unwrap_or_else(|_| fallback_config_dir());
                match Database::init(config_dir) {
                    Ok(db) => {
                        app.manage(AppState { db });
                        log::info!("Database managed");
                    }
                    Err(e) => {
                        log::error!("Database init failed: {e}");
                        let tmp = std::env::temp_dir().join("agent-workbench-fallback.db");
                        let fallback_dir = tmp.parent().unwrap().to_path_buf();
                        let _ = std::fs::create_dir_all(&fallback_dir);
                        // tmp 是文件路径，需要传其父目录
                        if let Ok(db) = Database::init(fallback_dir) {
                            app.manage(AppState { db });
                        }
                    }
                }
            }

            #[cfg(target_os = "windows")]
            set_windows_app_user_model_id(app.handle());

            {
                use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
                let log_dir = app.path().app_config_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).join("logs");
                let _ = std::fs::create_dir_all(&log_dir);
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .targets([
                            Target::new(TargetKind::Stdout),
                            Target::new(TargetKind::Folder { path: log_dir, file_name: Some("agent-workbench".into()) }),
                        ])
                        .rotation_strategy(RotationStrategy::KeepSome(3))
                        .max_file_size(10 * 1024 * 1024)
                        .timezone_strategy(TimezoneStrategy::UseLocal)
                        .build(),
                );
                log::info!("Agent Workbench v{} started", env!("CARGO_PKG_VERSION"));
            }

            #[cfg(desktop)]
            {
                if let Err(e) = app.handle().plugin(tauri_plugin_updater::Builder::new().build()) {
                    log::warn!("Updater init skipped: {e}");
                }
            }

            {
                app.deep_link().on_open_url({
                    let handle = app.handle().clone();
                    move |event| {
                        for url in event.urls() {
                            handle_deeplink_url(&handle, url.as_str());
                        }
                    }
                });
                for arg in std::env::args() {
                    handle_deeplink_url(app.handle(), &arg);
                }
            }

            {
                let menu = {
                    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
                    let show = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
                    let sep1 = PredefinedMenuItem::separator(app)?;
                    let s_all = MenuItemBuilder::with_id("stage_all", "全部").build(app)?;
                    let s_idea = MenuItemBuilder::with_id("stage_idea", "构思中").build(app)?;
                    let s_building = MenuItemBuilder::with_id("stage_building", "开发中").build(app)?;
                    let s_testing = MenuItemBuilder::with_id("stage_testing", "测试中").build(app)?;
                    let s_live = MenuItemBuilder::with_id("stage_live", "已上线").build(app)?;
                    let s_paused = MenuItemBuilder::with_id("stage_paused", "已暂停").build(app)?;
                    let sep2 = PredefinedMenuItem::separator(app)?;
                    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                    MenuBuilder::new(app)
                        .items(&[&show, &sep1, &s_all, &s_idea, &s_building, &s_testing, &s_live, &s_paused, &sep2, &quit])
                        .build()?
                };
                let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
                    .tooltip("Agent Workbench")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { .. } | TrayIconEvent::DoubleClick { .. } = event {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = w.unminimize();
                            }
                        }
                    })
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "stage_all" => { let _ = app.emit("stage-switch", "all"); if let Some(w)=app.get_webview_window("main"){ let _=w.show(); let _=w.set_focus(); } },
                        "stage_idea" => { let _ = app.emit("stage-switch", "idea"); if let Some(w)=app.get_webview_window("main"){ let _=w.show(); let _=w.set_focus(); } },
                        "stage_building" => { let _ = app.emit("stage-switch", "building"); if let Some(w)=app.get_webview_window("main"){ let _=w.show(); let _=w.set_focus(); } },
                        "stage_testing" => { let _ = app.emit("stage-switch", "testing"); if let Some(w)=app.get_webview_window("main"){ let _=w.show(); let _=w.set_focus(); } },
                        "stage_live" => { let _ = app.emit("stage-switch", "live"); if let Some(w)=app.get_webview_window("main"){ let _=w.show(); let _=w.set_focus(); } },
                        "stage_paused" => { let _ = app.emit("stage-switch", "paused"); if let Some(w)=app.get_webview_window("main"){ let _=w.show(); let _=w.set_focus(); } },
                        "quit" => app.exit(0),
                        _ => {}
                    });

                #[cfg(target_os = "macos")]
                {
                    const ICON: &[u8] = include_bytes!("../icons/icon.png");
                    if let Ok(img) = Image::from_bytes(ICON) {
                        tray_builder = tray_builder.icon(img).icon_as_template(true);
                    } else if let Some(icon) = app.default_window_icon().cloned() {
                        tray_builder = tray_builder.icon(icon);
                    }
                }
                #[cfg(not(target_os = "macos"))]
                {
                    if let Some(icon) = app.default_window_icon().cloned() {
                        tray_builder = tray_builder.icon(icon);
                    }
                }
                let _ = tray_builder.build(app)?;
            }

            if let Some(w) = app.get_webview_window("main") {
                let win = w.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                    let _ = win.show();
                    let _ = win.set_focus();
                });
            }

            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running Agent Workbench");
}
