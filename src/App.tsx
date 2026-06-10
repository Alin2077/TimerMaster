import { useState, useCallback, useEffect, useRef } from "react";
import CreateTask from "./components/CreateTask";
import RunningTimers from "./components/RunningTimers";
import TaskList from "./components/TaskList";
import Stats from "./components/Stats";
import Settings from "./components/Settings";
import { ToastProvider, useToast } from "./components/Toast";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";

type Tab = "create" | "running" | "list" | "stats" | "settings";

/** 更新状态：null=无更新，pending=可下载，ready=已下载可安装，downloading=下载中，error=失败 */
type UpdateState = {
  version: string;
  status: "pending" | "ready" | "downloading" | "error";
  progress?: number;
} | null;

function AppContent() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const [refreshKey, setRefreshKey] = useState(0);
  const [version, setVersion] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
const [checkingManual, setCheckingManual] = useState(false);

  // 更新相关
  const updateObjRef = useRef<any>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(null);
  const checkingRef = useRef(false);

  // ── 初始化 ──
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("4.8.0"));
    const saved = localStorage.getItem("timermaster-theme");
    if (saved === "light") { setTheme("light"); document.body.className = "light"; }
  }, []);

  // ── 开机后静默检测更新 ──
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!checkingRef.current) {
        checkingRef.current = true;
        check().then((update) => {
          if (update) {
            updateObjRef.current = update;
            setUpdateState({ version: update.version, status: "pending" });
          }
        }).catch(() => {
          // 网络不佳，静默忽略
        }).finally(() => {
          checkingRef.current = false;
        });
      }
    }, 4000); // 启动后 4 秒再检查，不抢首屏
    return () => clearTimeout(timer);
  }, []);

  // ── 监听更新进度事件 ──
  useEffect(() => {
    const unlisten = listen<{ status: string; detail?: string; progress?: number }>(
      "tauri://update-status", (ev) => {
        const p = ev.payload;
        switch (p.status) {
          case "DOWNLOADING":
            setUpdateState((s) => s ? { ...s, status: "downloading", progress: p.progress || 0 } : s);
            break;
          case "DOWNLOADED":
            setUpdateState((s) => s ? { ...s, status: "ready", progress: 100 } : s);
            break;
          case "INSTALLING":
            setUpdateState((s) => s ? { ...s, status: "downloading", progress: 99, version: s.version + " 安装中..." } : s);
            break;
          case "ERROR":
            setUpdateState((s) => s ? { ...s, status: "error", progress: 0 } : s);
            break;
        }
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // ── 安装更新（在软件内下载，显示进度）──
  const handleInstallUpdate = useCallback(async () => {
    const upd = updateObjRef.current;
    if (!upd || updateState?.status !== "pending") return;

    setUpdateState((s) => s ? { ...s, status: "downloading", progress: 0 } : s);
    toast("开始下载...", "info");

    try {
      const version = upd.version;
      const url = `https://github.com/Alin2077/TimerMaster/releases/download/v${version}/TimerMaster_${version}_x64-setup.exe`;

      // 用 fetch 流式下载，实时更新进度
      const res = await fetch(url);
      const total = Number(res.headers.get("content-length") || 0);
      const reader = res.body!.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) {
          const pct = Math.round((received / total) * 100);
          setUpdateState((s) => s ? { ...s, progress: pct } : s);
        }
      }

      // 创建下载
      const blob = new Blob(chunks as BlobPart[], { type: "application/x-msdownload" });
      const blobUrl = URL.createObjectURL(blob);

      // 用 window.location 直接导航到 blob URL 触发下载
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `TimerMaster_${version}_x64-setup.exe`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();

      // 延迟清理，确保浏览器已打开下载对话框
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 5000);

      setUpdateState((s) => s ? { ...s, status: "ready", progress: 100 } : s);
      setTimeout(() => setUpdateState(null), 10000);
      toast("✅ 下载完成！浏览器弹出保存对话框", "success");
    } catch (e) {
      console.error("Download failed:", e);
      setUpdateState((s) => s ? { ...s, status: "error" } : s);
      toast("下载失败，可手动去 GitHub 下载", "error");
    }
  }, [updateState, toast]);

  // ── 手动检查更新 ──
  const handleManualCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setCheckingManual(true);
    try {
      const upd = await check();
      if (upd) {
        updateObjRef.current = upd;
        setUpdateState({ version: upd.version, status: "pending" });
        toast(`发现新版本 v${upd.version}`, "info");
      } else {
        toast("✓ 已是最新版本", "success");
      }
    } catch {
      toast("检查失败，请检查网络", "error");
    } finally {
      checkingRef.current = false;
      setCheckingManual(false);
    }
  }, [toast]);

  const handleThemeChange = useCallback((t: "dark" | "light") => {
    setTheme(t); document.body.className = t === "light" ? "light" : "";
  }, []);

  const handleTaskCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setActiveTab("running");
    toast("✅ 任务已创建", "success");
  }, [toast]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "create", label: "➕ 新建" },
    { key: "running", label: "🎯 计时中" },
    { key: "list", label: "📋 列表" },
    { key: "stats", label: "📊 统计" },
    { key: "settings", label: "⚙️ 设置" },
  ];

  // 更新按钮的显示
  let updateBadge: { text: string; color: string; onClick: () => void } | null = null;
  if (updateState) {
    switch (updateState.status) {
      case "pending":
        updateBadge = { text: `⬇️ v${updateState.version} 下载`, color: "var(--accent-blue)", onClick: handleInstallUpdate };
        break;
      case "downloading":
        updateBadge = { text: `⏳ ${updateState.progress || 0}%`, color: "var(--accent-orange)", onClick: () => {} };
        break;
      case "ready":
        updateBadge = { text: `✅ 已下载，请安装`, color: "var(--accent-green)", onClick: () => {} };
        break;
      case "error":
        updateBadge = { text: `⚠️ 下载失败`, color: "var(--accent-orange)", onClick: handleManualCheck };
        break;
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>⏱ TimerMaster</h1>
            <p>定时提醒 · 守护健康</p>
          </div>
          {/* 关闭窗口自动最小化到托盘，不需单独按钮 */}
        </div>

        {/* 版本号 + 更新状态 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>v{version}</span>

          {updateBadge ? (
            <button onClick={updateBadge.onClick} disabled={updateState?.status === "downloading"}
              style={{
                padding: "3px 12px", borderRadius: 12, border: "none",
                background: updateBadge.color, color: "#fff", fontSize: 11,
                cursor: updateState?.status === "downloading" ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}>
              {updateBadge.text}
            </button>
          ) : (
            <button onClick={handleManualCheck} disabled={checkingManual}
              style={{ padding: "3px 10px", background: "transparent", border: "1px solid var(--border-color)", borderRadius: 6, color: "var(--text-secondary)", fontSize: 11, cursor: checkingManual ? "not-allowed" : "pointer", opacity: checkingManual ? 0.6 : 1 }}>
              {checkingManual ? "🔍 检查中" : "🔄 检查"}
            </button>
          )}
        </div>
      </div>

      <div className="tabs" style={{ display: "flex" }}>
        {tabs.map((tab) => (
          <button key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, fontSize: 13, padding: "8px 0" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "create" && <CreateTask onTaskCreated={handleTaskCreated} />}
      {activeTab === "running" && <RunningTimers key={refreshKey} />}
      {activeTab === "list" && <TaskList key={refreshKey} />}
      {activeTab === "stats" && <Stats key={refreshKey} />}
      {activeTab === "settings" && <Settings theme={theme} onThemeChange={handleThemeChange} />}

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>
        <p>关闭窗口 = 最小化托盘 · 快捷键 Ctrl+Shift+T · 后台自动检查更新</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
