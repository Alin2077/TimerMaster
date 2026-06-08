use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerTask {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub task_type: TaskType,
    pub duration_secs: u64,
    pub remaining_secs: u64,
    pub status: TaskStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    #[serde(rename = "single")]
    Single,
    #[serde(rename = "repeating")]
    Repeating,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "paused")]
    Paused,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "cancelled")]
    Cancelled,
}

pub struct TimerManager {
    pub tasks: Arc<Mutex<Vec<TimerTask>>>,
    cancel_flags: Arc<Mutex<Vec<(String, Arc<AtomicBool>)>>>,
}

impl TimerManager {
    pub fn new() -> Self {
        TimerManager {
            tasks: Arc::new(Mutex::new(Vec::new())),
            cancel_flags: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn add_task(&self, title: String, task_type: TaskType, duration_secs: u64) -> TimerTask {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let task = TimerTask {
            id: Uuid::new_v4().to_string(),
            title,
            task_type,
            duration_secs,
            remaining_secs: duration_secs,
            status: TaskStatus::Running,
            created_at: now,
        };

        let mut tasks = self.tasks.lock().await;
        tasks.push(task.clone());
        task
    }

    pub async fn cancel_task(&self, task_id: &str) -> bool {
        // Mark the task as cancelled
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = TaskStatus::Cancelled;
        }

        // Set the cancel flag
        let flags = self.cancel_flags.lock().await;
        if let Some(pos) = flags.iter().position(|(id, _)| id == task_id) {
            flags[pos].1.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub async fn list_tasks(&self) -> Vec<TimerTask> {
        let tasks = self.tasks.lock().await;
        tasks.clone()
    }

    pub async fn register_cancel_flag(&self, task_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let mut flags = self.cancel_flags.lock().await;
        flags.push((task_id.to_string(), flag.clone()));
        flag
    }

    pub async fn remove_cancel_flag(&self, task_id: &str) {
        let mut flags = self.cancel_flags.lock().await;
        flags.retain(|(id, _)| id != task_id);
    }

    pub async fn update_task_status(&self, task_id: &str, status: TaskStatus) {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = status;
        }
    }

    pub async fn update_task_remaining(&self, task_id: &str, remaining: u64) {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.remaining_secs = remaining;
        }
    }
}
