import { useState, useCallback, useEffect } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import TaskList from "./components/TaskList";
import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

type Tab = "single" | "repeating" | "list";

// GitHub 在国内访问较慢，超时设长一些
const TIMEOUT_SECS = 30;

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [refreshKey, setRefreshKey] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [version, setVersion] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("1.0.2"));
  }, []);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateMsg("检查中...");

    // 超时保护——避免请求卡死
    const timeout = setTimeout(() => {
      setUpdating(false);
      setUpdateMsg("检查超时，请检查网络后重试");
    }, TIMEOUT_SECS * 1000);

    try {
      const update = await check();
      clearTimeout(timeout);

      if (update) {
        setUpdateMsg(`发现新版本 ${update.version}，开始下载...`);
        await update.downloadAndInstall();
      } else {
        setUpdateMsg(`✓ 已是最新版本 (v${version})`);
      }
    } catch (e) {
      clearTimeout(timeout);
      setUpdateMsg("检查失败，请检查网络连接");
      console.error("Update check failed:", e);
    } finally {
      setUpdating(false);
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
            disabled={updating}
            style={{
              padding: "3px 12px",
              background: "transparent",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#888",
              fontSize: 12,
              cursor: updating ? "not-allowed" : "pointer",
            }}
          >
            {updating ? "🔍 检查中..." : "🔄 检查更新"}
          </button>
        </div>
        {updateMsg && (
          <div style={{ textAlign: "center", fontSize: 11, color: "#999", marginTop: 2 }}>
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
      {activeTab === "list" && <TaskList key={refreshKey} />}

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#444" }}>
        <p>关闭窗口 = 最小化到托盘 · 定时任务持续运行</p>
        <p>点击系统托盘图标可重新显示窗口</p>
      </div>
    </div>
  );
}
