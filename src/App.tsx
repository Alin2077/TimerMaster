import { useState, useCallback } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import TaskList from "./components/TaskList";
import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";

type Tab = "single" | "repeating" | "list";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [refreshKey, setRefreshKey] = useState(0);
  const [updating, setUpdating] = useState(false);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
      }
    } catch (e) {
      console.log("No update available or check failed:", e);
    } finally {
      setUpdating(false);
    }
  }, []);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            }}
          >
            🔽
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
          <button
            onClick={handleCheckUpdate}
            disabled={updating}
            style={{
              padding: "4px 14px",
              background: "transparent",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#888",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {updating ? "🔍 检查中..." : "🔄 检查更新"}
          </button>
        </div>
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
