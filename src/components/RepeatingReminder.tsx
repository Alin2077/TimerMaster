import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RepeatingReminderProps {
  onTaskCreated: () => void;
}

const CATEGORIES = ["未分类", "工作", "休息", "吃药"];
const CATEGORY_COLORS: Record<string, string> = {
  "未分类": "var(--accent-blue)",
  "工作": "var(--accent-orange)",
  "休息": "var(--accent-green)",
  "吃药": "var(--accent-red)",
};

type RepeatType = "interval" | "daily" | "weekdays" | "weekly" | "monthly";

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
  const [category, setCategory] = useState("未分类");
  const [persistent, setPersistent] = useState(false);
  const [repeatType, setRepeatType] = useState<RepeatType>("interval");
  const [weekDay, setWeekDay] = useState(1); // 1=Mon
  const [monthDay, setMonthDay] = useState(1);

  const handleStart = useCallback(async () => {
    const mins = parseInt(minutes) || 45;
    const intervalSecs = mins * 60;
    const title = customTitle.trim() || `每${mins}分钟提醒`;
    const cat = category === "未分类" ? null : category;

    setLoading(true);
    try {
      // 构建 repeat_rule
      let repeatRule: any = null;
      switch (repeatType) {
        case "daily":
          repeatRule = { Daily: null };
          break;
        case "weekdays":
          repeatRule = { Weekdays: null };
          break;
        case "weekly":
          repeatRule = { Weekly: { day_of_week: weekDay } };
          break;
        case "monthly":
          repeatRule = { Monthly: { day_of_month: monthDay } };
          break;
        default:
          repeatRule = { Interval: { interval_minutes: mins } };
      }

      await invoke("create_repeating_timer", {
        title,
        intervalSecs,
        category: cat,
        priority: null,
        repeatRule,
        persistent: persistent || null,
      });
      setStarted(true);
      setCustomTitle("");
      onTaskCreated();
    } catch (e) {
      console.error("Failed to create repeating timer:", e);
    } finally {
      setLoading(false);
    }
  }, [minutes, customTitle, category, persistent, repeatType, weekDay, monthDay, onTaskCreated]);

  const WEEK_DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  if (started) {
    return (
      <div className="card">
        <div className="card-title">🔄 重复提醒</div>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--accent-green)", marginBottom: 8 }}>
            循环提醒已启动！
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {repeatType === "interval" && `每 ${minutes} 分钟提醒一次`}
            {repeatType === "daily" && "每天提醒"}
            {repeatType === "weekdays" && "工作日（周一至周五）提醒"}
            {repeatType === "weekly" && `每周${WEEK_DAYS[weekDay - 1]}提醒`}
            {repeatType === "monthly" && `每月${monthDay}号提醒`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
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
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">🔄 重复提醒</div>

      <div className="input-group">
        <input
          type="text"
          placeholder="备注（可选）"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          maxLength={30}
        />
      </div>

      {/* 分类 */}
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

      {/* 重复规则 */}
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "var(--text-secondary)" }}>
        重复规则
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          { key: "interval", label: "间隔" },
          { key: "daily", label: "每天" },
          { key: "weekdays", label: "工作日" },
          { key: "weekly", label: "每周" },
          { key: "monthly", label: "每月" },
        ].map((r) => (
          <button
            key={r.key}
            onClick={() => setRepeatType(r.key as RepeatType)}
            style={{
              padding: "4px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              background: repeatType === r.key ? "var(--accent-blue)" : "transparent",
              color: repeatType === r.key ? "#fff" : "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 根据重复类型显示不同配置 */}
      {repeatType === "interval" && (
        <>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="preset-btn"
                onClick={() => setMinutes(String(p.mins))}
                style={
                  parseInt(minutes) === p.mins
                    ? {
                        background: "var(--accent-green-transparent)",
                        borderColor: "var(--accent-green)",
                        color: "var(--accent-green)",
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
        </>
      )}

      {repeatType === "weekly" && (
        <div className="time-input-row">
          <span>选择星期：</span>
          <select
            value={weekDay}
            onChange={(e) => setWeekDay(Number(e.target.value))}
            style={{
              padding: "8px 12px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          >
            {WEEK_DAYS.map((d, i) => (
              <option key={i} value={i + 1}>{d}</option>
            ))}
          </select>
        </div>
      )}

      {repeatType === "monthly" && (
        <div className="time-input-row">
          <span>每月</span>
          <input
            type="number"
            min="1"
            max="28"
            value={monthDay}
            onChange={(e) => setMonthDay(Number(e.target.value))}
            style={{
              width: 72,
              padding: 8,
              background: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: 14,
              textAlign: "center",
            }}
          />
          <span>号</span>
        </div>
      )}

      {/* 持续提醒 */}
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
        持续提醒（多次通知，直到手动确认）
      </label>

      <button
        className="btn btn-success"
        onClick={handleStart}
        disabled={loading}
        style={{ width: "100%" }}
      >
        {loading ? "⏳ 启动中..." : "▶ 启动循环提醒"}
      </button>
    </div>
  );
}
