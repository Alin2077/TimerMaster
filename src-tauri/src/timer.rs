use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::database::Database;

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_rule: Option<RepeatRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub persistent: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<TaskAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskAction {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "shutdown")]
    Shutdown,
    #[serde(rename = "open")]
    OpenApp { path: String },
    #[serde(rename = "script")]
    RunScript { path: String },
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RepeatRule {
    #[serde(rename = "interval")]
    Interval { interval_minutes: u64 },
    #[serde(rename = "daily")]
    Daily,
    #[serde(rename = "weekdays")]
    Weekdays,
    #[serde(rename = "weekly")]
    Weekly { day_of_week: u32 },
    #[serde(rename = "monthly")]
    Monthly { day_of_month: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStats {
    pub total: usize,
    pub completed: usize,
    pub cancelled: usize,
    pub running: usize,
    pub completion_rate: f64,
    pub by_category: Vec<CategoryStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryStat {
    pub category: String,
    pub total: usize,
    pub completed: usize,
}

pub struct TimerManager {
    pub tasks: Arc<Mutex<Vec<TimerTask>>>,
    cancel_flags: Arc<Mutex<Vec<(String, Arc<AtomicBool>)>>>,
    db: Database,
}

impl TimerManager {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        let db = Database::open(&data_dir).unwrap_or_else(|e| {
            eprintln!("[TimerMaster] 数据库打开失败: {}", e);
            // 用空路径创建一个 fallback —— 实际上会 panic，但开发环境可用
            Database::open(&data_dir).expect("无法打开数据库")
        });

        // 启动时从数据库加载任务到内存
        let tasks = db.list_all().unwrap_or_default();
        println!("[TimerMaster] 已加载 {} 条任务", tasks.len());

        TimerManager {
            tasks: Arc::new(Mutex::new(tasks)),
            cancel_flags: Arc::new(Mutex::new(Vec::new())),
            db,
        }
    }

    pub async fn add_task(
        &self,
        title: String,
        task_type: TaskType,
        duration_secs: u64,
        category: Option<String>,
        priority: Option<u32>,
        repeat_rule: Option<RepeatRule>,
        persistent: Option<bool>,
        action: Option<TaskAction>,
    ) -> TimerTask {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let task = TimerTask {
            id: Uuid::new_v4().to_string(),
            title,
            task_type,
            duration_secs,
            remaining_secs: duration_secs,
            status: TaskStatus::Running,
            created_at: now,
            category,
            priority,
            repeat_rule,
            persistent,
            completed_at: None,
            action,
        };

        // 写入数据库
        let _ = self.db.insert_task(&task);

        // 加入内存
        let mut tasks = self.tasks.lock().await;
        tasks.push(task.clone());
        task
    }

    pub async fn cancel_task(&self, task_id: &str) -> bool {
        // 更新内存
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = TaskStatus::Cancelled;
        }
        drop(tasks);

        // 更新数据库
        let _ = self.db.update_status(task_id, &TaskStatus::Cancelled);

        // 设置取消标记（用于正在运行的计时器）
        let flags = self.cancel_flags.lock().await;
        if let Some(pos) = flags.iter().position(|(id, _)| id == task_id) {
            flags[pos].1.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub async fn complete_task(&self, task_id: &str) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        // 更新内存
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = TaskStatus::Completed;
            task.completed_at = Some(now.clone());
        }
        drop(tasks);

        // 更新数据库
        let _ = self.db.complete_task(task_id, &now);
    }

    pub async fn list_tasks(&self) -> Vec<TimerTask> {
        let tasks = self.tasks.lock().await;
        tasks.clone()
    }

    pub async fn get_stats(&self) -> TaskStats {
        self.db.get_stats().unwrap_or(TaskStats {
            total: 0, completed: 0, cancelled: 0, running: 0,
            completion_rate: 0.0, by_category: vec![],
        })
    }

    pub async fn export_data(&self) -> Vec<TimerTask> {
        self.db.export_all().unwrap_or_default()
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
            task.status = status.clone();
        }
        drop(tasks);
        let _ = self.db.update_status(task_id, &status);
    }

    pub async fn update_task_remaining(&self, task_id: &str, remaining: u64) {
        // 剩余时间只更新内存，不写数据库（1 秒一次太频繁）
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.remaining_secs = remaining;
        }
    }
}
