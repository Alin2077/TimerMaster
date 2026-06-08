import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SettingsProps {
  theme: "dark" | "light";
  onThemeChange: (t: "dark" | "light") => void;
}

export default function Settings({ theme, onThemeChange }: SettingsProps) {
  const [onTop, setOnTop] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // 读取保存的主题偏好
    const savedTheme = localStorage.getItem("timermaster-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      onThemeChange(savedTheme);
    }
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
      // 通过 Blob 下载
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

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 窗口置顶 */}
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
            <div style={{ fontWeight: 500 }}>窗口置顶</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              保持窗口在其他应用之上
            </div>
          </div>
          <button
            onClick={handleToggleOnTop}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              border: "none",
              background: onTop ? "var(--accent-green)" : "#555",
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
                left: onTop ? 24 : 2,
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* 主题切换 */}
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
            <div style={{ fontWeight: 500 }}>界面主题</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              当前：{theme === "dark" ? "深色🌙" : "浅色☀️"}
            </div>
          </div>
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
        </div>

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 0",
          }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>数据导出</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              导出任务记录为 JSON 文件
            </div>
          </div>
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
        </div>

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
