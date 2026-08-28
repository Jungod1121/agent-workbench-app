use tauri::{Emitter, Manager};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_window_state::StateFlags;

#[cfg(target_os = "macos")]
use tauri::image::Image;

const TRAY_ID: &str = "main-tray";

fn handle_deeplink_url(app: &tauri::AppHandle, url: &str) -> bool {
    if !url.starts_with("agentworkbench://") {
        return false;
    }
    log::info!("Deep link: {url}");
    // 解析后发射给前端，前端监听 deeplink-import
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

    // 深度链接
    builder = builder.plugin(tauri_plugin_deep_link::init());

    // 窗口关闭 -> 隐藏到托盘（保留后台），与 CC Switch minimize_to_tray 思路一致但简化为总是隐藏
    builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // 仅主窗口拦截，隐藏到托盘而非退出，用户可托盘 Quit 真正退出
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
        .setup(|app| {
            // Windows AppUserModelID
            #[cfg(target_os = "windows")]
            set_windows_app_user_model_id(app.handle());

            // 日志：落盘到 app_config_dir/logs
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

            // Updater：桌面端才注册，pubkey 无效时仅 warn 不崩
            #[cfg(desktop)]
            {
                if let Err(e) = app.handle().plugin(tauri_plugin_updater::Builder::new().build()) {
                    log::warn!("Updater init skipped: {e}");
                }
            }

            // 深度链接注册 & 回调
            {
                // 注册 schemes（已在 tauri.conf 声明，此处仅订阅事件）
                app.deep_link().on_open_url({
                    let handle = app.handle().clone();
                    move |event| {
                        for url in event.urls() {
                            handle_deeplink_url(&handle, url.as_str());
                        }
                    }
                });
                // 处理启动参数中的 deeplink（Windows/Linux）
                for arg in std::env::args() {
                    handle_deeplink_url(app.handle(), &arg);
                }
            }

            // 托盘：Show + 阶段快切（对标 CC Switch 托盘 Provider 快切）+ 退出
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
                    // 使用模板图标适配深浅色，若不存在则回退默认图标
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

            // 主窗口：Overlay 需显式 show（visible:false）
            if let Some(w) = app.get_webview_window("main") {
                // 延迟 show 确保前端已就绪，避免白屏；与 CC Switch 窗口显示时机一致
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
