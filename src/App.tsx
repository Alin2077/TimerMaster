import { useState, useCallback, useEffect } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import RunningTimers from "./components/RunningTimers";
import TaskList from "./components/TaskList";
import Stats from "./components/Stats";
import Settings from "./components/Settings";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

type Tab = "single" | "repeating" | "running" | "list" | "stats" | "settings";
const RELEASES_URL = "https://github.com/Alin2077/TimerMaster/releases/latest";
// 加时间戳绕过缓存，确保拿到最新版本
const UPDATER_CDN = "https://cdn.jsdelivr.net/gh/Alin2077/TimerMaster@master/updater.json";

function parseVersion(v: string): number[] {
  return v.replace(/^v/, "").split(".").map(Number);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const na = a[i] || 0;
    const nb = b[i] || 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [refreshKey, setRefreshKey] = useState(0);
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("2.0.0"));
    // 从 localStorage 恢复主题
    const saved = localStorage.getItem("timermaster-theme");
    if (saved === "light") {
      setTheme("light");
      document.body.className = "light";
    }
  }, []);

  const handleThemeChange = useCallback((t: "dark" | "light") => {
    setTheme(t);
    document.body.className = t === "light" ? "light" : "";
  }, []);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateMsg("检查中...");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      // 尝试 CDN（加时间戳防缓存）
      const cdnUrl = UPDATER_CDN + "?t=" + Date.now();
      let res = await fetch(cdnUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();
      let latestVer = data.version;
      const currentVer = version.replace(/^v/, "");

      // 如果 CDN 版本太旧，换 raw GitHub 再试
      if (!isNewer(latestVer, currentVer)) {
        const rawUrl = "https://raw.githubusercontent.com/Alin2077/TimerMaster/master/updater.json" + "?t=" + Date.now();
        const res2 = await fetch(rawUrl, { signal: controller.signal });
        if (res2.ok) {
          const data2 = await res2.json();
          latestVer = data2.version;
        }
      }

      clearTimeout(timeoutId);

      if (isNewer(latestVer, currentVer)) {
        setUpdateMsg(`发现新版本 v${latestVer}，正在打开下载页面...`);
        window.open(RELEASES_URL, "_blank");
      } else {
        setUpdateMsg(`✓ 已是最新版本 (v${currentVer})`);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setUpdateMsg("检查超时，请稍后重试");
      } else {
        setUpdateMsg("检查失败，请检查网络连接");
      }
    } finally {
      setChecking(false);
    }
  }, [version]);

  const handleMinimizeToTray = useCallback(async () => {
    try {
      await invoke("minimize_to_tray");
    } catch (e) {
      console.error("Failed to hide window:", e);
    }
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "single", label: "⏱ 单次" },
    { key: "repeating", label: "🔄 重复" },
    { key: "running", label: "🎯 计时" },
    { key: "list", label: "📋 列表" },
    { key: "stats", label: "📊 统计" },
    { key: "settings", label: "⚙️ 设置" },
  ];

  return (
    <div className="container">
      <div className="header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>⏱ TimerMaster</h1>
            <p>定时提醒 · 守护健康</p>
          </div>
          <button
            onClick={handleMinimizeToTray}
            title="最小化到系统托盘"
            style={{
              padding: "6px 10px",
              background: "transparent",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
              marginTop: 2,
            }}
          >
            🔽
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>v{version}</span>
          <button
            onClick={handleCheckUpdate}
            disabled={checking}
            style={{
              padding: "3px 12px",
              background: "transparent",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              color: "var(--text-secondary)",
              fontSize: 12,
              cursor: checking ? "not-allowed" : "pointer",
            }}
          >
            {checking ? "🔍 检查中..." : "🔄 检查更新"}
          </button>
        </div>
        {updateMsg && (
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
            {updateMsg}
          </div>
        )}
      </div>

      <div className="tabs" style={{ display: "flex", flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
            style={{ flex: tab.key === "settings" ? 1 : 1, minWidth: 0 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "single" && (
        <SingleTimer onTaskCreated={handleTaskCreated} />
      )}
      {activeTab === "repeating" && (
        <RepeatingReminder onTaskCreated={handleTaskCreated} />
      )}
      {activeTab === "running" && <RunningTimers key={refreshKey} />}
      {activeTab === "list" && <TaskList key={refreshKey} />}
      {activeTab === "stats" && <Stats key={refreshKey} />}
      {activeTab === "settings" && (
        <Settings theme={theme} onThemeChange={handleThemeChange} />
      )}

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>
        <p>关闭窗口 = 最小化到托盘 · 定时任务持续运行</p>
        <p>快捷键 Ctrl+Shift+T 切换窗口</p>
      </div>
    </div>
  );
}
