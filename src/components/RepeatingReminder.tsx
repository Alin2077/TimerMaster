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

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const PRESETS = [
  { label: "15分钟", mins: 15 },
  { label: "30分钟", mins: 30 },
  { label: "45分钟", mins: 45 },
  { label: "60分钟", mins: 60 },
  { label: "90分钟", mins: 90 },
  { label: "120分钟", mins: 120 },
];

export default function RepeatingReminder({
  onTaskCreated,
}: RepeatingReminderProps) {
  const [activeTask, setActiveTask] = useState<{
    id: string;
    remaining: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [minutes, setMinutes] = useState("45");
  const [customTitle, setCustomTitle] = useState("");

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
    const mins = parseInt(minutes) || 45;
    const intervalSecs = mins * 60;
    const title = customTitle.trim() || `每${mins}分钟提醒`;

    setLoading(true);
    try {
      const result = (await invoke("create_repeating_timer", {
        title,
        intervalSecs,
      })) as { id: string };
      setActiveTask({
        id: result.id,
        remaining: intervalSecs,
        total: intervalSecs,
      });
      onTaskCreated();
    } catch (e) {
      console.error("Failed to create repeating timer:", e);
    } finally {
      setLoading(false);
    }
  }, [minutes, customTitle, onTaskCreated]);

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

      {activeTask ? (
        <div className="quick-reminder">
          <div className="big-icon">🧘</div>
          <div className="timer-display">{formatTime(activeTask.remaining)}</div>
          <div className="interval-info">
            <span className="active-badge">● 运行中</span>
            &nbsp; 距离下次提醒还有 {formatTime(activeTask.remaining)}
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-danger" onClick={handleStop}>
              ⏹ 停止提醒
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="input-group">
            <input
              type="text"
              placeholder="备注（可选）"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              maxLength={30}
            />
          </div>

          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="preset-btn"
                onClick={() => setMinutes(String(p.mins))}
                style={
                  parseInt(minutes) === p.mins
                    ? {
                        background: "#27ae6033",
                        borderColor: "#27ae60",
                        color: "#27ae60",
                      }
                    : undefined
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="time-input-row">
            <input
              type="number"
              min="1"
              max="999"
              placeholder="间隔"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <span>分钟</span>
          </div>

          <button
            className="btn btn-success"
            onClick={handleStart}
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? "⏳ 启动中..." : `▶ 每 ${minutes} 分钟循环提醒`}
          </button>
        </>
      )}
    </div>
  );
}
