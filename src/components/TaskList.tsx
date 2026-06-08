import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface TimerTask {
  id: string;
  title: string;
  type: "single" | "repeating";
  duration_secs: number;
  remaining_secs: number;
  status: "running" | "paused" | "completed" | "cancelled";
  created_at: string;
}

interface TickEvent {
  id: string;
  remaining: number;
  total: number;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getTypeLabel(type: string): string {
  return type === "repeating" ? "重复" : "单次";
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
  };
  return map[status] || status;
}

export default function TaskList() {
  const [tasks, setTasks] = useState<TimerTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const result = await invoke<TimerTask[]>("list_timers");
      setTasks(result);
    } catch (e) {
      console.error("Failed to fetch tasks:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const unlisten = listen<TickEvent>("timer-tick", (event) => {
      const { id, remaining } = event.payload;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, remaining_secs: remaining } : t
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleCancel = useCallback(
    async (taskId: string) => {
      try {
        await invoke("cancel_timer", { taskId });
        fetchTasks();
      } catch (e) {
        console.error("Failed to cancel timer:", e);
      }
    },
    [fetchTasks]
  );

  const sortedTasks = [...tasks].sort((a, b) => {
    // Running tasks first, then by creation time desc
    const order = { running: 0, paused: 1, completed: 2, cancelled: 3 };
    const aOrder = order[a.status] ?? 9;
    const bOrder = order[b.status] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.created_at.localeCompare(a.created_at);
  });

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">📋 任务列表</div>
        <div className="empty-state">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">
        📋 任务列表
        {tasks.length > 0 && (
          <span style={{ fontSize: 13, color: "#888", marginLeft: 8 }}>
            ({tasks.length})
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">⏰</div>
          <p>暂无定时任务</p>
          <p style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
            切换到「单次定时器」或「重复提醒」创建任务
          </p>
        </div>
      ) : (
        <div className="task-list">
          {sortedTasks.map((task) => (
            <div
              key={task.id}
              className={`task-item ${task.status}`}
            >
              <div className="task-info">
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                  {task.status === "running" ? (
                    <span style={{ color: "#f39c12", fontWeight: 600 }}>
                      {formatTime(task.remaining_secs)}
                    </span>
                  ) : (
                    <span>{formatTime(task.duration_secs)}</span>
                  )}
                  <span className={`tag tag-${task.type}`}>
                    {getTypeLabel(task.type)}
                  </span>
                  <span className={`tag tag-${task.status}`}>
                    {getStatusLabel(task.status)}
                  </span>
                  {task.type === "repeating" && (
                    <span style={{ fontSize: 11, color: "#888" }}>
                      (每{Math.floor(task.duration_secs / 60)}分钟)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                  {task.created_at}
                </div>
              </div>
              {task.status === "running" && (
                <button
                  className="btn btn-danger"
                  onClick={() => handleCancel(task.id)}
                  style={{ fontSize: 11, padding: "4px 10px" }}
                >
                  取消
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
