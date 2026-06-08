import { useState, useCallback, useEffect } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import RunningTimers from "./components/RunningTimers";
import TaskList from "./components/TaskList";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

type Tab = "single" | "repeating" | "running" | "list";

const RELEASES_URL = "https://github.com/Alin2077/TimerMaster/releases/latest";
// jsDelivr CDN — 国内访问快，不需要翻墙
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

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("1.0.5"));
  }, []);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateMsg("检查中...");

    try {
      // 用 AbortController 实现超时（15秒）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(UPDATER_CDN, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const latestVer = data.version;
      const currentVer = version.replace(/^v/, "");

      console.log(`Current: v${currentVer}, Latest: v${latestVer}`);

      if (isNewer(latestVer, currentVer)) {
        setUpdateMsg(`发现新版本 v${latestVer}，正在打开下载页面...`);
        // 打开浏览器到 Releases 页面
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
      console.error("Update check error:", e);
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
              border: "1px solid #444",
              borderRadius: 8,
              color: "#888",
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
          <span style={{ fontSize: 12, color: "#666" }}>v{version}</span>
          <button
            onClick={handleCheckUpdate}
            disabled={checking}
            style={{
              padding: "3px 12px",
              background: "transparent",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#888",
              fontSize: 12,
              cursor: checking ? "not-allowed" : "pointer",
            }}
          >
            {checking ? "🔍 检查中..." : "🔄 检查更新"}
          </button>
        </div>
        {updateMsg && (
          <div style={{ textAlign: "center", fontSize: 11, color: "#999", marginTop: 4 }}>
            {updateMsg}
          </div>
        )}
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === "single" ? "active" : ""}`}
          onClick={() => setActiveTab("single")}
        >
          ⏱ 单次
        </button>
        <button
          className={`tab-btn ${activeTab === "repeating" ? "active" : ""}`}
          onClick={() => setActiveTab("repeating")}
        >
          🔄 重复
        </button>
        <button
          className={`tab-btn ${activeTab === "running" ? "active" : ""}`}
          onClick={() => setActiveTab("running")}
        >
          🎯 计时中
        </button>
        <button
          className={`tab-btn ${activeTab === "list" ? "active" : ""}`}
          onClick={() => setActiveTab("list")}
        >
          📋 列表
        </button>
      </div>

      {activeTab === "single" && (
        <SingleTimer onTaskCreated={handleTaskCreated} />
      )}
      {activeTab === "repeating" && (
        <RepeatingReminder onTaskCreated={handleTaskCreated} />
      )}
      {activeTab === "running" && <RunningTimers key={refreshKey} />}
      {activeTab === "list" && <TaskList key={refreshKey} />}

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#444" }}>
        <p>关闭窗口 = 最小化到托盘 · 定时任务持续运行</p>
        <p>点击系统托盘图标可重新显示窗口</p>
      </div>
    </div>
  );
}
