import { useState, useCallback } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import TaskList from "./components/TaskList";

type Tab = "single" | "repeating" | "list";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="container">
      <div className="header">
        <h1>⏱ TimerMaster</h1>
        <p>定时提醒 · 守护健康</p>
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
