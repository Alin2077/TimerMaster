import { useState, useCallback } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import TaskList from "./components/TaskList";
import { check } from "@tauri-apps/plugin-updater";

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
        console.log("New version available:", update.version);
        // The built-in dialog will handle the user interaction
        // If dialog:true, it auto-shows a prompt
        await update.downloadAndInstall();
      }
    } catch (e) {
      console.log("No update available or check failed:", e);
    } finally {
      setUpdating(false);
    }
  }, []);

  return (
    <div className="container">
      <div className="header">
        <h1>⏱ TimerMaster</h1>
        <p>定时提醒 · 守护健康</p>
        <button
          onClick={handleCheckUpdate}
          disabled={updating}
          style={{
            marginTop: 8,
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
    </div>
  );
}
