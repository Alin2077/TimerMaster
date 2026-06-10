import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useToast } from "./Toast";

interface CreateTaskProps {
  onTaskCreated: () => void;
}

const CATEGORIES = ["未分类", "工作", "休息", "吃药"];
const CAT_COLORS: Record<string, string> = {
  "未分类": "var(--accent-blue)", "工作": "var(--accent-orange)",
  "休息": "var(--accent-green)", "吃药": "var(--accent-red)",
};

type TaskMode = "countdown" | "scheduled";
type RepeatType = "none" | "interval" | "daily" | "weekdays" | "weekly" | "monthly";
type ActionType = "none" | "shutdown" | "open" | "script";

const COUNTDOWN_PRESETS = [
  { label: "5分钟", mins: 5 }, { label: "10分钟", mins: 10 },
  { label: "15分钟", mins: 15 }, { label: "25分钟", mins: 25 },
  { label: "30分钟", mins: 30 }, { label: "60分钟", mins: 60 },
];
const INTERVAL_PRESETS = [
  { label: "15分钟", mins: 15 }, { label: "30分钟", mins: 30 },
  { label: "45分钟", mins: 45 }, { label: "60分钟", mins: 60 },
  { label: "90分钟", mins: 90 }, { label: "120分钟", mins: 120 },
];
const WEEK_DAYS = ["周一","周二","周三","周四","周五","周六","周日"];

