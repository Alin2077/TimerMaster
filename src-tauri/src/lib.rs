mod timer;

use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use timer::{TimerManager, TimerTask, TaskStatus, TaskType};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

pub struct AppState {
    pub timer_manager: Arc<TimerManager>,
}

#[tauri::command]
async fn create_single_timer(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    title: String,
    duration_secs: u64,
) -> Result<TimerTask, String> {
    let state = state.lock().await;
    let task = state
        .timer_manager
        .add_task(title.clone(), TaskType::Single, duration_secs)
        .await;

    let cancel_flag = state
        .timer_manager
        .register_cancel_flag(&task.id)
        .await;

    let app_clone = app.clone();
    let task_id = task.id.clone();
    let mgr = state.timer_manager.clone();

    tokio::spawn(async move {
        let total_secs = duration_secs;
        for elapsed in 0..=total_secs {
            if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }

            let remaining = total_secs - elapsed;
            mgr.update_task_remaining(&task_id, remaining).await;

            let _ = app_clone.emit(
                "timer-tick",
                serde_json::json!({
                    "id": task_id,
                    "remaining": remaining,
                    "total": total_secs,
                }),
            );

            if elapsed < total_secs {
                sleep(Duration::from_secs(1)).await;
            }
        }

        if !cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            mgr.update_task_status(&task_id, TaskStatus::Completed).await;

            use tauri_plugin_notification::NotificationExt;
            let _ = app_clone
                .notification()
                .builder()
                .title("⏰ TimerMaster")
                .body(format!("「{}」计时完成！", title))
                .show();
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
) -> Result<TimerTask, String> {
    let state = state.lock().await;
    let task = state
        .timer_manager
        .add_task(title.clone(), TaskType::Repeating, interval_secs)
        .await;

    let cancel_flag = state
        .timer_manager
        .register_cancel_flag(&task.id)
        .await;

    let app_clone = app.clone();
    let task_id = task.id.clone();
    let mgr = state.timer_manager.clone();

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
                    serde_json::json!({
                        "id": task_id,
                        "remaining": remaining,
                        "total": interval_secs,
                    }),
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
async fn cancel_timer(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<bool, String> {
    let state = state.lock().await;
    Ok(state.timer_manager.cancel_task(&task_id).await)
}

#[tauri::command]
async fn list_timers(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<TimerTask>, String> {
    let state = state.lock().await;
    Ok(state.timer_manager.list_tasks().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(Mutex::new(AppState {
            timer_manager: Arc::new(TimerManager::new()),
        })))
        .invoke_handler(tauri::generate_handler![
            create_single_timer,
            create_repeating_timer,
            cancel_timer,
            list_timers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
