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
  scheduled_at?: string;
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
  const [numKey, setNumKey] = useState(0);

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
      setNumKey((k) => k + 1);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handlePause = useCallback(async (taskId: string) => {
    try {
      await invoke("pause_timer", { taskId });
      fetchTasks();
      toast("已暂停", "info");
    } catch (e) { console.error(e); }
  }, [fetchTasks, toast]);

  const handleResume = useCallback(async (taskId: string) => {
    try {
      await invoke("resume_timer", { taskId });
      fetchTasks();
      toast("已继续", "info");
    } catch (e: any) {
      toast(String(e?.message || e), "error");
    }
  }, [fetchTasks, toast]);

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

  const runningTasks = tasks.filter((t) => t.status === "running" || t.status === "paused");

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
            在「➕ 新建」创建任务，开始计时
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
        {runningTasks.map((task, idx) => {
          const progress = task.duration_secs > 0
            ? Math.round((task.remaining_secs / task.duration_secs) * 100)
            : 0;
          const catColor = task.category === "工作" ? "var(--accent-orange)"
            : task.category === "休息" ? "var(--accent-green)"
            : task.category === "吃药" ? "var(--accent-red)"
            : "var(--accent-blue)";
          const barColor = progress > 50 ? "var(--accent-green)"
            : progress > 25 ? "var(--accent-orange)"
            : "#e74c3c";
          return (
          <div
            key={task.id}
            className={`running-card ${task.remaining_secs <= 0 ? "task-complete-glow" : ""}`}
            style={{
              background: "var(--bg-input)",
              borderRadius: 16,
              padding: 0,
              border: "1px solid var(--border-color)",
              overflow: "hidden",
              display: "flex",
              transition: "border-color 0.3s",
            }}
          >
            {/* 分类色条 */}
            <div style={{ width: 5, background: catColor, flexShrink: 0 }} />

            <div style={{ flex: 1, padding: "16px 16px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                {getTypeIcon(task.type)} {task.title}
                {task.category && task.category !== "未分类" && (
                  <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 8, background: `${catColor}33`, color: catColor }}>
                    {task.category}
                  </span>
                )}
                {task.type === "repeating" && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--accent-green)" }}>
                    每{Math.floor(task.duration_secs / 60)}分钟
                  </span>
                )}
                {task.scheduled_at && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--accent-blue)" }}>
                    ⏰ {task.scheduled_at.slice(11, 16)}
                  </span>
                )}
                {task.status === "paused" && (
                  <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "var(--accent-orange-transparent)", color: "var(--accent-orange)" }}>
                    ⏸ 已暂停
                  </span>
                )}
              </div>

              <div style={{ position: "relative" }}>
                <div
                  className={`${task.remaining_secs > 0 && task.remaining_secs <= 10 ? "timer-pulse" : ""}`}
                  key={`n-${numKey}-${task.id}`}
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: task.remaining_secs <= 10 && task.remaining_secs > 0
                      ? "#e74c3c"
                      : task.type === "repeating" ? "var(--accent-green)" : "var(--accent-blue)",
                    margin: "8px 0 2px",
                    letterSpacing: 2,
                    transition: "color 0.5s",
                  }}
                >
                  <span className="num-pop" key={`np-${numKey}-${task.id}`}>
                    {formatTime(task.remaining_secs)}
                  </span>
                </div>

                {/* 进度百分比 */}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                  {progress}% · {task.type === "repeating" ? "距下次提醒" : "剩余"}
                </div>
              </div>

              {/* 进度条 */}
              <div style={{ height: 4, background: "var(--border-color)", borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
                <div className="progress-bar" style={{ width: `${progress}%`, background: barColor }} />
              </div>

              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                {task.status === "paused" ? (
                  <button className="btn btn-success" onClick={() => handleResume(task.id)}
                    style={{ fontSize: 12, padding: "6px 14px" }}>
                    ▶ 继续
                  </button>
                ) : task.remaining_secs <= 0 || (task.duration_secs - task.remaining_secs) >= task.duration_secs ? (
                  <button className="btn btn-success" onClick={() => handleComplete(task.id)}
                    style={{ fontSize: 12, padding: "6px 14px" }}>
                    ✅ 完成
                  </button>
                ) : (
                  <>
                    <button className="btn btn-danger" onClick={() => handlePause(task.id)}
                      style={{ fontSize: 12, padding: "6px 14px" }}>
                      ⏸ 暂停
                    </button>
                    <button className="btn btn-danger" onClick={() => handleCancel(task.id)}
                      style={{ fontSize: 12, padding: "6px 14px", background: "#555" }}>
                      ⏹
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
