import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RepeatingReminderProps {
  onTaskCreated: () => void;
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
  const [loading, setLoading] = useState(false);
  const [minutes, setMinutes] = useState("45");
  const [customTitle, setCustomTitle] = useState("");
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(async () => {
    const mins = parseInt(minutes) || 45;
    const intervalSecs = mins * 60;
    const title = customTitle.trim() || `每${mins}分钟提醒`;

    setLoading(true);
    try {
      await invoke("create_repeating_timer", {
        title,
        intervalSecs,
      });
      setStarted(true);
      setCustomTitle("");
      onTaskCreated();
    } catch (e) {
      console.error("Failed to create repeating timer:", e);
    } finally {
      setLoading(false);
    }
  }, [minutes, customTitle, onTaskCreated]);

  return (
    <div className="card">
      <div className="card-title">🔄 重复提醒</div>

      {started ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#27ae60", marginBottom: 8 }}>
            循环提醒已启动！
          </div>
          <div style={{ fontSize: 13, color: "#888" }}>
            每 <strong>{minutes}</strong> 分钟提醒一次
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            切换到「🎯 计时中」查看倒计时
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setStarted(false)}
            style={{ marginTop: 16, width: "auto", padding: "8px 24px", background: "#555" }}
          >
            ➕ 再创建一个
          </button>
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
            {loading ? "⏳ 启动中..." : `▶ 启动循环提醒`}
          </button>
        </>
      )}
    </div>
  );
}
