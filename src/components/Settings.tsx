import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

interface SettingsProps {
  theme: "dark" | "light";
  onThemeChange: (t: "dark" | "light") => void;
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 48,
        height: 26,
        borderRadius: 13,
        border: "none",
        background: value ? "var(--accent-green)" : "#555",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          background: "#fff",
          position: "absolute",
          top: 2,
          left: value ? 24 : 2,
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

export default function Settings({ theme, onThemeChange }: SettingsProps) {
  const [onTop, setOnTop] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("timermaster-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      onThemeChange(savedTheme);
    }
    // 读取开机自启状态
    isEnabled().then(setAutoStart).catch(() => {});
  }, []);

  const handleToggleOnTop = useCallback(async () => {
    const newVal = !onTop;
    setOnTop(newVal);
    try {
      await invoke("set_always_on_top", { onTop: newVal });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to set always on top:", e);
    }
  }, [onTop]);

  const handleAutoStartToggle = useCallback(async () => {
    const newVal = !autoStart;
    setAutoStart(newVal);
    try {
      if (newVal) await enable();
      else await disable();
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
      setAutoStart(!newVal);
    }
  }, [autoStart]);

  const handleThemeToggle = useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    onThemeChange(newTheme);
    localStorage.setItem("timermaster-theme", newTheme);
    document.body.className = newTheme === "light" ? "light" : "";
  }, [theme, onThemeChange]);

  const handleExport = useCallback(async () => {
    try {
      const data = await invoke("export_data");
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TimerMaster_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    }
  }, []);

  return (
    <div className="card">
      <div className="card-title">⚙️ 设置</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* 开机自启 */}
        <SettingRow
          title="开机自启"
          desc="电脑启动时自动运行 TimerMaster"
        >
          <Toggle value={autoStart} onChange={handleAutoStartToggle} />
        </SettingRow>

        {/* 窗口置顶 */}
        <SettingRow
          title="窗口置顶"
          desc="保持窗口在其他应用之上"
        >
          <Toggle value={onTop} onChange={handleToggleOnTop} />
        </SettingRow>

        {/* 主题切换 */}
        <SettingRow
          title="界面主题"
          desc={`当前：${theme === "dark" ? "深色🌙" : "浅色☀️"}`}
        >
          <button
            onClick={handleThemeToggle}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {theme === "dark" ? "☀️ 浅色" : "🌙 深色"}
          </button>
        </SettingRow>

        {/* 全局快捷键 */}
        <div
          style={{
            padding: "12px 0",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>全局快捷键</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <code
              style={{
                background: "var(--bg-input)",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--accent-blue)",
              }}
            >
              Ctrl + Shift + T
            </code>
            <span style={{ marginLeft: 6 }}>切换显示/隐藏窗口</span>
          </div>
        </div>

        {/* 数据导出 */}
        <SettingRow
          title="数据导出"
          desc="导出任务记录为 JSON 文件"
        >
          <button
            onClick={handleExport}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1px solid var(--accent-blue)",
              background: "transparent",
              color: "var(--accent-blue)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            📥 导出
          </button>
        </SettingRow>

        {saved && (
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--accent-green)",
              padding: 4,
            }}
          >
            ✓ 已保存
          </div>
        )}
      </div>
    </div>
  );
}

function SettingRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 0",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      <div>
        <div style={{ fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
          {desc}
        </div>
      </div>
      {children}
    </div>
  );
}
