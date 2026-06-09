import { useState, useCallback, useEffect, useRef } from "react";
import SingleTimer from "./components/SingleTimer";
import RepeatingReminder from "./components/RepeatingReminder";
import RunningTimers from "./components/RunningTimers";
import TaskList from "./components/TaskList";
import Stats from "./components/Stats";
import Settings from "./components/Settings";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";

type Tab = "single" | "repeating" | "running" | "list" | "stats" | "settings";

interface UpdateProgress {
  visible: boolean;
  status: string;
  detail: string;
  progress: number; // 0-100
  error: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [refreshKey, setRefreshKey] = useState(0);
  const [version, setVersion] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateProg, setUpdateProg] = useState<UpdateProgress>({
    visible: false, status: "", detail: "", progress: 0, error: false,
  });
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const checkingRef = useRef(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("3.0.0"));
    const saved = localStorage.getItem("timermaster-theme");
    if (saved === "light") {
      setTheme("light");
      document.body.className = "light";
    }
  }, []);

  // 监听更新进度事件
  useEffect(() => {
    const unlisten = listen<{ status: string; detail?: string; progress?: number }>(
      "tauri://update-status",
      (ev) => {
        const payload = ev.payload;
        console.log("Updater event:", payload);
        switch (payload.status) {
          case "CHECKING":
            setUpdateProg((p) => ({ ...p, status: "检查更新...", detail: "", progress: 10 }));
            break;
          case "DOWNLOADING":
            setUpdateProg((p) => ({
              ...p,
              status: "正在下载...",
              detail: payload.detail
                ? `${(+payload.detail / 1024 / 1024).toFixed(1)} MB`
                : "",
              progress: payload.progress || 0,
            }));
            break;
          case "DOWNLOADED":
            setUpdateProg((p) => ({
              ...p, status: "下载完成", detail: "正在准备安装...", progress: 95,
            }));
            break;
          case "INSTALLING":
            setUpdateProg((p) => ({
              ...p, status: "正在安装...", detail: "", progress: 98,
            }));
            break;
          case "DONE":
            setUpdateProg((p) => ({
              ...p, status: "更新完成！", detail: "应用将自动重启", progress: 100,
            }));
            setTimeout(() => setUpdateProg((p) => ({ ...p, visible: false })), 2000);
            break;
          case "ERROR":
            setUpdateProg((p) => ({
              ...p, status: "更新失败", detail: payload.detail || "请稍后重试",
              progress: 0, error: true,
            }));
            break;
        }
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    setUpdateMsg("检查中...");
    setUpdateProg({ visible: true, status: "检查更新...", detail: "", progress: 5, error: false });

    try {
      const update = await check();

      if (!update) {
        setUpdateProg((p) => ({ ...p, visible: false }));
        setUpdateMsg(`✓ 已是最新版本 (v${version})`);
        checkingRef.current = false;
        return;
      }

      setUpdateProg((p) => ({
        ...p,
        status: `发现新版本 v${update.version}`,
        detail: "开始下载...",
        progress: 15,
      }));
      setUpdateMsg(`发现新版本 v${update.version}，正在下载...`);

      await update.downloadAndInstall();

      setUpdateMsg(`✅ 更新完成 (v${update.version})`);
    } catch (e: any) {
      console.error("Update error:", e);
      setUpdateProg((p) => ({
        ...p, visible: false, status: "更新失败", detail: String(e?.message || e), error: true,
      }));
      setUpdateMsg("更新失败，请稍后再试");
    } finally {
      checkingRef.current = false;
    }
  }, [version]);

  const handleThemeChange = useCallback((t: "dark" | "light") => {
    setTheme(t);
    document.body.className = t === "light" ? "light" : "";
  }, []);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleMinimizeToTray = useCallback(async () => {
    try { await invoke("minimize_to_tray"); } catch (_) {}
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
          <button onClick={handleMinimizeToTray} title="最小化到系统托盘"
            style={{
              padding: "6px 10px", background: "transparent",
              border: "1px solid var(--border-color)", borderRadius: 8,
              color: "var(--text-secondary)", fontSize: 18,
              cursor: "pointer", lineHeight: 1, marginTop: 2,
            }}
          >🔽</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>v{version}</span>
          <button onClick={handleCheckUpdate} disabled={updateProg.visible}
            style={{
              padding: "3px 12px", background: "transparent",
              border: "1px solid var(--border-color)", borderRadius: 6,
              color: "var(--text-secondary)", fontSize: 12,
              cursor: updateProg.visible ? "not-allowed" : "pointer",
            }}
          >{updateProg.visible ? "⏳ 更新中..." : "🔄 检查更新"}</button>
        </div>
        {updateMsg && (
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
            {updateMsg}
          </div>
        )}
      </div>

      <div className="tabs" style={{ display: "flex", flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >{tab.label}</button>
        ))}
      </div>

      {activeTab === "single" && <SingleTimer onTaskCreated={handleTaskCreated} />}
      {activeTab === "repeating" && <RepeatingReminder onTaskCreated={handleTaskCreated} />}
      {activeTab === "running" && <RunningTimers key={refreshKey} />}
      {activeTab === "list" && <TaskList key={refreshKey} />}
      {activeTab === "stats" && <Stats key={refreshKey} />}
      {activeTab === "settings" && <Settings theme={theme} onThemeChange={handleThemeChange} />}

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>
        <p>关闭窗口 = 最小化到托盘 · 快捷键 Ctrl+Shift+T 切换</p>
      </div>

      {/* ── 更新进度弹窗 ── */}
      {updateProg.visible && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)",
        }}>
          <div style={{
            background: "var(--bg-card)", borderRadius: 16, padding: "28px 24px",
            width: 320, border: "1px solid var(--border-color)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>
                {updateProg.error ? "❌" : updateProg.progress >= 100 ? "✅" : "⏳"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                {updateProg.status}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                {updateProg.detail}
              </div>
            </div>

            {/* 进度条 */}
            <div style={{
              height: 6, background: "var(--bg-input)", borderRadius: 3,
              overflow: "hidden", marginBottom: 16,
            }}>
              <div style={{
                height: "100%", width: `${updateProg.progress}%`,
                background: updateProg.error
                  ? "var(--accent-red)"
                  : "linear-gradient(90deg, var(--accent-blue), var(--accent-purple))",
                borderRadius: 3, transition: "width 0.3s",
              }} />
            </div>

            {updateProg.error && (
              <button onClick={() => setUpdateProg((p) => ({ ...p, visible: false }))}
                className="btn btn-primary"
              >关闭</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
