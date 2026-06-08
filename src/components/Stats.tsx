import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CategoryStat {
  category: string;
  total: number;
  completed: number;
}

interface TaskStats {
  total: number;
  completed: number;
  cancelled: number;
  running: number;
  completion_rate: number;
  by_category: CategoryStat[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "未分类": "var(--accent-blue)",
  "工作": "var(--accent-orange)",
  "休息": "var(--accent-green)",
  "吃药": "var(--accent-red)",
};

function getCatColor(cat: string): string {
  return CATEGORY_COLORS[cat] || "var(--accent-purple)";
}

export default function Stats() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const result = await invoke<TaskStats>("get_stats");
      setStats(result);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">📊 统计</div>
        <div className="empty-state"><p>加载中...</p></div>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="card">
        <div className="card-title">📊 统计</div>
        <div className="empty-state">
          <div className="emoji">📈</div>
          <p>暂无数据</p>
          <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
            创建定时任务后，这里会显示完成统计
          </p>
        </div>
      </div>
    );
  }

  const rate = Math.round(stats.completion_rate);

  return (
    <div className="card">
      <div className="card-title">📊 统计</div>

      {/* 总览 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "var(--bg-input)",
            borderRadius: 12,
            padding: "12px 8px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-blue)" }}>
            {stats.total}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            总任务
          </div>
        </div>
        <div
          style={{
            background: "var(--bg-input)",
            borderRadius: 12,
            padding: "12px 8px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-green)" }}>
            {stats.completed}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            已完成
          </div>
        </div>
        <div
          style={{
            background: "var(--bg-input)",
            borderRadius: 12,
            padding: "12px 8px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-orange)" }}>
            {stats.running}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            运行中
          </div>
        </div>
      </div>

      {/* 完成率环形图 */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r="50"
              fill="none"
              stroke="var(--bg-input)"
              strokeWidth="10"
            />
            <circle
              cx="60" cy="60" r="50"
              fill="none"
              stroke={rate > 50 ? "var(--accent-green)" : "var(--accent-orange)"}
              strokeWidth="10"
              strokeDasharray={`${rate * 3.14} 314`}
              strokeLinecap="round"
              transform="rotate(-90, 60, 60)"
              style={{ transition: "stroke-dasharray 0.5s" }}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {rate}%
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          完成率
        </div>
      </div>

      {/* 分类统计 */}
      {stats.by_category.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            分类统计
          </div>
          {stats.by_category.map((cat) => {
            const catRate = cat.total > 0
              ? Math.round((cat.completed / cat.total) * 100)
              : 0;
            return (
              <div key={cat.category} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span>
                    <span style={{ color: getCatColor(cat.category) }}>●</span>{" "}
                    {cat.category}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {cat.completed}/{cat.total}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--bg-input)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${catRate}%`,
                      background: getCatColor(cat.category),
                      borderRadius: 3,
                      transition: "width 0.5s",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
