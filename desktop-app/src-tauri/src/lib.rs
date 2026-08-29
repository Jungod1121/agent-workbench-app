//! Agent Workbench — 应用装配层
//! 只做：插件注册、命令注册、托盘/深链/窗口事件接线。
//! 业务逻辑在 services/，SQL 在 database/，命令薄封装在 commands/。

mod commands;
mod database;
mod services;

use database::Database;
use services::proxy_service::ProxyState;
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_window_state::StateFlags;

#[cfg(target_os = "macos")]
use tauri::image::Image;

const TRAY_ID: &str = "main-tray";

pub struct AppState {
    db: Database,
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
            commands::projects::get_projects,
            commands::projects::save_projects,
            commands::projects::export_projects_to_file,
            commands::projects::import_projects_from_file,
            commands::backup::backup_now,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            commands::backup::delete_backup,
            commands::settings::set_window_theme,
            commands::system::open_external,
            commands::system::report_frontend,
            commands::system::frontend_ready,
            commands::proxy::get_proxy_status,
            commands::proxy::start_proxy,
            commands::proxy::stop_proxy,
            commands::proxy::set_proxy_upstream
        ])
        .setup(|app| {
            // Proxy state
            app.manage(ProxyState::default());
            // ---- SQLite 初始化 ----
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
                        let fallback_dir = std::env::temp_dir().join("agent-workbench");
                        let _ = std::fs::create_dir_all(&fallback_dir);
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
                            Target::new(TargetKind::Webview),
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

            // 窗口显示改为事件驱动：等待前端 frontend_ready 再 show，
            // 避免 WKWebView 在窗口隐藏期插入的 DOM 不参与首次合成。
            // 兜底：4 秒内前端未就绪则强制显示，避免白屏假死。
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                    if let Some(w) = handle.get_webview_window("main") {
                        let visible = w.is_visible().unwrap_or(true);
                        if !visible {
                            log::warn!("frontend_ready not received within 4s, fallback show");
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                });
            }

            Ok(())
        });

    builder
        .build(tauri::generate_context!())
        .expect("error while building Agent Workbench")
        .run(|app_handle, event| {
            // macOS：点 Dock 图标重新唤起被隐藏的主窗口（RunEvent::Reopen）
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(w) = app_handle.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                    let _ = w.unminimize();
                }
            }
        });
}
