import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SingleTimerProps {
  onTaskCreated: () => void;
}

const CATEGORIES = ["未分类", "工作", "休息", "吃药"];
const CATEGORY_COLORS: Record<string, string> = {
  "未分类": "var(--accent-blue)",
  "工作": "var(--accent-orange)",
  "休息": "var(--accent-green)",
  "吃药": "var(--accent-red)",
};

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function SingleTimer({ onTaskCreated }: SingleTimerProps) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("未分类");
  const [persistent, setPersistent] = useState(false);

  const handleStart = useCallback(async () => {
    const mins = parseInt(minutes) || 0;
    const secs = parseInt(seconds) || 0;
    const totalSecs = mins * 60 + secs;

    if (totalSecs <= 0) {
      alert("请设置有效的时间");
      return;
    }

    const taskTitle = title.trim() || `倒计时 ${formatTime(totalSecs)}`;

    setLoading(true);
    try {
      await invoke("create_single_timer", {
        title: taskTitle,
        durationSecs: totalSecs,
        category: category === "未分类" ? null : category,
        priority: null as number | null,
        persistent: persistent || null,
      });
      setTitle("");
      setMinutes("");
      setSeconds("");
      onTaskCreated();
    } catch (e) {
      console.error("Failed to create timer:", e);
    } finally {
      setLoading(false);
    }
  }, [title, minutes, seconds, category, persistent, onTaskCreated]);

  const presets = [
    { label: "5分钟", mins: 5 },
    { label: "10分钟", mins: 10 },
    { label: "15分钟", mins: 15 },
    { label: "25分钟", mins: 25 },
    { label: "30分钟", mins: 30 },
    { label: "60分钟", mins: 60 },
  ];

  return (
    <div className="card">
      <div className="card-title">⏱ 单次定时器</div>

      <div className="input-group">
        <input
          type="text"
          placeholder="备注（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={30}
        />
      </div>

      {/* 分类选择 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: "4px 12px",
              borderRadius: 12,
              border: `1px solid ${
                category === cat ? CATEGORY_COLORS[cat] : "var(--border-color)"
              }`,
              background: category === cat ? `${CATEGORY_COLORS[cat]}33` : "transparent",
              color: category === cat ? CATEGORY_COLORS[cat] : "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="presets">
        {presets.map((p) => (
          <button
            key={p.label}
            className="preset-btn"
            onClick={() => {
              setMinutes(String(p.mins));
              setSeconds("0");
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="time-input-row">
        <input
          type="number"
          min="0"
          max="999"
          placeholder="分"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
        <span>分</span>
        <input
          type="number"
          min="0"
          max="59"
          placeholder="秒"
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
        />
        <span>秒</span>
      </div>

      {/* 持续提醒选项 */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          fontSize: 13,
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={persistent}
          onChange={(e) => setPersistent(e.target.checked)}
          style={{ accentColor: "var(--accent-blue)" }}
        />
        持续提醒（到点后重复通知，直到手动确认）
      </label>

      <button
        className="btn btn-primary"
        onClick={handleStart}
        disabled={loading}
      >
        {loading ? "⏳ 创建中..." : "🚀 开始计时"}
      </button>
    </div>
  );
}
