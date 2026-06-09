use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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
    data_path: PathBuf,
}

impl TimerManager {
    pub fn new(data_dir: PathBuf) -> Self {
        // 确保目录存在
        std::fs::create_dir_all(&data_dir).ok();
        let data_path = data_dir.join("tasks.json");

        let mgr = TimerManager {
            tasks: Arc::new(Mutex::new(Vec::new())),
            cancel_flags: Arc::new(Mutex::new(Vec::new())),
            data_path,
        };

        // 启动时从文件加载
        if let Ok(loaded) = Self::load_from_file(&mgr.data_path) {
            if let Ok(mut tasks) = mgr.tasks.try_lock() {
                *tasks = loaded;
                println!("[TimerMaster] 已加载 {} 条任务记录", tasks.len());
            }
        }

        mgr
    }

    /// 从 JSON 文件加载任务列表
    fn load_from_file(path: &PathBuf) -> Result<Vec<TimerTask>, String> {
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    }

    /// 保存任务列表到 JSON 文件
    fn save_to_file(tasks: &[TimerTask], path: &PathBuf) {
        if let Ok(json) = serde_json::to_string_pretty(tasks) {
            let _ = std::fs::write(path, &json);
        }
    }

    /// 每个增删改操作后自动保存
    async fn save(&self) {
        let tasks = self.tasks.lock().await;
        Self::save_to_file(&tasks, &self.data_path);
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

        let mut tasks = self.tasks.lock().await;
        tasks.push(task.clone());
        drop(tasks);
        self.save().await;
        task
    }

    pub async fn cancel_task(&self, task_id: &str) -> bool {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = TaskStatus::Cancelled;
        }
        drop(tasks);
        self.save().await;

        let flags = self.cancel_flags.lock().await;
        if let Some(pos) = flags.iter().position(|(id, _)| id == task_id) {
            flags[pos].1.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub async fn complete_task(&self, task_id: &str) {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = TaskStatus::Completed;
            task.completed_at =
                Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        }
        drop(tasks);
        self.save().await;
    }

    pub async fn list_tasks(&self) -> Vec<TimerTask> {
        let tasks = self.tasks.lock().await;
        tasks.clone()
    }

    pub async fn get_stats(&self) -> TaskStats {
        let tasks = self.tasks.lock().await;
        let total = tasks.len();
        let completed = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Completed)).count();
        let cancelled = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Cancelled)).count();
        let running = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Running)).count();
        let completion_rate = if total > 0 { (completed as f64 / total as f64) * 100.0 } else { 0.0 };

        let mut cat_map: std::collections::HashMap<String, (usize, usize)> =
            std::collections::HashMap::new();
        for t in tasks.iter() {
            let cat = t.category.clone().unwrap_or_else(|| "未分类".to_string());
            let entry = cat_map.entry(cat).or_insert((0, 0));
            entry.0 += 1;
            if matches!(t.status, TaskStatus::Completed) {
                entry.1 += 1;
            }
        }
        let by_category: Vec<CategoryStat> = cat_map
            .into_iter()
            .map(|(category, (total, completed))| CategoryStat { category, total, completed })
            .collect();

        TaskStats { total, completed, cancelled, running, completion_rate, by_category }
    }

    pub async fn export_data(&self) -> Vec<TimerTask> {
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
        drop(tasks);
        self.save().await;
    }

    pub async fn update_task_remaining(&self, task_id: &str, remaining: u64) {
        let mut tasks = self.tasks.lock().await;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.remaining_secs = remaining;
        }
    }
}
