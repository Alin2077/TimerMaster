use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::timer::{TimerTask, TaskType, TaskStatus};

pub struct Database {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Database {
    /// 打开（或创建）数据库，运行建表迁移
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let db_path = data_dir.join("tasks.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        // 执行迁移：建表 + 加列（兼容旧数据库）
        conn.execute_batch(
            "ALTER TABLE tasks ADD COLUMN scheduled_at TEXT;"
        ).ok(); // 忽略错误（列已存在时）

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tasks (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                task_type       TEXT NOT NULL,
                duration_secs   INTEGER NOT NULL,
                remaining_secs  INTEGER NOT NULL,
                status          TEXT NOT NULL DEFAULT 'running',
                created_at      TEXT NOT NULL,
                category        TEXT,
                priority        INTEGER,
                repeat_rule     TEXT,
                persistent      INTEGER,
                completed_at    TEXT,
                action          TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);"
        ).map_err(|e| e.to_string())?;

        println!("[TimerMaster] 数据库已打开: {}", db_path.display());

        // 向后兼容：如果存在旧版 tasks.json，导入它
        let json_path = data_dir.join("tasks.json");
        if json_path.exists() {
            Self::import_from_json(&conn, &json_path);
        }

        Ok(Database {
            conn: Mutex::new(conn),
            path: db_path,
        })
    }

    /// 从旧版 JSON 文件导入数据
    fn import_from_json(conn: &Connection, json_path: &PathBuf) {
        println!("[TimerMaster] 发现旧版 tasks.json，正在导入...");
        if let Ok(content) = std::fs::read_to_string(json_path) {
            if let Ok(tasks) = serde_json::from_str::<Vec<TimerTask>>(&content) {
                for task in &tasks {
                    let _ = Self::insert_task_inner(conn, task);
                }
                println!("[TimerMaster] 已导入 {} 条任务", tasks.len());
                // 导入后重命名旧文件
                let backup = json_path.with_extension("json.bak");
                let _ = std::fs::rename(json_path, &backup);
            }
        }
    }

    fn insert_task_inner(conn: &Connection, task: &TimerTask) -> Result<(), String> {
        conn.execute(
            "INSERT OR IGNORE INTO tasks (id, title, task_type, duration_secs, remaining_secs,
             status, created_at, category, priority, repeat_rule, persistent, completed_at, action, scheduled_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                task.id,
                task.title,
                serde_json::to_string(&task.task_type).unwrap_or_default(),
                task.duration_secs,
                task.remaining_secs,
                serde_json::to_string(&task.status).unwrap_or_default(),
                task.created_at,
                task.category,
                task.priority,
                task.repeat_rule.as_ref().map(|r| serde_json::to_string(r).unwrap_or_default()),
                task.persistent.map(|b| if b { 1 } else { 0 }),
                task.completed_at,
                task.action.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default()),
                task.scheduled_at,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── CRUD ──

    pub fn insert_task(&self, task: &TimerTask) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        Self::insert_task_inner(&conn, task)
    }

    pub fn update_status(&self, id: &str, status: &TaskStatus) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tasks SET status = ?1 WHERE id = ?2",
            params![serde_json::to_string(status).unwrap_or_default(), id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_remaining(&self, id: &str, remaining: u64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tasks SET remaining_secs = ?1 WHERE id = ?2",
            params![remaining, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn complete_task(&self, id: &str, completed_at: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tasks SET status = ?1, completed_at = ?2 WHERE id = ?3",
            params![serde_json::to_string(&TaskStatus::Completed).unwrap_or_default(), completed_at, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_all(&self) -> Result<Vec<TimerTask>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, task_type, duration_secs, remaining_secs, status, created_at,
                    category, priority, repeat_rule, persistent, completed_at, action, scheduled_at
             FROM tasks ORDER BY created_at DESC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            let repeat_rule_str: Option<String> = row.get(9)?;
            let action_str: Option<String> = row.get(12)?;
            let scheduled_at: Option<String> = row.get(13)?;

            Ok(TimerTask {
                id: row.get(0)?,
                title: row.get(1)?,
                task_type: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or(TaskType::Single),
                duration_secs: row.get::<_, i64>(3)? as u64,
                remaining_secs: row.get::<_, i64>(4)? as u64,
                status: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or(TaskStatus::Cancelled),
                created_at: row.get(6)?,
                category: row.get(7)?,
                priority: row.get::<_, Option<i64>>(8)?.map(|v| v as u32),
                repeat_rule: repeat_rule_str.and_then(|s| serde_json::from_str(&s).ok()),
                persistent: row.get::<_, Option<i64>>(10)?.map(|v| v != 0),
                completed_at: row.get(11)?,
                action: action_str.and_then(|s| serde_json::from_str(&s).ok()),
                scheduled_at,
            })
        }).map_err(|e| e.to_string())?;

        let mut tasks = Vec::new();
        for row in rows {
            if let Ok(task) = row {
                tasks.push(task);
            }
        }
        Ok(tasks)
    }

    pub fn get_stats(&self) -> Result<crate::timer::TaskStats, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let total: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap_or(0);
        let completed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = '\"completed\"'", [], |r| r.get(0)
        ).unwrap_or(0);
        let cancelled: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = '\"cancelled\"'", [], |r| r.get(0)
        ).unwrap_or(0);
        let running: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = '\"running\"'", [], |r| r.get(0)
        ).unwrap_or(0);

        let completion_rate = if total > 0 { (completed as f64 / total as f64) * 100.0 } else { 0.0 };

        // 分类统计
        let mut stmt = conn.prepare(
            "SELECT COALESCE(category, '未分类') as cat, COUNT(*) as cnt,
                    SUM(CASE WHEN status = '\"completed\"' THEN 1 ELSE 0 END) as done
             FROM tasks GROUP BY cat"
        ).map_err(|e| e.to_string())?;

        let by_category: Vec<crate::timer::CategoryStat> = stmt.query_map([], |row| {
            Ok(crate::timer::CategoryStat {
                category: row.get(0)?,
                total: row.get::<_, i64>(1)? as usize,
                completed: row.get::<_, i64>(2)? as usize,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        Ok(crate::timer::TaskStats {
            total: total as usize,
            completed: completed as usize,
            cancelled: cancelled as usize,
            running: running as usize,
            completion_rate,
            by_category,
        })
    }

    pub fn export_all(&self) -> Result<Vec<TimerTask>, String> {
        self.list_all()
    }
}
