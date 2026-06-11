mod database;
mod timer;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::io::AsyncWriteExt;
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
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("cmd")
                .args(["/c", "start", "", path]).spawn();
            #[cfg(not(target_os = "windows"))]
            let _ = std::process::Command::new(path).spawn();
        }
        TaskAction::RunScript { path } => {
            println!("[TimerMaster] 执行脚本: {} (任务: {})", path, title);
            let lower = path.to_lowercase();
            #[cfg(target_os = "windows")]
            if lower.ends_with(".ps1") {
                // PowerShell 脚本：绕过执行策略
                let _ = std::process::Command::new("powershell.exe")
                    .args(["-ExecutionPolicy", "Bypass", "-File", path])
                    .spawn();
            } else if lower.ends_with(".py") {
                // Python 脚本：优先用 py 启动器，不行再试 python
                let r = std::process::Command::new("py").arg(path).spawn();
                if r.is_err() {
                    let _ = std::process::Command::new("python").arg(path).spawn();
                }
            } else {
                // .bat / .cmd / .vbs / .js 等
                let _ = std::process::Command::new("cmd")
                    .args(["/c", "start", "", path]).spawn();
            }
            #[cfg(not(target_os = "windows"))]
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
    let repeat_clone = repeat_rule.clone();
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
            // 倒计时阶段
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

                // 间隔等待：倒计时完成后等待用户设定的间隔再进入下一轮
                if let Some(timer::RepeatRule::Interval { interval_minutes }) = &repeat_clone {
                    let gap_secs = *interval_minutes * 60;
                    for i in 0..gap_secs {
                        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }
                        // 间隔中也发射剩余时间，让 UI 显示等待倒计时
                        let remaining = gap_secs - i;
                        let _ = app_clone.emit(
                            "timer-tick",
                            serde_json::json!({"id": task_id, "remaining": remaining, "total": interval_secs}),
                        );
                        sleep(Duration::from_secs(1)).await;
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
async fn pause_timer(
    _app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.timer_manager.pause_task(&task_id).await;
    Ok(())
}

#[tauri::command]
async fn resume_timer(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    let tasks = state.timer_manager.list_tasks().await;
    let task = tasks.into_iter().find(|t| t.id == task_id)
        .ok_or_else(|| "任务不存在".to_string())?;

    let remaining = task.remaining_secs;
    if remaining == 0 { return Err("任务已完成".to_string()); }

    state.timer_manager.update_task_status(&task_id, TaskStatus::Running).await;

    let app_c = app.clone();
    let mgr = state.timer_manager.clone();
    let tid = task_id.clone();
    let ttl = task.title.clone();
    let act = task.action.clone();
    let cancel = state.timer_manager.register_cancel_flag(&tid).await;

    tokio::spawn(async move {
        for elapsed in 0..=remaining {
            if cancel.load(std::sync::atomic::Ordering::SeqCst) { break; }
            let r = remaining - elapsed;
            mgr.update_task_remaining(&tid, r).await;
            let _ = app_c.emit("timer-tick",
                serde_json::json!({"id": tid, "remaining": r, "total": remaining}));
            if elapsed < remaining { tokio::time::sleep(Duration::from_secs(1)).await; }
        }
        mgr.update_task_status(&tid, TaskStatus::Completed).await;
        use tauri_plugin_notification::NotificationExt;
        let _ = app_c.notification().builder()
            .title("⏰ TimerMaster")
            .body(format!("「{}」计时完成！", ttl)).show();
        if let Some(ref a) = act {
            if !matches!(a, TaskAction::None) { execute_action(a, &ttl); }
        }
    });

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
async fn json_import_cmd(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    json_data: String,
) -> Result<(usize, usize), String> {
    let tasks: Vec<TimerTask> = serde_json::from_str(&json_data)
        .map_err(|e| format!("JSON 格式错误: {}", e))?;
    let state = state.lock().await;
    Ok(state.timer_manager.import_tasks(tasks).await)
}

#[tauri::command]
async fn get_import_tpl() -> Result<String, String> {
    let template = r#"[
  {
    "title": "喝水提醒",
    "type": "repeating",
    "duration_secs": 1800,
    "remaining_secs": 1800,
    "status": "running",
    "category": "休息",
    "repeat_rule": { "interval": { "interval_minutes": 30 } },
    "persistent": false
  },
  {
    "title": "下班关机",
    "type": "single",
    "duration_secs": 28800,
    "remaining_secs": 28800,
    "status": "running",
    "category": "工作",
    "action": "shutdown"
  },
  {
    "title": "周三例会",
    "type": "single",
    "duration_secs": 900,
    "remaining_secs": 900,
    "status": "running",
    "category": "工作",
    "scheduled_at": "2026-06-17 14:00"
  }
]"#;
    Ok(template.to_string())
}

/// 列出 Windows 已安装的软件（通过注册表）
#[cfg(target_os = "windows")]
fn read_installed_from_reg(key_path: &str) -> Vec<(String, String)> {
    use winreg::enums::*;
    use winreg::RegKey;
    let mut apps = Vec::new();
    let base = match key_path.starts_with("HKLM") {
        true => RegKey::predef(HKEY_LOCAL_MACHINE),
        false => RegKey::predef(HKEY_CURRENT_USER),
    };
    let sub_path = key_path.trim_start_matches("HKLM\\").trim_start_matches("HKCU\\");
    if let Ok(enum_key) = base.open_subkey_with_flags(sub_path, KEY_READ) {
        for name in enum_key.enum_keys().filter_map(|k| k.ok()) {
            if let Ok(sub) = enum_key.open_subkey_with_flags(&name, KEY_READ) {
                let display_name: Option<String> = sub.get_value("DisplayName").ok();
                let display_icon: Option<String> = sub.get_value("DisplayIcon").ok();
                let install_loc: Option<String> = sub.get_value("InstallLocation").ok();
                if let Some(dn) = display_name {
                    let path = display_icon
                        .or(install_loc)
                        .unwrap_or_default()
                        .trim_matches('"')
                        .to_string();
                    if !path.is_empty() {
                        apps.push((dn, path));
                    }
                }
            }
        }
    }
    apps
}

#[tauri::command]
async fn list_installed_apps() -> Result<Vec<(String, String)>, String> {
    #[cfg(not(target_os = "windows"))]
    return Ok(vec![]);
    #[cfg(target_os = "windows")]
    {
        let mut apps = Vec::new();
        // 64-bit 软件
        apps.extend(read_installed_from_reg(
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
        ));
        // 32-bit 软件
        apps.extend(read_installed_from_reg(
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        ));
        // 用户安装
        apps.extend(read_installed_from_reg(
            r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
        ));
        // 去重（按路径去重，保留第一个）
        let mut seen = std::collections::HashSet::new();
        apps.retain(|(_, p)| seen.insert(p.clone()));
        // 按名称排序
        apps.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
        Ok(apps)
    }
}

#[tauri::command]
async fn download_update(
    app: AppHandle,
    version: String,
) -> Result<(), String> {
    let url = format!(
        "https://github.com/Alin2077/TimerMaster/releases/download/v{version}/TimerMaster_{version}_x64-setup.exe",
        version = version
    );
    let filename = format!("TimerMaster_{}_x64-setup.exe", version);

    // 下载到临时目录
    let temp_dir = std::env::temp_dir().join("TimerMaster_update");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let filepath = temp_dir.join(&filename);

    let client = reqwest::Client::builder()
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&filepath).await.map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let pct = ((downloaded as f64 / total as f64) * 100.0) as u32;
            let _ = app.emit("download-progress", serde_json::json!({
                "progress": pct,
                "downloaded": downloaded,
                "total": total,
            }));
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // 打开安装包
    let _ = app.emit("download-done", serde_json::json!({
        "path": filepath.to_string_lossy(),
        "filename": filename,
    }));
    let _ = opener::open(&filepath);
    println!("[TimerMaster] 已下载并打开安装包: {}", filepath.display());
    Ok(())
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

/// 重启所有运行中的计时器（应用关闭后 tokio 任务丢失）
async fn resume_timers(app: AppHandle, mgr: Arc<TimerManager>) {
    let tasks = mgr.list_tasks().await;
    let mut resumed = 0;
    for task in tasks {
        if !matches!(task.status, TaskStatus::Running) { continue; }
        let remaining = task.remaining_secs;
        if remaining == 0 { continue; }

        let app_c = app.clone();
        let mgr_c = mgr.clone();
        let tid = task.id.clone();
        let ttl = task.title.clone();
        let act = task.action.clone();
        resumed += 1;

        tokio::spawn(async move {
            for elapsed in 0..=remaining {
                let r = remaining - elapsed;
                mgr_c.update_task_remaining(&tid, r).await;
                let _ = app_c.emit("timer-tick",
                    serde_json::json!({"id": tid, "remaining": r, "total": remaining}));
                if elapsed < remaining { sleep(Duration::from_secs(1)).await; }
            }
            mgr_c.update_task_status(&tid, TaskStatus::Completed).await;
            use tauri_plugin_notification::NotificationExt;
            let _ = app_c.notification().builder()
                .title("⏰ TimerMaster")
                .body(format!("「{}」计时完成！", ttl)).show();
            if let Some(ref a) = act {
                if !matches!(a, TaskAction::None) { execute_action(a, &ttl); }
            }
        });
    }
    if resumed > 0 {
        println!("[TimerMaster] 已恢复 {} 个计时器", resumed);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // 初始化数据管理（需在 setup 中获取 app 路径）
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("data"));
            let timer_mgr = Arc::new(TimerManager::new(data_dir));
            // 重启运行中的计时器（重开应用后 tokio 任务丢失需要恢复）
            let handle = app.handle().clone();
            let mgr_for_resume = timer_mgr.clone();
            tauri::async_runtime::spawn(async move {
                resume_timers(handle, mgr_for_resume).await;
            });
            app.manage(Arc::new(Mutex::new(AppState {
                timer_manager: timer_mgr,
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
            pause_timer,
            resume_timer,
            delete_one_task_entry,
            complete_task,
            list_timers,
            get_stats,
            json_import_cmd,
            get_import_tpl,
            list_installed_apps,
            download_update,
            export_data,
            minimize_to_tray,
            set_always_on_top,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