function nowStr(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateTask({ onTaskCreated }: CreateTaskProps) {
  const toast = useToast();
  const [mode, setMode] = useState<TaskMode>("countdown");
  const [modeKey, setModeKey] = useState(0);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [scheduledAt, setScheduledAt] = useState(nowStr());
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [intervalMin, setIntervalMin] = useState("45");
  const [weekDay, setWeekDay] = useState(1);
  const [monthDay, setMonthDay] = useState(1);

  // 切换模式时重置状态
  const handleSetMode = useCallback((m: TaskMode) => {
    setMode(m);
    setModeKey((k) => k + 1);
    if (m === "scheduled") {
      setMinutes(""); setSeconds("");
    } else {
      setScheduledAt(nowStr()); setRepeatType("none");
    }
  }, []);
  const [category, setCategory] = useState("未分类");
  const [actionType, setActionType] = useState<ActionType>("none");
  const [actionPath, setActionPath] = useState("");
  const [persistent, setPersistent] = useState(false);

  const handlePickFile = useCallback(async () => {
    const exts = actionType === "open" ? ["exe","bat","cmd"] : ["bat","ps1","sh","cmd","py"];
    const s = await open({ multiple: false, filters: [{ name: "可执行文件", extensions: exts }] });
    if (s) setActionPath(s);
  }, [actionType]);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    try {
      let durationSecs = 0;
      let scheduled: string | null = null;
      let repeatRule: any = null;
      let action: any = null;

      if (mode === "countdown") {
        const mins = parseInt(minutes) || 0;
        const secs = parseInt(seconds) || 0;
        durationSecs = mins * 60 + secs;
        if (durationSecs <= 0) { toast("请设置有效时间", "error"); setLoading(false); return; }
      } else {
        scheduled = scheduledAt.replace("T", " ");
        // 单次用 1（后端计算实际秒数），重复用间隔分钟数
        durationSecs = repeatType !== "none" ? (parseInt(intervalMin) || 45) * 60 : 1;
      }

      // 指定时间模式只能单次，强制忽略重复设置
      if (mode !== "scheduled" && repeatType !== "none") {
        switch (repeatType) {
          case "daily": repeatRule = "daily"; break;
          case "weekdays": repeatRule = "weekdays"; break;
          case "weekly": repeatRule = { weekly: { day_of_week: weekDay } }; break;
          case "monthly": repeatRule = { monthly: { day_of_month: monthDay } }; break;
          default: repeatRule = { interval: { interval_minutes: parseInt(intervalMin) || 45 } };
        }
      }

      if (actionType === "shutdown") action = "shutdown";
      else if (actionType === "open" && actionPath) action = { open: { path: actionPath } };
      else if (actionType === "script" && actionPath) action = { script: { path: actionPath } };

      let taskTitle = title.trim();
      if (!taskTitle) {
        if (mode === "countdown" && repeatType !== "none") {
          taskTitle = `每${Math.floor(durationSecs / 60)}分钟提醒`;
        } else if (mode === "scheduled") {
          taskTitle = "定时提醒";
        } else {
          taskTitle = `倒计时 ${Math.floor(durationSecs / 60)}分${durationSecs % 60 > 0 ? durationSecs % 60 + "秒" : ""}`;
        }
      }

      if (repeatType !== "none") {
        await invoke("create_repeating_timer", {
          title: taskTitle, intervalSecs: durationSecs,
          category: category === "未分类" ? null : category,
          priority: null, repeatRule, persistent: persistent || null, action,
        });
      } else {
        await invoke("create_single_timer", {
          title: taskTitle, durationSecs,
          category: category === "未分类" ? null : category,
          priority: null, persistent: persistent || null, action,
          scheduledAt: scheduled,
        });
      }
      // 重置所有状态
      setTitle(""); setMinutes(""); setSeconds("");
      setActionPath(""); setPersistent(false);
      setRepeatType("none");
      setCategory("未分类"); setActionType("none");
      setScheduledAt(nowStr());
      onTaskCreated();
    } catch (e: any) {
      toast(String(e?.message || e) || "创建失败", "error");
    } finally {
      setLoading(false);
    }
  }, [mode, title, minutes, seconds, scheduledAt, repeatType, intervalMin, weekDay, monthDay,
      category, actionType, actionPath, persistent, onTaskCreated]);

  return (
    <div className="card">
      <div className="card-title">➕ 新建任务</div>

      {/* 标题 — 静态 */}
      <div className="section-anim">
        <div className="input-group">
          <input type="text" placeholder="备注（可选）" value={title}
            onChange={(e) => setTitle(e.target.value)} maxLength={30} />
        </div>
      </div>

      {/* 模式切换 — 静态 */}
      <div className="section-anim">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["countdown", "scheduled"] as TaskMode[]).map((m) => (
            <button key={m} onClick={() => handleSetMode(m)}
              className={mode === m ? "btn-bounce" : ""}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                border: mode === m ? "2px solid var(--accent-blue)" : "1px solid var(--border-color)",
                background: mode === m ? "var(--accent-blue-transparent)" : "var(--bg-input)",
                color: mode === m ? "var(--accent-blue)" : "var(--text-secondary)",
                fontWeight: mode === m ? 600 : 400,
                cursor: "pointer", fontSize: 14, transition: "all 0.2s",
              }}>
              {m === "countdown" ? "⏱ 倒计时" : "⏰ 指定时间"}
            </button>
          ))}
        </div>
      </div>

      {/* ── 动态内容区：切换 mode 时只这里重绘 ── */}
      <div className="section-anim" key={`mode-${modeKey}`}>
        {mode === "countdown" ? (
          <>
            <div className="presets">
              {COUNTDOWN_PRESETS.map((p) => (
                <button key={p.label} className="preset-btn"
                  onClick={() => { setMinutes(String(p.mins)); setSeconds("0"); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="time-input-row" key={`nums-${modeKey}`}>
              <input type="number" min="0" max="999" placeholder="分" value={minutes}
                onChange={(e) => setMinutes(e.target.value)} className="num-anim" />
              <span>分</span>
              <input type="number" min="0" max="59" placeholder="秒" value={seconds}
                onChange={(e) => setSeconds(e.target.value)} className="num-anim" />
              <span>秒</span>
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
              {repeatType === "none" ? "选择日期和时间" : "选择时间"}
            </div>
            {repeatType === "none" ? (
              <input type="datetime-local" value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: 14, background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: 8, color: "var(--text-primary)" }} />
            ) : (
              <input type="time" value={scheduledAt.slice(11, 16)}
                onChange={(e) => setScheduledAt(`2000-01-01T${e.target.value}`)}
                style={{ width: "100%", padding: "10px 12px", fontSize: 14, background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: 8, color: "var(--text-primary)" }} />
            )}
          </div>
        )}
      </div>

      {/* 重复规则 — 指定时间不显示"间隔" */}
      <div className="section-anim">
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--text-secondary)" }}>重复</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {(mode === "countdown"
            ? [{key:"none",label:"不重复"},{key:"interval",label:"间隔"},{key:"daily",label:"每天"},{key:"weekdays",label:"工作日"},{key:"weekly",label:"每周"},{key:"monthly",label:"每月"}]
            : [{key:"none",label:"不重复"},{key:"daily",label:"每天"},{key:"weekdays",label:"工作日"},{key:"weekly",label:"每周"},{key:"monthly",label:"每月"}]
          ).map((r) => (
            <button key={r.key} onClick={() => setRepeatType(r.key as RepeatType)}
              style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid var(--border-color)", background: repeatType === r.key ? "var(--accent-blue)" : "transparent", color: repeatType === r.key ? "#fff" : "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 重复规则详情 — 动态 */}
      <div key={`rp-${repeatType}`} className="section-anim">
        {repeatType === "interval" && (
          <div style={{ marginBottom: 12 }}>
            <div className="presets">
              {INTERVAL_PRESETS.map((p) => (
                <button key={p.label} className="preset-btn" onClick={() => setIntervalMin(String(p.mins))}
                  style={parseInt(intervalMin) === p.mins ? { background: "var(--accent-green-transparent)", borderColor: "var(--accent-green)", color: "var(--accent-green)" } : {}}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="time-input-row">
              <input type="number" min="1" max="999" placeholder="间隔" value={intervalMin}
                onChange={(e) => setIntervalMin(e.target.value)} className="num-anim" />
              <span>分钟</span>
            </div>
          </div>
        )}
        {repeatType === "weekly" && (
          <div className="time-input-row" style={{ marginBottom: 12 }}>
            <span>选择星期：</span>
            <select value={weekDay} onChange={(e) => setWeekDay(Number(e.target.value))}
              style={{ padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: 8, color: "var(--text-primary)", fontSize: 14 }}>
              {WEEK_DAYS.map((d, i) => <option key={i} value={i+1}>{d}</option>)}
            </select>
          </div>
        )}
        {repeatType === "monthly" && (
          <div className="time-input-row" style={{ marginBottom: 12 }}>
            <span>每月</span>
            <input type="number" min="1" max="28" value={monthDay}
              onChange={(e) => setMonthDay(Number(e.target.value))} className="num-anim"
              style={{ width: 72, padding: 8, background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: 8, color: "var(--text-primary)", fontSize: 14, textAlign: "center" }} />
            <span>号</span>
          </div>
        )}
      </div>

      {/* 分类 — 静态 */}
      <div className="section-anim">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={category !== cat ? "btn-bounce" : ""}
              style={{ padding: "4px 12px", borderRadius: 12, border: `1px solid ${category === cat ? CAT_COLORS[cat] : "var(--border-color)"}`, background: category === cat ? `${CAT_COLORS[cat]}33` : "transparent", color: category === cat ? CAT_COLORS[cat] : "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 动作 — 静态 */}
      <div className="section-anim">
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--text-secondary)" }}>执行动作</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {(["none","shutdown","open","script"] as ActionType[]).map((t) => (
            <button key={t} onClick={() => { setActionType(t); setActionPath(""); }}
              style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid var(--border-color)", background: actionType === t ? "var(--accent-purple)" : "transparent", color: actionType === t ? "#fff" : "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
              {t === "none" ? "无操作" : t === "shutdown" ? "🖥️关机" : t === "open" ? "📂打开" : "▶脚本"}
            </button>
          ))}
        </div>
      </div>

      {/* 动作详情 — 动态 */}
      <div key={`act-${actionType}`} className="section-anim">
        {(actionType === "open" || actionType === "script") && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="text" placeholder="选择文件..." value={actionPath} readOnly
              style={{ flex: 1, padding: "8px 12px", fontSize: 12, background: "var(--bg-input)", border: "1px solid var(--border-color)", borderRadius: 8, color: "var(--text-primary)" }} />
            <button onClick={handlePickFile}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--accent-blue)", background: "transparent", color: "var(--accent-blue)", cursor: "pointer", fontSize: 12 }}>📁 选择</button>
          </div>
        )}
        {actionType === "shutdown" && (
          <div style={{ fontSize: 11, color: "var(--accent-orange)", marginBottom: 12 }}>⚠️ 触发 30 秒后关机，可运行 shutdown /a 取消</div>
        )}
      </div>

      {/* 持续提醒 — 静态 */}
      <div className="section-anim">
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)}
            style={{ accentColor: "var(--accent-blue)" }} />
          持续提醒（到点重复通知，直到手动确认）
        </label>
      </div>

      {/* 创建按钮 — 静态 */}
      <div className="section-anim">
        <button className="btn btn-primary" onClick={handleCreate} disabled={loading}
          style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
          {loading ? "⏳ 创建中..." : `🚀 创建${repeatType !== "none" ? "循环" : ""}任务`}
        </button>
      </div>
    </div>
  );
}
