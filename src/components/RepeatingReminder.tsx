import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface TickEvent {
  id: string;
  remaining: number;
  total: number;
}

interface RepeatingReminderProps {
  onTaskCreated: () => void;
}

const FORTY_FIVE_MIN = 45 * 60; // 2700 seconds

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function RepeatingReminder({
  onTaskCreated,
}: RepeatingReminderProps) {
  const [activeTask, setActiveTask] = useState<{
    id: string;
    remaining: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unlisten = listen<TickEvent>("timer-tick", (event) => {
      const { id, remaining, total } = event.payload;
      setActiveTask((prev) => {
        if (prev && prev.id === id) {
          return { id, remaining, total };
        }
        return prev;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke("create_repeating_timer", {
        title: "起身活动提醒",
        intervalSecs: FORTY_FIVE_MIN,
      }) as { id: string };
      setActiveTask({
        id: result.id,
        remaining: FORTY_FIVE_MIN,
        total: FORTY_FIVE_MIN,
      });
      onTaskCreated();
    } catch (e) {
      console.error("Failed to create repeating timer:", e);
    } finally {
      setLoading(false);
    }
  }, [onTaskCreated]);

  const handleStop = useCallback(async () => {
    if (!activeTask) return;
    try {
      await invoke("cancel_timer", { taskId: activeTask.id });
      setActiveTask(null);
      onTaskCreated();
    } catch (e) {
      console.error("Failed to cancel timer:", e);
    }
  }, [activeTask, onTaskCreated]);

  return (
    <div className="card">
      <div className="card-title">🔄 重复提醒</div>

      <div className="quick-reminder">
        <div className="big-icon">🧘</div>
        <div className="desc">
          每 <strong>45 分钟</strong>提醒起身活动，保护腰椎和视力
        </div>

        {activeTask ? (
          <>
            <div className="timer-display">
              {formatTime(activeTask.remaining)}
            </div>
            <div className="interval-info">
              <span className="active-badge">● 运行中</span>
              &nbsp; 距离下次提醒还有 {formatTime(activeTask.remaining)}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-danger" onClick={handleStop}>
                ⏹ 停止提醒
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#27ae60", marginBottom: 12 }}>
              45:00
            </div>
            <button
              className="btn btn-success"
              onClick={handleStart}
              disabled={loading}
              style={{ minWidth: 200 }}
            >
              {loading ? "⏳ 启动中..." : "▶ 启动循环提醒"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
