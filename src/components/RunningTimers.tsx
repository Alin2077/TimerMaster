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

function getTypeIcon(type: string): string {
  return type === "repeating" ? "🔄" : "⏱";
}

export default function RunningTimers() {
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
          <p style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
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
        <span style={{ fontSize: 13, color: "#888", marginLeft: 8 }}>
          ({runningTasks.length})
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {runningTasks.map((task) => (
          <div
            key={task.id}
            style={{
              background: "#0f3460",
              borderRadius: 16,
              padding: "20px 16px",
              border: "1px solid #2a2a4a",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
              {getTypeIcon(task.type)} {task.title}
              {task.type === "repeating" && (
                <span style={{ marginLeft: 6, fontSize: 11, color: "#27ae60" }}>
                  每{Math.floor(task.duration_secs / 60)}分钟
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: task.type === "repeating" ? "#27ae60" : "#667eea",
                margin: "8px 0",
                letterSpacing: 2,
              }}
            >
              {formatTime(task.remaining_secs)}
            </div>

            <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>
              {task.type === "repeating"
                ? "距离下次提醒"
                : "剩余时间"}
            </div>

            <button
              className="btn btn-danger"
              onClick={() => handleCancel(task.id)}
              style={{ fontSize: 12, padding: "6px 20px" }}
            >
              ⏹ 取消
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
