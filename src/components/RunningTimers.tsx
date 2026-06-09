import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "./Toast";

interface TimerTask {
  id: string;
  title: string;
  type: "single" | "repeating";
  duration_secs: number;
  remaining_secs: number;
  status: "running" | "paused" | "completed" | "cancelled";
  created_at: string;
  category?: string;
  priority?: number;
  persistent?: boolean;
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

function getTypeIcon(type: string): string {
  return type === "repeating" ? "🔄" : "⏱";
}

export default function RunningTimers() {
  const toast = useToast();
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
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  useEffect(() => {
    const unlisten = listen<TickEvent>("timer-tick", (event) => {
      const { id, remaining } = event.payload;
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, remaining_secs: remaining } : t))
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
        toast("已取消", "info");
      } catch (e) {
        console.error("Failed to cancel timer:", e);
      }
    },
    [fetchTasks, toast]
  );

  const handleComplete = useCallback(
    async (taskId: string) => {
      try {
        await invoke("complete_task", { taskId });
        fetchTasks();
        toast("🎉 干得漂亮！", "success");
      } catch (e) {
        console.error("Failed to complete task:", e);
      }
    },
    [fetchTasks, toast]
  );

  const runningTasks = tasks.filter((t) => t.status === "running");

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">🎯 计时中</div>
        <div className="empty-state"><p>加载中...</p></div>
      </div>
    );
  }

  if (runningTasks.length === 0) {
    return (
      <div className="card">
        <div className="card-title">🎯 计时中</div>
        <div className="empty-state">
          <div className="emoji">⏳</div>
          <p>当前没有正在运行的任务</p>
          <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
            切换到「单次定时器」或「重复提醒」开始计时
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">
        🎯 计时中
        <span style={{ fontSize: 13, color: "var(--text-secondary)", marginLeft: 8 }}>
          ({runningTasks.length})
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {runningTasks.map((task) => (
          <div
            key={task.id}
            className={task.remaining_secs <= 0 ? "task-complete-glow" : ""}
            style={{
              background: "var(--bg-input)",
              borderRadius: 16,
              padding: "20px 16px",
              border: "1px solid var(--border-color)",
              textAlign: "center",
              transition: "border-color 0.3s",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
              {getTypeIcon(task.type)} {task.title}
              {task.category && task.category !== "未分类" && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    padding: "1px 6px",
                    borderRadius: 8,
                    background: "var(--accent-blue-transparent)",
                    color: "var(--accent-blue)",
                  }}
                >
                  {task.category}
                </span>
              )}
              {task.type === "repeating" && (
                <span style={{ marginLeft: 6, fontSize: 11, color: "var(--accent-green)" }}>
                  每{Math.floor(task.duration_secs / 60)}分钟
                </span>
              )}
            </div>

            <div
              className={task.remaining_secs > 0 && task.remaining_secs <= 10 ? "timer-pulse" : ""}
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: task.remaining_secs <= 10 && task.remaining_secs > 0
                  ? "#e74c3c"
                  : task.type === "repeating" ? "var(--accent-green)" : "var(--accent-blue)",
                margin: "8px 0",
                letterSpacing: 2,
                transition: "color 0.5s",
              }}
            >
              {formatTime(task.remaining_secs)}
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
              {task.type === "repeating" ? "距离下次提醒" : "剩余时间"}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {task.remaining_secs <= 0 || (task.duration_secs - task.remaining_secs) >= task.duration_secs ? (
                <button
                  className="btn btn-success"
                  onClick={() => handleComplete(task.id)}
                  style={{ fontSize: 12, padding: "6px 20px" }}
                >
                  ✅ 确认完成
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  onClick={() => handleCancel(task.id)}
                  style={{ fontSize: 12, padding: "6px 20px" }}
                >
                  ⏹ 取消
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
