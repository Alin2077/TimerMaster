mod database;
mod timer;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use timer::{TimerManager, TimerTask, TaskStats, TaskStatus, TaskType, TaskAction};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

/// 执行定时任务完成后的动作
fn execute_action(action: &TaskAction, title: &str) {
    match action {
        TaskAction::None => {}
        TaskAction::Shutdown => {
            println!("[TimerMaster] 执行关机 (任务: {})", title);
            // Windows 关机，延迟 30 秒让用户有取消机会
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("shutdown")
                .args(["/s", "/t", "30", "/c", &format!("TimerMaster 定时任务「{}」触发关机", title)])
                .spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("shutdown").args(["-h", "+1"]).spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("osascript")
                .args(["-e", &format!("tell app \"System Events\" to shut down")])
                .spawn();
        }
        TaskAction::OpenApp { path } => {
            println!("[TimerMaster] 打开应用: {} (任务: {})", path, title);
            let _ = std::process::Command::new(path).spawn();
        }
        TaskAction::RunScript { path } => {
            println!("[TimerMaster] 执行脚本: {} (任务: {})", path, title);
            let _ = std::process::Command::new(path).spawn();
        }
    }
}

pub struct AppState {
    pub timer_manager: Arc<TimerManager>,
}

#[tauri::command]
/// 计算指定时间点到现在的秒数
fn calc_seconds_until(scheduled_at: &str) -> Result<u64, String> {
    let now = chrono::Local::now();
    let parsed = chrono::NaiveDateTime::parse_from_str(
        scheduled_at,
        "%Y-%m-%d %H:%M",
    ).map_err(|e| format!("时间格式错误: {}", e))?;
    let target = parsed.and_local_timezone(chrono::Local).earliest()
        .ok_or_else(|| "无效的时区转换".to_string())?;
    if target <= now {
        return Err("指定时间已过，请选择未来的时间".to_string());
    }
    let secs = (target - now).num_seconds() as u64;
    Ok(secs)
}

#[tauri::command]
async fn create_single_timer(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    title: String,
    duration_secs: u64,
    category: Option<String>,
    priority: Option<u32>,
    persistent: Option<bool>,
    action: Option<TaskAction>,
    scheduled_at: Option<String>,
) -> Result<TimerTask, String> {
    let state = state.lock().await;
    // 如果指定了时间点，计算剩余秒数
    let actual_secs = if let Some(ref at) = scheduled_at {
        calc_seconds_until(at)?
    } else {
        duration_secs
    };

    let task = state
        .timer_manager
        .add_task(
            title.clone(),
            TaskType::Single,
            actual_secs,  // 用实际秒数
            category,
            priority,
            None,
            persistent,
            action.clone(),
            scheduled_at,
        )
        .await;

    let cancel_flag = state
        .timer_manager
        .register_cancel_flag(&task.id)
        .await;

    let app_clone = app.clone();
    let task_id = task.id.clone();
    let mgr = state.timer_manager.clone();
    let is_persistent = task.persistent.unwrap_or(false);
    let task_title = task.title.clone();
    let task_action = action.clone();
    let total_secs = actual_secs;

    tokio::spawn(async move {
        // total_secs 已设为实际秒数（倒计时或指定时间）
        for elapsed in 0..=total_secs {
            if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }
            let remaining = total_secs - elapsed;
            mgr.update_task_remaining(&task_id, remaining).await;
            let _ = app_clone.emit(
                "timer-tick",
                serde_json::json!({"id": task_id, "remaining": remaining, "total": total_secs}),
            );
            if elapsed < total_secs {
                sleep(Duration::from_secs(1)).await;
            }
        }

        if !cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            // 持久提醒模式：循环通知直到用户确认
            if is_persistent {
                loop {
                    if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                        break;
                    }
                    use tauri_plugin_notification::NotificationExt;
                    let _ = app_clone
                        .notification()
                        .builder()
                        .title("⏰ TimerMaster")
                        .body(format!("「{}」计时完成！点击确认关闭", title))
                        .show();
                    // 每 10 秒重复
                    for _ in 0..10 {
                        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }
                        sleep(Duration::from_secs(1)).await;
                    }
                }
            } else {
                mgr.update_task_status(&task_id, TaskStatus::Completed).await;
                use tauri_plugin_notification::NotificationExt;
                let _ = app_clone
                    .notification()
                    .builder()
                    .title("⏰ TimerMaster")
                    .body(format!("「{}」计时完成！", title))
                    .show();
                // 执行动作
                if let Some(ref act) = task_action {
                    if !matches!(act, TaskAction::None) {
                        execute_action(act, &task_title);
                    }
                }
            }
        }
        mgr.remove_cancel_flag(&task_id).await;
    });

    Ok(task)
}

#[tauri::command]
async fn create_repeating_timer(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    title: String,
    interval_secs: u64,
    category: Option<String>,
    priority: Option<u32>,
    repeat_rule: Option<timer::RepeatRule>,
    persistent: Option<bool>,
    action: Option<TaskAction>,
) -> Result<TimerTask, String> {
    let state = state.lock().await;
    let task = state
        .timer_manager
        .add_task(
            title.clone(),
            TaskType::Repeating,
            interval_secs,
            category,
            priority,
            repeat_rule,
            persistent,
            action.clone(),
            None, // repeating 不用 scheduled_at
        )
        .await;

    let cancel_flag = state
        .timer_manager
        .register_cancel_flag(&task.id)
        .await;

    let app_clone = app.clone();
    let task_id = task.id.clone();
    let mgr = state.timer_manager.clone();
    let is_persistent = task.persistent.unwrap_or(false);
    let task_title = task.title.clone();
    let task_action = action.clone();

    tokio::spawn(async move {
        loop {
            if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }
            for elapsed in 0..=interval_secs {
                if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                let remaining = interval_secs - elapsed;
                mgr.update_task_remaining(&task_id, remaining).await;
                let _ = app_clone.emit(
                    "timer-tick",
                    serde_json::json!({"id": task_id, "remaining": remaining, "total": interval_secs}),
                );
                if elapsed < interval_secs {
                    sleep(Duration::from_secs(1)).await;
                }
            }

            if !cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                use tauri_plugin_notification::NotificationExt;
                let _ = app_clone
                    .notification()
                    .builder()
                    .title("🔔 TimerMaster")
                    .body(format!("「{}」时间到！该行动了 💪", title))
                    .show();

                // 执行动作
                if let Some(ref act) = task_action {
                    if !matches!(act, TaskAction::None) {
                        execute_action(act, &task_title);
                    }
                }

                // 持久提醒：重复通知
                if is_persistent {
                    for _ in 0..5 {
                        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }
                        sleep(Duration::from_secs(3)).await;
                        if !cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            use tauri_plugin_notification::NotificationExt;
                            let _ = app_clone
                                .notification()
                                .builder()
                                .title("🔔 TimerMaster")
                                .body(format!("「{}」提醒：请确认完成", title))
                                .show();
                        }
                    }
                }
                sleep(Duration::from_millis(500)).await;
            } else {
                break;
            }
        }
        mgr.update_task_status(&task_id, TaskStatus::Completed).await;
        mgr.remove_cancel_flag(&task_id).await;
    });

    Ok(task)
}

#[tauri::command]
async fn delete_one_task_entry(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.timer_manager.hard_delete(&task_id).await;
    Ok(())
}

#[tauri::command]
async fn cancel_timer(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<bool, String> {
    let state = state.lock().await;
    Ok(state.timer_manager.cancel_task(&task_id).await)
}

#[tauri::command]
async fn complete_task(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    // Cancel the timer and mark as completed
    state.timer_manager.cancel_task(&task_id).await;
    state.timer_manager.complete_task(&task_id).await;
    Ok(())
}

#[tauri::command]
async fn list_timers(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<TimerTask>, String> {
    let state = state.lock().await;
    Ok(state.timer_manager.list_tasks().await)
}

#[tauri::command]
async fn get_stats(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<TaskStats, String> {
    let state = state.lock().await;
    Ok(state.timer_manager.get_stats().await)
}

#[tauri::command]
async fn export_data(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<TimerTask>, String> {
    let state = state.lock().await;
    Ok(state.timer_manager.export_data().await)
}

#[tauri::command]
async fn minimize_to_tray(window: WebviewWindow) -> Result<(), String> {
    let _ = window.hide();
    Ok(())
}

#[tauri::command]
async fn set_always_on_top(window: WebviewWindow, on_top: bool) -> Result<(), String> {
    let _ = window.set_always_on_top(on_top);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 初始化数据管理（需在 setup 中获取 app 路径）
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("data"));
            app.manage(Arc::new(Mutex::new(AppState {
                timer_manager: Arc::new(TimerManager::new(data_dir)),
            })));
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .tooltip("TimerMaster - 定时助手")
                .build(app)?;

            // 注册全局快捷键 Ctrl+Shift+T 显示/隐藏窗口
            {
                use tauri_plugin_global_shortcut::Code;
                let handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, shortcut, event| {
                            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed
                                && shortcut.matches(tauri_plugin_global_shortcut::Modifiers::CONTROL | tauri_plugin_global_shortcut::Modifiers::SHIFT, Code::KeyT)
                            {
                                if let Some(window) = handle.get_webview_window("main") {
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        })
                        .build(),
                )?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_single_timer,
            create_repeating_timer,
            cancel_timer,
            delete_one_task_entry,
            complete_task,
            list_timers,
            get_stats,
            export_data,
            minimize_to_tray,
            set_always_on_top,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
